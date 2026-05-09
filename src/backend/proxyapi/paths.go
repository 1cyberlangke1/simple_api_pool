package proxyapi

import (
	"net/http"
	"net/url"
	"strings"

	"simple-api-pool/config"
	"simple-api-pool/internal/proxyroute"
	"simple-api-pool/providerapi"
)

type pathParts struct {
	useCache bool
	provider string
	suffix   string
}

func parsePath(path string) pathParts {
	parts := proxyroute.ParsePath(path)
	return pathParts{
		useCache: parts.UseCache,
		provider: parts.Provider,
		suffix:   parts.Suffix,
	}
}

func buildTargetURL(providerType config.ProviderType, baseURL, suffix, rawQuery string) string {
	base, err := url.Parse(strings.TrimRight(baseURL, "/") + suffix)
	if err != nil {
		return ""
	}
	queryValues, err := url.ParseQuery(rawQuery)
	if err != nil {
		return ""
	}
	providerapi.SanitizeClientAuthQuery(queryValues, providerType)
	base.RawQuery = queryValues.Encode()
	return base.String()
}

func splitUpstreamURL(targetURL string) (string, string) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return "", ""
	}
	return parsedURL.Host, parsedURL.Path
}

func clearClientAuth(req *http.Request, providerType config.ProviderType) {
	req.Header.Del("Authorization")
	req.Header.Del("x-api-key")
	req.Header.Del("x-goog-api-key")

	queryValues := req.URL.Query()
	providerapi.SanitizeClientAuthQuery(queryValues, providerType)
	req.URL.RawQuery = queryValues.Encode()
}

func setAuthHeader(req *http.Request, providerType config.ProviderType, key string) {
	providerapi.ApplyUpstreamAuth(req, providerType, key)
}

func copyHeaders(dst, src http.Header) {
	for key, values := range src {
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func isStreamingRequestHint(r *http.Request) bool {
	if strings.Contains(r.Header.Get("Accept"), "text/event-stream") || r.URL.Query().Get("stream") == "true" {
		return true
	}
	if strings.EqualFold(r.URL.Query().Get("alt"), "sse") {
		return true
	}
	return false
}

func isStreamingResponse(headers http.Header) bool {
	return strings.Contains(strings.ToLower(headers.Get("Content-Type")), "text/event-stream")
}

func cacheFieldForProviderType(providerType config.ProviderType) string {
	return proxyroute.CacheFieldForProviderType(providerType)
}

func isModelDiscoveryRequest(method, suffix string) bool {
	return providerapi.IsModelDiscoveryRequest(method, suffix)
}

func cacheableHeaders(headers http.Header, isStream bool) map[string]string {
	outputHeaders := make(map[string]string)
	for key := range headers {
		if strings.EqualFold(key, "Content-Length") || strings.EqualFold(key, "Transfer-Encoding") {
			continue
		}
		outputHeaders[key] = headers.Get(key)
	}
	if _, ok := outputHeaders["Content-Type"]; !ok && !isStream {
		outputHeaders["Content-Type"] = "application/json"
	}
	return outputHeaders
}
