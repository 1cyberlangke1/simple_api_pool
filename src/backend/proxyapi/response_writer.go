package proxyapi

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"simple-api-pool/token"
)

func (h *ProxyHandler) handleUpstreamDoError(w http.ResponseWriter, proxyReq resolvedProxyRequest, upstreamProviderName, upstreamKey string, err error, logFields *proxyLogFields) {
	h.stats.RecordError(proxyReq.routeName, http.StatusBadGateway)
	h.keyring.RecordFailure(upstreamProviderName, upstreamKey)
	logFields.Status = http.StatusBadGateway
	logFields.Error = fmt.Sprintf("上游请求失败: %v", err)
	writeErrorResponse(w, http.StatusBadGateway, fmt.Sprintf("上游请求失败: %v", err))
}

func (h *ProxyHandler) handleUpstreamErrorResponse(w http.ResponseWriter, resp *http.Response, proxyReq resolvedProxyRequest, upstreamProviderName, upstreamKey string, preparation requestPreparation, logFields *proxyLogFields) {
	h.stats.RecordError(proxyReq.routeName, resp.StatusCode)
	logFields.Status = resp.StatusCode
	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	errorCapture := newLimitedLogBuffer(maxUpstreamErrorLogBytes)
	responseBytes, copyErr := io.Copy(w, io.TeeReader(resp.Body, errorCapture))
	logFields.ResponseBytes = int(responseBytes)
	logFields.Error = fmt.Sprintf("上游返回 %d", resp.StatusCode)
	if logFields.Model == "" {
		preparation.analysis = ensureCacheAnalysis(preparation.analysis, proxyReq.routeType, proxyReq.parts.suffix, preparation.recordedRequestBody)
		logFields.Model = preparation.analysis.model
	}
	errorBody := errorCapture.String()
	if errorBody != "" {
		slog.Default().Error("upstream_error_body",
			"provider", proxyReq.routeName,
			"provider_type", proxyReq.routeType,
			"path", logFields.Path,
			"upstream_path", logFields.UpstreamPath,
			"upstream_status", resp.StatusCode,
			"content_type", resp.Header.Get("Content-Type"),
			"content_encoding", resp.Header.Get("Content-Encoding"),
			"body", errorBody,
		)
	}
	if copyErr != nil {
		logFields.Error = fmt.Sprintf("透传上游错误响应失败: %v", copyErr)
	}
	if shouldRecordUpstreamFailure(resp.StatusCode) {
		h.keyring.RecordFailure(upstreamProviderName, upstreamKey)
	}
}

func (h *ProxyHandler) handleNonStreamResponse(w http.ResponseWriter, resp *http.Response, upstreamStart time.Time, proxyReq resolvedProxyRequest, upstreamProviderName, upstreamKey string, preparation requestPreparation, logFields *proxyLogFields) {
	respBody, fitsWithinLimit, err := readResponseBodyWithinLimit(resp.Body, h.nonStreamResponseLimitBytes)
	if err != nil {
		h.stats.RecordError(proxyReq.routeName, http.StatusBadGateway)
		logFields.Status = http.StatusBadGateway
		logFields.Error = err.Error()
		writeErrorResponse(w, http.StatusBadGateway, "读取上游响应失败")
		return
	}
	if !fitsWithinLimit {
		logFields.Status = resp.StatusCode
		copyHeaders(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		responseBytes, copyErr := writeBufferedPassthroughResponse(w, respBody, resp.Body, upstreamStart, logFields)
		logFields.ResponseBytes = responseBytes
		if logFields.Model == "" {
			preparation.analysis = ensureCacheAnalysis(preparation.analysis, proxyReq.routeType, proxyReq.parts.suffix, preparation.recordedRequestBody)
			logFields.Model = preparation.analysis.model
		}
		if copyErr != nil {
			logFields.Error = fmt.Sprintf("透传上游响应失败: %v", copyErr)
			return
		}
		h.stats.RecordSuccess(proxyReq.routeName, 0, 0)
		h.keyring.RecordSuccess(upstreamProviderName, upstreamKey)
		return
	}

	logFields.Status = resp.StatusCode
	logFields.ResponseBytes = len(respBody)
	if logFields.Model == "" {
		preparation.analysis = ensureCacheAnalysis(preparation.analysis, proxyReq.routeType, proxyReq.parts.suffix, preparation.recordedRequestBody)
		logFields.Model = preparation.analysis.model
	}

	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	if _, err := w.Write(respBody); err != nil {
		if isDownstreamDisconnect(nil, err) {
			logFields.Error = "客户端已断开连接"
			return
		}
		h.stats.RecordError(proxyReq.routeName, http.StatusBadGateway)
		logFields.Status = http.StatusBadGateway
		logFields.Error = fmt.Sprintf("写入客户端响应失败: %v", err)
		return
	}

	usage := token.Extract(string(proxyReq.routeType), respBody, h.cfg.TokenEstimationEnabled())
	h.stats.RecordSuccess(proxyReq.routeName, usage.InputTokens, usage.OutputTokens)
	h.stats.RecordCacheTokens(proxyReq.routeName, usage.CacheTokens)
	h.keyring.RecordSuccess(upstreamProviderName, upstreamKey)

	if !preparation.cacheEligible {
		return
	}

	preparation.analysis = ensureCacheAnalysis(preparation.analysis, proxyReq.routeType, proxyReq.parts.suffix, preparation.recordedRequestBody)
	if !preparation.analysis.cacheKeyReady {
		return
	}

	h.storeNonStreamCacheEntry(proxyReq, preparation, resp, respBody, usage.InputTokens, usage.OutputTokens)
}
