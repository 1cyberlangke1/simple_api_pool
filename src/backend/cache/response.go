package cache

import (
	"encoding/json"
	"fmt"

	"simple-api-pool/config"
	"simple-api-pool/providerapi"
)

func PrepareCachedBodies(providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) ([]byte, []byte) {
	decorated := providerapi.DecorateCachedResponse(providerType, responseBody, inputTokens, outputTokens)
	stream, ok := providerapi.BuildCachedStreamBody(providerType, decorated)
	if !ok {
		stream = buildFallbackCachedStream(decorated)
	}
	return decorated, stream
}

func buildFallbackCachedStream(responseBody []byte) []byte {
	stream := make([]byte, 0, len(responseBody)+18)
	stream = append(stream, []byte("data: ")...)
	stream = append(stream, responseBody...)
	stream = append(stream, []byte("\n\ndata: [DONE]\n\n")...)
	return stream
}

func DecorateCachedStreamBody(providerType config.ProviderType, streamBody []byte, inputTokens, outputTokens int64) []byte {
	return providerapi.DecorateCachedStreamBody(providerType, streamBody, inputTokens, outputTokens)
}

func normalizeHeadersForCache(headers map[string]string, isStream bool) map[string]string {
	if headers == nil {
		headers = make(map[string]string)
	}
	if isStream {
		headers["Content-Type"] = "text/event-stream"
		delete(headers, "Content-Length")
		return headers
	}
	if _, ok := headers["Content-Type"]; !ok {
		headers["Content-Type"] = "application/json"
	}
	return headers
}

func formatHeadersJSON(headers map[string]string, isStream bool) ([]byte, error) {
	return json.Marshal(normalizeHeadersForCache(headers, isStream))
}

func prepareCachedNonStreamRecord(headers map[string]string, providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) (headersJSON []byte, decoratedBody []byte, err error) {
	headersJSON, err = formatHeadersJSON(cloneHeaders(headers), false)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal non-stream headers: %w", err)
	}
	decoratedBody = providerapi.DecorateCachedResponse(providerType, responseBody, inputTokens, outputTokens)
	return headersJSON, decoratedBody, nil
}

func cloneHeaders(headers map[string]string) map[string]string {
	out := make(map[string]string, len(headers))
	for k, v := range headers {
		out[k] = v
	}
	return out
}
