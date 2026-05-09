package proxyapi

import (
	"io"
	"net/http"
)

func (h *ProxyHandler) buildUpstreamRequest(r *http.Request, proxyReq resolvedProxyRequest, bodyReader io.Reader, upstreamKey string, logFields *proxyLogFields) (*http.Request, bool) {
	upstreamReq, err := http.NewRequestWithContext(r.Context(), r.Method, proxyReq.targetURL, bodyReader)
	if err != nil {
		h.stats.RecordError(proxyReq.parts.provider, http.StatusInternalServerError)
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "创建上游请求失败"
		return nil, false
	}

	copyHeaders(upstreamReq.Header, r.Header)
	clearClientAuth(upstreamReq, proxyReq.provider.Type)
	setAuthHeader(upstreamReq, proxyReq.provider.Type, upstreamKey)
	return upstreamReq, true
}
