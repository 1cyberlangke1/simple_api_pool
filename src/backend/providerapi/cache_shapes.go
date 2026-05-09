package providerapi

import (
	"encoding/json"
	"fmt"
	"strings"
)

func decorateOpenAICachedResponse(responseBody []byte, inputTokens, outputTokens int64) []byte {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return append([]byte(nil), responseBody...)
	}

	totalTokens := inputTokens + outputTokens
	usage := ensureMap(payload, "usage")
	usage["total_tokens"] = totalTokens
	promptDetails := ensureChildMap(usage, "prompt_tokens_details")
	promptDetails["cached_tokens"] = totalTokens

	decorated, err := json.Marshal(payload)
	if err != nil {
		return append([]byte(nil), responseBody...)
	}
	return decorated
}

func decorateOpenAIResponsesCachedResponse(responseBody []byte, inputTokens, outputTokens int64) []byte {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return append([]byte(nil), responseBody...)
	}

	totalTokens := inputTokens + outputTokens
	usage := ensureMap(payload, "usage")
	usage["total_tokens"] = totalTokens
	inputDetails := ensureChildMap(usage, "input_tokens_details")
	inputDetails["cached_tokens"] = totalTokens

	decorated, err := json.Marshal(payload)
	if err != nil {
		return append([]byte(nil), responseBody...)
	}
	return decorated
}

func decorateClaudeCachedResponse(responseBody []byte, inputTokens, outputTokens int64) []byte {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return append([]byte(nil), responseBody...)
	}

	usage := ensureMap(payload, "usage")
	usage["cache_read_input_tokens"] = inputTokens + outputTokens

	decorated, err := json.Marshal(payload)
	if err != nil {
		return append([]byte(nil), responseBody...)
	}
	return decorated
}

func decorateGeminiCachedResponse(responseBody []byte, inputTokens, outputTokens int64) []byte {
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return append([]byte(nil), responseBody...)
	}

	totalTokens := inputTokens + outputTokens
	usage := ensureMap(payload, "usageMetadata")
	usage["totalTokenCount"] = totalTokens
	usage["cachedContentTokenCount"] = totalTokens

	decorated, err := json.Marshal(payload)
	if err != nil {
		return append([]byte(nil), responseBody...)
	}
	return decorated
}

func buildGenericCachedStreamBody(responseBody []byte) ([]byte, bool) {
	if len(responseBody) == 0 {
		return nil, false
	}
	return encodeSSEDataEvents([][]byte{responseBody}), true
}

func decorateOpenAIChatCachedStreamUsage(streamBody []byte, inputTokens, outputTokens int64) []byte {
	totalTokens := inputTokens + outputTokens
	var (
		chunks       []string
		lastID       any
		lastModel    any
		usageUpdated bool
	)
	for _, chunk := range splitSSEChunks(streamBody) {
		payload, ok := sseChunkPayload(chunk)
		if ok {
			if id, exists := payload["id"]; exists {
				lastID = id
			}
			if model, exists := payload["model"]; exists {
				lastModel = model
			}
			if usage, exists := payload["usage"].(map[string]any); exists {
				usage["total_tokens"] = totalTokens
				promptDetails := ensureChildMap(usage, "prompt_tokens_details")
				promptDetails["cached_tokens"] = totalTokens
				chunk = encodeDataOnlySSEChunk(payload)
				usageUpdated = true
			}
		}
		if isDoneSSEChunk(chunk) && !usageUpdated && lastID != nil {
			chunks = append(chunks, buildDataOnlySSEChunk(map[string]any{
				"id":      lastID,
				"object":  "chat.completion.chunk",
				"model":   lastModel,
				"choices": []map[string]any{},
				"usage": map[string]any{
					"total_tokens": totalTokens,
					"prompt_tokens_details": map[string]any{
						"cached_tokens": totalTokens,
					},
				},
			}))
			usageUpdated = true
		}
		chunks = append(chunks, chunk)
	}
	return []byte(strings.Join(chunks, ""))
}

func decorateOpenAIResponsesCachedStreamUsage(streamBody []byte, inputTokens, outputTokens int64) []byte {
	totalTokens := inputTokens + outputTokens
	var chunks []string
	for _, chunk := range splitSSEChunks(streamBody) {
		payload, ok := sseChunkPayload(chunk)
		if ok {
			if chunkType, _ := payload["type"].(string); chunkType == "response.completed" {
				response, _ := payload["response"].(map[string]any)
				usage := ensureMap(response, "usage")
				usage["total_tokens"] = totalTokens
				inputDetails := ensureChildMap(usage, "input_tokens_details")
				inputDetails["cached_tokens"] = totalTokens
				payload["response"] = response
				chunk = encodeDataOnlySSEChunk(payload)
			}
		}
		chunks = append(chunks, chunk)
	}
	return []byte(strings.Join(chunks, ""))
}

func decorateClaudeCachedStreamUsage(streamBody []byte, inputTokens, outputTokens int64) []byte {
	totalTokens := inputTokens + outputTokens
	sourceChunks := splitSSEChunks(streamBody)
	lastUsageChunk := -1
	for index := len(sourceChunks) - 1; index >= 0; index-- {
		payload, ok := sseChunkPayload(sourceChunks[index])
		if !ok {
			continue
		}
		if _, exists := payload["usage"].(map[string]any); exists {
			lastUsageChunk = index
			break
		}
	}

	var (
		chunks       []string
		usageUpdated bool
	)
	for index, chunk := range sourceChunks {
		payload, ok := sseChunkPayload(chunk)
		if ok {
			if usage, exists := payload["usage"].(map[string]any); exists {
				if index == lastUsageChunk {
					usage["cache_read_input_tokens"] = totalTokens
					payload["usage"] = usage
					usageUpdated = true
				} else {
					delete(payload, "usage")
				}
				chunk = replaceSSEDataChunk(chunk, payload)
			}
			if chunkType, _ := payload["type"].(string); chunkType == "message_stop" && !usageUpdated {
				chunks = append(chunks, "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{},\"usage\":{\"cache_read_input_tokens\":"+fmt.Sprintf("%d", totalTokens)+"}}\n\n")
				usageUpdated = true
			}
		}
		chunks = append(chunks, chunk)
	}
	return []byte(strings.Join(chunks, ""))
}

func decorateGeminiCachedStreamUsage(streamBody []byte, inputTokens, outputTokens int64) []byte {
	totalTokens := inputTokens + outputTokens
	sourceChunks := splitSSEChunks(streamBody)
	lastPayloadChunk := -1
	for index := len(sourceChunks) - 1; index >= 0; index-- {
		if _, ok := sseChunkPayload(sourceChunks[index]); ok {
			lastPayloadChunk = index
			break
		}
	}

	var chunks []string
	for index, chunk := range sourceChunks {
		payload, ok := sseChunkPayload(chunk)
		if ok {
			if index == lastPayloadChunk {
				usage := ensureMap(payload, "usageMetadata")
				usage["promptTokenCount"] = inputTokens
				usage["candidatesTokenCount"] = outputTokens
				usage["totalTokenCount"] = totalTokens
				usage["cachedContentTokenCount"] = totalTokens
				payload["usageMetadata"] = usage
			} else {
				delete(payload, "usageMetadata")
			}
			chunk = encodeDataOnlySSEChunk(payload)
		}
		chunks = append(chunks, chunk)
	}
	return []byte(strings.Join(chunks, ""))
}

func splitSSEChunks(streamBody []byte) []string {
	normalized := normalizeSSELineEndings(string(streamBody))
	rawChunks := strings.Split(normalized, "\n\n")
	chunks := make([]string, 0, len(rawChunks))
	for _, chunk := range rawChunks {
		if chunk == "" {
			continue
		}
		chunks = append(chunks, chunk+"\n\n")
	}
	return chunks
}

func normalizeSSELineEndings(body string) string {
	return strings.NewReplacer("\r\n", "\n", "\r", "\n").Replace(body)
}

func sseChunkPayload(chunk string) (map[string]any, bool) {
	lines := strings.Split(strings.TrimSuffix(chunk, "\n\n"), "\n")
	dataLines := make([]string, 0, len(lines))
	for _, line := range lines {
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		rawJSON := strings.TrimPrefix(line, "data: ")
		if rawJSON == "[DONE]" {
			return nil, false
		}
		dataLines = append(dataLines, rawJSON)
	}
	if len(dataLines) == 0 {
		return nil, false
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.Join(dataLines, "\n")), &payload); err != nil {
		return nil, false
	}
	return payload, true
}

func encodeDataOnlySSEChunk(payload map[string]any) string {
	return buildDataOnlySSEChunk(payload)
}

func buildDataOnlySSEChunk(payload map[string]any) string {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return "data: " + string(encoded) + "\n\n"
}

func replaceSSEDataChunk(chunk string, payload map[string]any) string {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return chunk
	}
	lines := strings.Split(strings.TrimSuffix(chunk, "\n\n"), "\n")
	for index, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			lines[index] = "data: " + string(encoded)
			break
		}
	}
	return strings.Join(lines, "\n") + "\n\n"
}

func isDoneSSEChunk(chunk string) bool {
	for _, line := range strings.Split(strings.TrimSuffix(chunk, "\n\n"), "\n") {
		if strings.TrimSpace(line) == "data: [DONE]" {
			return true
		}
	}
	return false
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
			ID      string `json:"id"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
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
