package proxyapi

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"time"

	"simple-api-pool/applog"
	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
)

type resolvedProxyRequest struct {
	parts         pathParts
	provider      *config.Provider
	targetURL     string
	cacheEligible bool
}

type requestPreparation struct {
	analysis            requestAnalysis
	upstreamBodyReader  io.Reader
	recordedRequestBody *recordedRequestBody
	cacheEligible       bool
}

func (h *ProxyHandler) authenticateClientRequest(w http.ResponseWriter, r *http.Request, logFields *proxyLogFields) bool {
	if h.limiter != nil && !h.limiter.Allow(r.RemoteAddr) {
		logFields.Status = http.StatusTooManyRequests
		logFields.Error = "鉴权失败次数过多，请稍后再试"
		writeErrorResponse(w, http.StatusTooManyRequests, "鉴权失败次数过多，请稍后再试")
		return false
	}

	if !auth.CheckClientKey(r, h.cfg) {
		if h.limiter != nil {
			h.limiter.RecordFailure(r.RemoteAddr)
		}
		logFields.Status = http.StatusUnauthorized
		logFields.Error = "未授权"
		writeErrorResponse(w, http.StatusUnauthorized, "未授权")
		return false
	}
	if h.limiter != nil {
		h.limiter.RecordSuccess(r.RemoteAddr)
	}
	return true
}

func (h *ProxyHandler) resolveProxyRequest(w http.ResponseWriter, r *http.Request, logFields *proxyLogFields) (resolvedProxyRequest, bool) {
	parts := parsePath(r.URL.Path)
	logFields.Provider = parts.provider
	logFields.CacheRoute = parts.useCache
	if parts.provider == "" {
		logFields.Status = http.StatusBadRequest
		logFields.Error = "未指定提供商"
		writeErrorResponse(w, http.StatusBadRequest, "未指定提供商")
		return resolvedProxyRequest{}, false
	}

	provider, _ := h.cfg.Provider(parts.provider)
	if provider == nil {
		logFields.Status = http.StatusNotFound
		logFields.Error = "提供商不存在"
		writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
		return resolvedProxyRequest{}, false
	}

	logFields.ProviderType = string(provider.Type)
	targetURL := buildTargetURL(provider.Type, provider.BaseURL, parts.suffix, r.URL.RawQuery)
	if targetURL == "" {
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "上游地址无效"
		writeErrorResponse(w, http.StatusInternalServerError, "上游地址无效")
		return resolvedProxyRequest{}, false
	}

	cacheEligible := provider.CacheEnabled && !isModelDiscoveryRequest(r.Method, parts.suffix)
	logFields.UpstreamHost, logFields.UpstreamPath = splitUpstreamURL(targetURL)

	return resolvedProxyRequest{
		parts:         parts,
		provider:      provider,
		targetURL:     targetURL,
		cacheEligible: cacheEligible,
	}, true
}

func (h *ProxyHandler) acquireUpstreamSlot(w http.ResponseWriter, r *http.Request, logFields *proxyLogFields) bool {
	select {
	case h.sema <- struct{}{}:
		return true
	case <-time.After(30 * time.Second):
		logFields.Status = http.StatusServiceUnavailable
		logFields.Error = "等待上游槽位超时"
		writeErrorResponse(w, http.StatusServiceUnavailable, "上游繁忙，请稍后重试")
		return false
	case <-r.Context().Done():
		logFields.Status = http.StatusRequestTimeout
		logFields.Error = "请求在等待上游槽位时已取消"
		writeErrorResponse(w, http.StatusRequestTimeout, "请求已取消")
		return false
	}
}

func (h *ProxyHandler) prepareRequestForUpstream(w http.ResponseWriter, r *http.Request, proxyReq resolvedProxyRequest, isStream bool, logFields *proxyLogFields) (requestPreparation, bool) {
	preparation := requestPreparation{
		cacheEligible: proxyReq.cacheEligible,
	}

	if proxyReq.parts.useCache && preparation.cacheEligible {
		if r.ContentLength > int64(h.cacheableRequestBodyLimit) {
			preparation.cacheEligible = false
			preparation.recordedRequestBody = newRecordedRequestBody(r.Body, 0)
			preparation.upstreamBodyReader = preparation.recordedRequestBody
			return preparation, true
		}

		requestBody, requestBodyComplete, err := readRequestBodyForCache(r.Body, h.cacheableRequestBodyLimit)
		if err != nil {
			logFields.Status = http.StatusBadRequest
			logFields.Error = "读取请求体失败"
			writeErrorResponse(w, http.StatusBadRequest, "读取请求体失败")
			return requestPreparation{}, false
		}

		preparation.analysis.requestBody = requestBody
		if requestBodyComplete {
			preparation.analysis.requestBytes = len(requestBody)
			logFields.RequestBytes = preparation.analysis.requestBytes
			preparation.analysis = analyzeRequestBody(proxyReq.provider.Type, proxyReq.parts.suffix, requestBody, isStream)
			if !logFields.Stream {
				logFields.Stream = preparation.analysis.stream
			}
			logFields.Model = preparation.analysis.model
			preparation.upstreamBodyReader = bytes.NewReader(requestBody)

			if entry, ok := h.cache.GetForRequestByKeyContext(r.Context(), proxyReq.parts.provider, proxyReq.provider.Type, preparation.analysis.cacheKey, preparation.analysis.stream); ok {
				h.serveCacheHit(w, proxyReq, preparation.analysis, entry, logFields)
				return requestPreparation{}, false
			}
			return preparation, true
		}

		preparation.cacheEligible = false
		preparation.recordedRequestBody = newRecordedRequestBody(newPrefixedReadCloser(requestBody, r.Body), 0)
		preparation.upstreamBodyReader = preparation.recordedRequestBody
		return preparation, true
	}

	copyLimit := 0
	if !proxyReq.parts.useCache || preparation.cacheEligible {
		copyLimit = h.cacheableRequestBodyLimit
	}
	preparation.recordedRequestBody = newRecordedRequestBody(r.Body, copyLimit)
	preparation.upstreamBodyReader = preparation.recordedRequestBody
	return preparation, true
}

func (h *ProxyHandler) resolveUpstreamKey(w http.ResponseWriter, proxyReq resolvedProxyRequest, logFields *proxyLogFields) (string, bool) {
	upstreamKey, err := h.keyring.GetKey(proxyReq.parts.provider)
	if err != nil {
		statusCode := http.StatusServiceUnavailable
		errMessage := "没有可用的上游密钥"
		switch {
		case errors.Is(err, keyring.ErrProviderNotFound):
			statusCode = http.StatusNotFound
			errMessage = "提供商不存在"
		case errors.Is(err, keyring.ErrNoKeysConfigured):
			errMessage = "提供商未配置上游密钥"
		case errors.Is(err, keyring.ErrAllKeysExhausted):
			errMessage = "所有上游密钥当前不可用"
		}
		h.stats.RecordError(proxyReq.parts.provider, statusCode)
		logFields.Status = statusCode
		logFields.Error = errMessage
		writeErrorResponse(w, statusCode, errMessage)
		return "", false
	}
	if upstreamKey == "" {
		h.stats.RecordError(proxyReq.parts.provider, http.StatusServiceUnavailable)
		logFields.Status = http.StatusServiceUnavailable
		logFields.Error = "没有可用的上游密钥"
		writeErrorResponse(w, http.StatusServiceUnavailable, "没有可用的上游密钥")
		return "", false
	}

	logFields.KeyRef = applog.MaskSecret(upstreamKey)
	return upstreamKey, true
}
