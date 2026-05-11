package proxyapi

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"os"
	"time"

	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
)

type upstreamCandidate struct {
	provider    config.Provider
	targetURL   string
	requestBody []byte
}

type resolvedProxyRequest struct {
	routeName       string
	routeType       config.ProviderType
	parts           pathParts
	group           *config.Group
	provider        *config.Provider
	targetURL       string
	cacheEligible   bool
	cacheMaxEntries int
	candidates      []upstreamCandidate
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
		logFields.Error = "未指定提供商或分组"
		writeErrorResponse(w, http.StatusBadRequest, "未指定提供商或分组")
		return resolvedProxyRequest{}, false
	}

	provider, _ := h.cfg.Provider(parts.provider)
	if provider != nil {
		logFields.ProviderType = string(provider.Type)
		targetURL := buildTargetURL(provider.Type, provider.BaseURL, parts.suffix, r.URL.RawQuery)
		if targetURL == "" {
			logFields.Status = http.StatusInternalServerError
			logFields.Error = "上游地址无效"
			writeErrorResponse(w, http.StatusInternalServerError, "上游地址无效")
			return resolvedProxyRequest{}, false
		}
		logFields.UpstreamHost, logFields.UpstreamPath = splitUpstreamURL(targetURL)
		cacheEligible := provider.CacheEnabled && !isModelDiscoveryRequest(r.Method, parts.suffix)

		return resolvedProxyRequest{
			routeName:       parts.provider,
			routeType:       provider.Type,
			parts:           parts,
			provider:        provider,
			targetURL:       targetURL,
			cacheEligible:   cacheEligible,
			cacheMaxEntries: provider.CacheMaxEntries,
			candidates: []upstreamCandidate{
				{
					provider:  *provider,
					targetURL: targetURL,
				},
			},
		}, true
	}

	group, _ := h.cfg.Group(parts.provider)
	if group == nil {
		logFields.Status = http.StatusNotFound
		logFields.Error = "提供商或分组不存在"
		writeErrorResponse(w, http.StatusNotFound, "提供商或分组不存在")
		return resolvedProxyRequest{}, false
	}
	logFields.ProviderType = string(group.Type)
	cacheEligible := group.CacheEnabled && !isModelDiscoveryRequest(r.Method, parts.suffix)

	return resolvedProxyRequest{
		routeName:       parts.provider,
		routeType:       group.Type,
		parts:           parts,
		group:           group,
		cacheEligible:   cacheEligible,
		cacheMaxEntries: group.CacheMaxEntries,
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

func (h *ProxyHandler) prepareRequestForUpstream(w http.ResponseWriter, r *http.Request, proxyReq *resolvedProxyRequest, isStream bool, logFields *proxyLogFields) (requestPreparation, bool) {
	if proxyReq.group != nil {
		return h.prepareGroupRequestForUpstream(w, r, proxyReq, isStream, logFields)
	}

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
			preparation.analysis = analyzeRequestBody(proxyReq.routeType, proxyReq.parts.suffix, requestBody, isStream)
			if !logFields.Stream {
				logFields.Stream = preparation.analysis.stream
			}
			logFields.Model = preparation.analysis.model
			preparation.upstreamBodyReader = bytes.NewReader(requestBody)

			if entry, ok := h.cache.GetForRequestByKeyContext(r.Context(), proxyReq.routeName, proxyReq.routeType, preparation.analysis.cacheKey, preparation.analysis.stream); ok {
				h.serveCacheHit(w, *proxyReq, preparation.analysis, entry, logFields)
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

func (h *ProxyHandler) prepareGroupRequestForUpstream(w http.ResponseWriter, r *http.Request, proxyReq *resolvedProxyRequest, isStream bool, logFields *proxyLogFields) (requestPreparation, bool) {
	requestBody, err := io.ReadAll(r.Body)
	if err != nil {
		logFields.Status = http.StatusBadRequest
		logFields.Error = "读取请求体失败"
		writeErrorResponse(w, http.StatusBadRequest, "读取请求体失败")
		return requestPreparation{}, false
	}

	preparation := requestPreparation{
		cacheEligible: proxyReq.cacheEligible,
	}
	preparation.analysis = analyzeRequestBody(proxyReq.routeType, proxyReq.parts.suffix, requestBody, isStream)
	if !logFields.Stream {
		logFields.Stream = preparation.analysis.stream
	}
	logFields.Model = preparation.analysis.model

	if proxyReq.parts.useCache && preparation.cacheEligible {
		if entry, ok := h.cache.GetForRequestByKeyContext(r.Context(), proxyReq.routeName, proxyReq.routeType, preparation.analysis.cacheKey, preparation.analysis.stream); ok {
			h.serveCacheHit(w, *proxyReq, preparation.analysis, entry, logFields)
			return requestPreparation{}, false
		}
	}

	candidates, err := buildGroupCandidates(*proxyReq.group, proxyReq.parts.suffix, r.URL.RawQuery, preparation.analysis.model, requestBody)
	if err != nil {
		statusCode := http.StatusBadRequest
		message := "分组请求无效"
		switch {
		case errors.Is(err, os.ErrNotExist):
			message = "分组未匹配到模型集合"
		case errors.Is(err, os.ErrInvalid):
			message = "分组配置无效"
		}
		logFields.Status = statusCode
		logFields.Error = message
		writeErrorResponse(w, statusCode, message)
		return requestPreparation{}, false
	}
	if len(candidates) == 0 {
		logFields.Status = http.StatusBadRequest
		logFields.Error = "分组未匹配到可用上游"
		writeErrorResponse(w, http.StatusBadRequest, "分组未匹配到可用上游")
		return requestPreparation{}, false
	}

	proxyReq.candidates = candidates
	proxyReq.provider = &proxyReq.candidates[0].provider
	proxyReq.targetURL = proxyReq.candidates[0].targetURL
	logFields.UpstreamHost, logFields.UpstreamPath = splitUpstreamURL(proxyReq.targetURL)
	preparation.upstreamBodyReader = bytes.NewReader(proxyReq.candidates[0].requestBody)
	return preparation, true
}

func (h *ProxyHandler) resolveUpstreamKeyForProvider(providerName string) (string, error) {
	return h.keyring.GetKey(providerName)
}

func translateUpstreamKeyError(err error) (int, string) {
	switch {
	case errors.Is(err, keyring.ErrProviderNotFound):
		return http.StatusNotFound, "提供商不存在"
	case errors.Is(err, keyring.ErrNoKeysConfigured):
		return http.StatusServiceUnavailable, "提供商未配置上游密钥"
	case errors.Is(err, keyring.ErrAllKeysExhausted):
		return http.StatusServiceUnavailable, "所有上游密钥当前不可用"
	default:
		return http.StatusServiceUnavailable, "没有可用的上游密钥"
	}
}

func (h *ProxyHandler) writeUpstreamKeyError(w http.ResponseWriter, proxyReq resolvedProxyRequest, statusCode int, message string, logFields *proxyLogFields) {
	h.stats.RecordError(proxyReq.routeName, statusCode)
	logFields.Status = statusCode
	logFields.Error = message
	writeErrorResponse(w, statusCode, message)
}
