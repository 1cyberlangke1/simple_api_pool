package token

import (
	"bytes"
	"encoding/json"
)

// ExtractFromStream tries to extract token usage from accumulated streamed response bytes
func ExtractFromStream(providerType string, body []byte, estimateEnabled bool) Usage {
	// For SSE streams, we need to parse the last chunk that contains usage info
	// OpenAI: the last chunk has "usage": {...}
	// Claude: stream_event with "usage": {...}
	// Gemini: the last chunk has "usageMetadata": {...}

	var u Usage

	switch providerType {
	case "openai_chat", "openai_responses":
		u = extractOpenAIStream(body)
	case "claude":
		u = extractClaudeStream(body)
	case "gemini":
		u = extractGeminiStream(body)
	}

	if u.InputTokens == 0 && u.OutputTokens == 0 {
		return estimateUsage(body, estimateEnabled)
	}
	return u
}

func extractOpenAIStream(body []byte) Usage {
	var u Usage
	payloads := sseDataPayloads(body)
	for i := len(payloads) - 1; i >= 0; i-- {
		jsonStr := payloads[i]
		var chunk struct {
			Usage struct {
				PromptTokens       int64 `json:"prompt_tokens"`
				CompletionTokens   int64 `json:"completion_tokens"`
				PromptTokenDetails struct {
					CachedTokens int64 `json:"cached_tokens"`
				} `json:"prompt_tokens_details"`
			} `json:"usage"`
			Response struct {
				Usage struct {
					InputTokens       int64 `json:"input_tokens"`
					OutputTokens      int64 `json:"output_tokens"`
					InputTokenDetails struct {
						CachedTokens int64 `json:"cached_tokens"`
					} `json:"input_tokens_details"`
				} `json:"usage"`
			} `json:"response"`
		}
		if err := json.Unmarshal(jsonStr, &chunk); err != nil {
			continue
		}
		if chunk.Usage.PromptTokens > 0 || chunk.Usage.CompletionTokens > 0 {
			u = Usage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
				CacheTokens:  chunk.Usage.PromptTokenDetails.CachedTokens,
			}
			break
		}
		if chunk.Response.Usage.InputTokens > 0 || chunk.Response.Usage.OutputTokens > 0 {
			u = Usage{
				InputTokens:  chunk.Response.Usage.InputTokens,
				OutputTokens: chunk.Response.Usage.OutputTokens,
				CacheTokens:  chunk.Response.Usage.InputTokenDetails.CachedTokens,
			}
			break
		}
	}
	return u
}

func extractClaudeStream(body []byte) Usage {
	var u Usage
	payloads := sseDataPayloads(body)
	for i := len(payloads) - 1; i >= 0; i-- {
		jsonStr := payloads[i]
		var msg struct {
			Type  string `json:"type"`
			Usage struct {
				InputTokens              int64 `json:"input_tokens"`
				OutputTokens             int64 `json:"output_tokens"`
				CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
				CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal(jsonStr, &msg); err != nil {
			continue
		}
		if msg.Usage.InputTokens > 0 || msg.Usage.OutputTokens > 0 {
			u = Usage{
				InputTokens:  msg.Usage.InputTokens,
				OutputTokens: msg.Usage.OutputTokens,
				CacheTokens:  msg.Usage.CacheCreationInputTokens + msg.Usage.CacheReadInputTokens,
			}
			break
		}
	}
	return u
}

func extractGeminiStream(body []byte) Usage {
	var u Usage
	payloads := sseDataPayloads(body)
	for i := len(payloads) - 1; i >= 0; i-- {
		jsonStr := payloads[i]
		var resp struct {
			UsageMetadata struct {
				PromptTokenCount        int64 `json:"promptTokenCount"`
				CandidatesTokenCount    int64 `json:"candidatesTokenCount"`
				TotalTokenCount         int64 `json:"totalTokenCount"`
				CachedContentTokenCount int64 `json:"cachedContentTokenCount"`
			} `json:"usageMetadata"`
		}
		if err := json.Unmarshal(jsonStr, &resp); err != nil {
			continue
		}
		input := resp.UsageMetadata.PromptTokenCount
		output := resp.UsageMetadata.CandidatesTokenCount
		cacheTokens := geminiCacheTokens(input, output, resp.UsageMetadata.TotalTokenCount, resp.UsageMetadata.CachedContentTokenCount)
		if input == 0 && output == 0 && resp.UsageMetadata.TotalTokenCount > 0 {
			input = resp.UsageMetadata.TotalTokenCount
		}
		if input > 0 || output > 0 {
			u = Usage{
				InputTokens:  input,
				OutputTokens: output,
				CacheTokens:  cacheTokens,
			}
			break
		}
	}
	return u
}

func sseDataPayloads(body []byte) [][]byte {
	normalized := bytes.ReplaceAll(body, []byte("\r\n"), []byte("\n"))
	normalized = bytes.ReplaceAll(normalized, []byte("\r"), []byte("\n"))

	rawEvents := bytes.Split(normalized, []byte("\n\n"))
	payloads := make([][]byte, 0, len(rawEvents))
	for _, event := range rawEvents {
		if len(bytes.TrimSpace(event)) == 0 {
			continue
		}

		lines := bytes.Split(event, []byte("\n"))
		dataLines := make([][]byte, 0, len(lines))
		skipEvent := false
		for _, rawLine := range lines {
			line := bytes.TrimSpace(rawLine)
			if !bytes.HasPrefix(line, []byte("data:")) {
				continue
			}
			payload := bytes.TrimSpace(line[len("data:"):])
			if bytes.Equal(payload, []byte("[DONE]")) {
				skipEvent = true
				break
			}
			dataLines = append(dataLines, append([]byte(nil), payload...))
		}
		if skipEvent || len(dataLines) == 0 {
			continue
		}
		payloads = append(payloads, bytes.Join(dataLines, []byte("\n")))
	}
	return payloads
}
