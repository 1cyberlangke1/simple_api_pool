package cache

import (
	"encoding/json"
	"fmt"

	"simple-api-pool/config"
)

func PrepareCachedBodies(providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) ([]byte, []byte) {
	decorated := decorateCachedResponse(providerType, responseBody, inputTokens, outputTokens)
	stream := make([]byte, 0, len(decorated)+18)
	stream = append(stream, []byte("data: ")...)
	stream = append(stream, decorated...)
	stream = append(stream, []byte("\n\ndata: [DONE]\n\n")...)
	return decorated, stream
}

func decorateCachedResponse(providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) []byte {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return append([]byte(nil), responseBody...)
	}

	totalTokens := inputTokens + outputTokens

	switch providerType {
	case config.OpenAIChat, config.OpenAIResponses:
		usage := ensureMap(payload, "usage")
		usage["cache_tokens"] = totalTokens
		usage["total_tokens"] = totalTokens
	case config.Claude:
		usage := ensureMap(payload, "usage")
		usage["cache_tokens"] = totalTokens
	case config.Gemini:
		usage := ensureMap(payload, "usageMetadata")
		usage["totalTokenCount"] = totalTokens
		usage["cacheTokens"] = totalTokens
	}

	decorated, err := json.Marshal(payload)
	if err != nil {
		return append([]byte(nil), responseBody...)
	}
	return decorated
}

func ensureMap(payload map[string]any, key string) map[string]any {
	if existing, ok := payload[key].(map[string]any); ok {
		return existing
	}
	child := make(map[string]any)
	payload[key] = child
	return child
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

func prepareCachedMetadata(headers map[string]string, providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) (nonStreamHeadersJSON []byte, nonStreamBody, streamBody []byte, err error) {
	nonStreamHeadersJSON, err = formatHeadersJSON(cloneHeaders(headers), false)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("marshal non-stream headers: %w", err)
	}
	nonStreamBody, streamBody = PrepareCachedBodies(providerType, responseBody, inputTokens, outputTokens)
	return nonStreamHeadersJSON, nonStreamBody, streamBody, nil
}

func cloneHeaders(headers map[string]string) map[string]string {
	out := make(map[string]string, len(headers))
	for k, v := range headers {
		out[k] = v
	}
	return out
}
