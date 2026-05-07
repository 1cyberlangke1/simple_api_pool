package cache

import (
	"encoding/json"
	"fmt"

	"simple-api-pool/config"
)

func PrepareCachedBodies(providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) ([]byte, []byte) {
	decorated := decorateCachedResponse(providerType, responseBody, inputTokens, outputTokens)
	stream := buildCachedStreamBody(providerType, decorated)
	return decorated, stream
}

func buildCachedStreamBody(providerType config.ProviderType, responseBody []byte) []byte {
	switch providerType {
	case config.OpenAIChat:
		if streamBody, ok := buildOpenAIChatCachedStream(responseBody); ok {
			return streamBody
		}
	case config.OpenAIResponses:
		if streamBody, ok := buildOpenAIResponsesCachedStream(responseBody); ok {
			return streamBody
		}
	case config.Claude:
		if streamBody, ok := buildClaudeCachedStream(responseBody); ok {
			return streamBody
		}
	case config.Gemini:
		if streamBody, ok := buildGenericDataOnlyStream(responseBody); ok {
			return streamBody
		}
	}

	stream := make([]byte, 0, len(responseBody)+18)
	stream = append(stream, []byte("data: ")...)
	stream = append(stream, responseBody...)
	stream = append(stream, []byte("\n\ndata: [DONE]\n\n")...)
	return stream
}

func decorateCachedResponse(providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) []byte {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return append([]byte(nil), responseBody...)
	}

	totalTokens := inputTokens + outputTokens

	switch providerType {
	case config.OpenAIChat:
		usage := ensureMap(payload, "usage")
		usage["total_tokens"] = totalTokens
		promptDetails := ensureChildMap(usage, "prompt_tokens_details")
		promptDetails["cached_tokens"] = totalTokens
	case config.OpenAIResponses:
		usage := ensureMap(payload, "usage")
		usage["total_tokens"] = totalTokens
		inputDetails := ensureChildMap(usage, "input_tokens_details")
		inputDetails["cached_tokens"] = totalTokens
	case config.Claude:
		usage := ensureMap(payload, "usage")
		usage["cache_read_input_tokens"] = totalTokens
	case config.Gemini:
		usage := ensureMap(payload, "usageMetadata")
		usage["totalTokenCount"] = totalTokens
		usage["cachedContentTokenCount"] = totalTokens
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

func ensureChildMap(parent map[string]any, key string) map[string]any {
	if existing, ok := parent[key].(map[string]any); ok {
		return existing
	}
	child := make(map[string]any)
	parent[key] = child
	return child
}

func buildOpenAIChatCachedStream(responseBody []byte) ([]byte, bool) {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return nil, false
	}
	rawChoices, ok := payload["choices"].([]any)
	if !ok || len(rawChoices) == 0 {
		return nil, false
	}
	rawChoice, ok := rawChoices[0].(map[string]any)
	if !ok {
		return nil, false
	}
	message, ok := rawChoice["message"].(map[string]any)
	if !ok {
		return nil, false
	}

	role, _ := message["role"].(string)
	if role == "" {
		role = "assistant"
	}
	delta := make(map[string]any, len(message))
	for key, value := range message {
		delta[key] = value
	}
	delta["role"] = role

	events := make([][]byte, 0, 4)
	firstChunk, err := json.Marshal(map[string]any{
		"id":     payload["id"],
		"object": "chat.completion.chunk",
		"model":  payload["model"],
		"choices": []map[string]any{
			{
				"index":         0,
				"delta":         delta,
				"finish_reason": nil,
			},
		},
		"usage": nil,
	})
	if err != nil {
		return nil, false
	}
	events = append(events, firstChunk)

	stopChunk, err := json.Marshal(map[string]any{
		"id":     payload["id"],
		"object": "chat.completion.chunk",
		"model":  payload["model"],
		"choices": []map[string]any{
			{
				"index":         0,
				"delta":         map[string]any{},
				"finish_reason": rawChoice["finish_reason"],
			},
		},
		"usage": nil,
	})
	if err != nil {
		return nil, false
	}
	events = append(events, stopChunk)

	if usage, ok := payload["usage"].(map[string]any); ok && len(usage) > 0 {
		usageChunk, err := json.Marshal(map[string]any{
			"id":      payload["id"],
			"object":  "chat.completion.chunk",
			"model":   payload["model"],
			"choices": []map[string]any{},
			"usage":   usage,
		})
		if err != nil {
			return nil, false
		}
		events = append(events, usageChunk)
	}

	return encodeSSEDataEvents(events), true
}

func buildOpenAIResponsesCachedStream(responseBody []byte) ([]byte, bool) {
	var payload struct {
		ID     string `json:"id"`
		Object string `json:"object"`
		Model  string `json:"model"`
		Output []struct {
			Type    string `json:"type"`
			ID      string `json:"id"`
			Status  string `json:"status"`
			Role    string `json:"role"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		Usage map[string]any `json:"usage"`
	}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return nil, false
	}

	var messageID string
	var outputText string
	if len(payload.Output) > 0 {
		messageID = payload.Output[0].ID
		if len(payload.Output[0].Content) > 0 {
			outputText = payload.Output[0].Content[0].Text
		}
	}

	events := make([][]byte, 0, 4)
	createdEvent, err := json.Marshal(map[string]any{
		"type": "response.created",
		"response": map[string]any{
			"id":     payload.ID,
			"object": payload.Object,
			"model":  payload.Model,
			"output": []any{},
			"usage":  nil,
		},
	})
	if err != nil {
		return nil, false
	}
	events = append(events, createdEvent)

	if outputText != "" {
		deltaEvent, err := json.Marshal(map[string]any{
			"type":          "response.output_text.delta",
			"item_id":       messageID,
			"output_index":  0,
			"content_index": 0,
			"delta":         outputText,
		})
		if err != nil {
			return nil, false
		}
		events = append(events, deltaEvent)

		doneEvent, err := json.Marshal(map[string]any{
			"type":          "response.output_text.done",
			"item_id":       messageID,
			"output_index":  0,
			"content_index": 0,
			"text":          outputText,
		})
		if err != nil {
			return nil, false
		}
		events = append(events, doneEvent)
	}

	completedEvent, err := json.Marshal(map[string]any{
		"type":     "response.completed",
		"response": json.RawMessage(responseBody),
	})
	if err != nil {
		return nil, false
	}
	events = append(events, completedEvent)

	return encodeSSEDataEvents(events), true
}

func buildClaudeCachedStream(responseBody []byte) ([]byte, bool) {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return nil, false
	}

	contentType := "text"
	text := ""
	if rawContent, ok := payload["content"].([]any); ok && len(rawContent) > 0 {
		if firstBlock, ok := rawContent[0].(map[string]any); ok {
			if rawType, ok := firstBlock["type"].(string); ok && rawType != "" {
				contentType = rawType
			}
			if rawText, ok := firstBlock["text"].(string); ok {
				text = rawText
			}
		}
	}

	events := make([][]byte, 0, 6)
	messageStartEvent, err := json.Marshal(map[string]any{
		"type": "message_start",
		"message": map[string]any{
			"id":            payload["id"],
			"type":          payload["type"],
			"role":          payload["role"],
			"content":       []any{},
			"model":         payload["model"],
			"stop_reason":   nil,
			"stop_sequence": nil,
		},
	})
	if err != nil {
		return nil, false
	}
	events = append(events, messageStartEvent)

	contentBlockStartEvent, err := json.Marshal(map[string]any{
		"type":  "content_block_start",
		"index": 0,
		"content_block": map[string]any{
			"type": contentType,
			"text": "",
		},
	})
	if err != nil {
		return nil, false
	}
	events = append(events, contentBlockStartEvent)

	contentBlockDeltaEvent, err := json.Marshal(map[string]any{
		"type":  "content_block_delta",
		"index": 0,
		"delta": map[string]any{
			"type": "text_delta",
			"text": text,
		},
	})
	if err != nil {
		return nil, false
	}
	events = append(events, contentBlockDeltaEvent)

	contentBlockStopEvent, err := json.Marshal(map[string]any{
		"type":  "content_block_stop",
		"index": 0,
	})
	if err != nil {
		return nil, false
	}
	events = append(events, contentBlockStopEvent)

	messageDeltaEvent, err := json.Marshal(map[string]any{
		"type": "message_delta",
		"delta": map[string]any{
			"stop_reason":   payload["stop_reason"],
			"stop_sequence": payload["stop_sequence"],
		},
		"usage": payload["usage"],
	})
	if err != nil {
		return nil, false
	}
	events = append(events, messageDeltaEvent)

	messageStopEvent, err := json.Marshal(map[string]any{
		"type": "message_stop",
	})
	if err != nil {
		return nil, false
	}
	events = append(events, messageStopEvent)

	return encodeSSEDataEvents(events), true
}

func buildGenericDataOnlyStream(responseBody []byte) ([]byte, bool) {
	if len(responseBody) == 0 {
		return nil, false
	}
	return encodeSSEDataEvents([][]byte{responseBody}), true
}

func encodeSSEDataEvents(events [][]byte) []byte {
	totalLength := len("data: [DONE]\n\n")
	for _, event := range events {
		totalLength += len("data: ") + len(event) + len("\n\n")
	}

	stream := make([]byte, 0, totalLength)
	for _, event := range events {
		stream = append(stream, []byte("data: ")...)
		stream = append(stream, event...)
		stream = append(stream, []byte("\n\n")...)
	}
	stream = append(stream, []byte("data: [DONE]\n\n")...)
	return stream
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
	decoratedBody = decorateCachedResponse(providerType, responseBody, inputTokens, outputTokens)
	return headersJSON, decoratedBody, nil
}

func cloneHeaders(headers map[string]string) map[string]string {
	out := make(map[string]string, len(headers))
	for k, v := range headers {
		out[k] = v
	}
	return out
}
