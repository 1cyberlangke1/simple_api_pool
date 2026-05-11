package proxyapi

import (
	"fmt"
	"net/http"

	"simple-api-pool/cache"
	"simple-api-pool/config"
)

func (h *ProxyHandler) serveCacheHit(w http.ResponseWriter, proxyReq resolvedProxyRequest, analysis requestAnalysis, entry *cache.Entry, logFields *proxyLogFields) {
	h.stats.RecordCacheHit(proxyReq.routeName, entry.InputTokens+entry.OutputTokens)
	logFields.CacheHit = true
	logFields.Status = entry.StatusCode
	logFields.UpstreamStatus = entry.StatusCode
	logFields.ResponseBytes = len(entry.ResponseBody)
	h.logCacheEvent(cacheEventLogFields{
		Event:         "hit",
		Provider:      proxyReq.routeName,
		ProviderType:  string(proxyReq.routeType),
		Model:         analysis.model,
		CacheKey:      analysis.cacheKey,
		CacheRoute:    proxyReq.parts.useCache,
		Stream:        analysis.stream,
		Status:        entry.StatusCode,
		RequestBytes:  analysis.requestBytes,
		ResponseBytes: len(entry.ResponseBody),
		InputTokens:   entry.InputTokens,
		OutputTokens:  entry.OutputTokens,
	})
	for key, value := range entry.Headers {
		w.Header().Set(key, value)
	}
	w.WriteHeader(entry.StatusCode)
	if _, err := w.Write(entry.ResponseBody); err != nil {
		logFields.Status = http.StatusBadGateway
		logFields.Error = fmt.Sprintf("写入缓存命中响应失败: %v", err)
	}
}

func (h *ProxyHandler) storeNonStreamCacheEntry(proxyReq resolvedProxyRequest, preparation requestPreparation, resp *http.Response, respBody []byte, inputTokens, outputTokens int64) {
	stored := h.cache.SetForRequestByKey(
		proxyReq.routeName,
		proxyReq.routeType,
		preparation.analysis.cacheKey,
		respBody,
		resp.StatusCode,
		cacheableHeaders(resp.Header, false),
		inputTokens,
		outputTokens,
		int64(proxyReq.cacheMaxEntries),
		false,
	)
	if stored {
		h.logCacheEvent(cacheEventLogFields{
			Event:         "store",
			Provider:      proxyReq.routeName,
			ProviderType:  string(proxyReq.routeType),
			Model:         preparation.analysis.model,
			CacheKey:      preparation.analysis.cacheKey,
			CacheRoute:    proxyReq.parts.useCache,
			Stream:        false,
			Status:        resp.StatusCode,
			RequestBytes:  preparation.analysis.requestBytes,
			ResponseBytes: len(respBody),
			InputTokens:   inputTokens,
			OutputTokens:  outputTokens,
		})
	}
}

func (h *ProxyHandler) storeStreamCacheEntry(provider string, providerType config.ProviderType, cacheKey string, resp *http.Response, responseBody []byte, cacheMaxEntries int64, inputTokens, outputTokens int64, analysis requestAnalysis, cacheRoute bool) {
	stored := h.cache.SetForRequestByKey(provider, providerType, cacheKey, responseBody, resp.StatusCode, cacheableHeaders(resp.Header, true), inputTokens, outputTokens, cacheMaxEntries, true)
	if stored {
		h.logCacheEvent(cacheEventLogFields{
			Event:         "store",
			Provider:      provider,
			ProviderType:  string(providerType),
			Model:         analysis.model,
			CacheKey:      cacheKey,
			CacheRoute:    cacheRoute,
			Stream:        true,
			Status:        resp.StatusCode,
			RequestBytes:  analysis.requestBytes,
			ResponseBytes: len(responseBody),
			InputTokens:   inputTokens,
			OutputTokens:  outputTokens,
		})
	}
}
