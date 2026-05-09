package providerapi

import (
	"bytes"
	"encoding/json"
)

type Usage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	CacheTokens  int64 `json:"cache_tokens"`
}

func extractOpenAIResponseUsage(body []byte) Usage {
	var resp struct {
		Usage struct {
			PromptTokens       int64 `json:"prompt_tokens"`
			CompletionTokens   int64 `json:"completion_tokens"`
			InputTokens        int64 `json:"input_tokens"`
			OutputTokens       int64 `json:"output_tokens"`
			PromptTokenDetails struct {
				CachedTokens int64 `json:"cached_tokens"`
			} `json:"prompt_tokens_details"`
			InputTokenDetails struct {
				CachedTokens int64 `json:"cached_tokens"`
			} `json:"input_tokens_details"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return Usage{}
	}
	cacheTokens := resp.Usage.PromptTokenDetails.CachedTokens
	if cacheTokens == 0 {
		cacheTokens = resp.Usage.InputTokenDetails.CachedTokens
	}
	if resp.Usage.PromptTokens > 0 || resp.Usage.CompletionTokens > 0 {
		return Usage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
			CacheTokens:  cacheTokens,
		}
	}
	if resp.Usage.InputTokens > 0 || resp.Usage.OutputTokens > 0 {
		return Usage{
			InputTokens:  resp.Usage.InputTokens,
			OutputTokens: resp.Usage.OutputTokens,
			CacheTokens:  cacheTokens,
		}
	}

	var responses struct {
		Output []struct {
			Usage struct {
				InputTokens       int64 `json:"input_tokens"`
				OutputTokens      int64 `json:"output_tokens"`
				InputTokenDetails struct {
					CachedTokens int64 `json:"cached_tokens"`
				} `json:"input_tokens_details"`
			} `json:"usage"`
		} `json:"output"`
	}
	if err := json.Unmarshal(body, &responses); err == nil {
		for _, output := range responses.Output {
			if output.Usage.InputTokens > 0 || output.Usage.OutputTokens > 0 {
				return Usage{
					InputTokens:  output.Usage.InputTokens,
					OutputTokens: output.Usage.OutputTokens,
					CacheTokens:  output.Usage.InputTokenDetails.CachedTokens,
				}
			}
		}
	}
	return Usage{}
}

func extractClaudeResponseUsage(body []byte) Usage {
	var resp struct {
		Usage struct {
			InputTokens              int64 `json:"input_tokens"`
			OutputTokens             int64 `json:"output_tokens"`
			CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
			CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return Usage{}
	}
	return Usage{
		InputTokens:  resp.Usage.InputTokens,
		OutputTokens: resp.Usage.OutputTokens,
		CacheTokens:  resp.Usage.CacheCreationInputTokens + resp.Usage.CacheReadInputTokens,
	}
}

func extractGeminiResponseUsage(body []byte) Usage {
	var resp struct {
		UsageMetadata struct {
			PromptTokenCount        int64 `json:"promptTokenCount"`
			CandidatesTokenCount    int64 `json:"candidatesTokenCount"`
			TotalTokenCount         int64 `json:"totalTokenCount"`
			CachedContentTokenCount int64 `json:"cachedContentTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return Usage{}
	}
	input := resp.UsageMetadata.PromptTokenCount
	output := resp.UsageMetadata.CandidatesTokenCount
	cacheTokens := geminiCacheTokens(input, output, resp.UsageMetadata.TotalTokenCount, resp.UsageMetadata.CachedContentTokenCount)
	if input == 0 && output == 0 && resp.UsageMetadata.TotalTokenCount > 0 {
		input = resp.UsageMetadata.TotalTokenCount
	}
	return Usage{
		InputTokens:  input,
		OutputTokens: output,
		CacheTokens:  cacheTokens,
	}
}

func extractOpenAIStreamUsage(body []byte) Usage {
	var usage Usage
	payloads := sseDataPayloads(body)
	for index := len(payloads) - 1; index >= 0; index-- {
		jsonPayload := payloads[index]
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
		if err := json.Unmarshal(jsonPayload, &chunk); err != nil {
			continue
		}
		if chunk.Usage.PromptTokens > 0 || chunk.Usage.CompletionTokens > 0 {
			usage = Usage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
				CacheTokens:  chunk.Usage.PromptTokenDetails.CachedTokens,
			}
			break
		}
		if chunk.Response.Usage.InputTokens > 0 || chunk.Response.Usage.OutputTokens > 0 {
			usage = Usage{
				InputTokens:  chunk.Response.Usage.InputTokens,
				OutputTokens: chunk.Response.Usage.OutputTokens,
				CacheTokens:  chunk.Response.Usage.InputTokenDetails.CachedTokens,
			}
			break
		}
	}
	return usage
}

func extractClaudeStreamUsage(body []byte) Usage {
	var usage Usage
	payloads := sseDataPayloads(body)
	for index := len(payloads) - 1; index >= 0; index-- {
		jsonPayload := payloads[index]
		var message struct {
			Usage struct {
				InputTokens              int64 `json:"input_tokens"`
				OutputTokens             int64 `json:"output_tokens"`
				CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
				CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal(jsonPayload, &message); err != nil {
			continue
		}
		if message.Usage.InputTokens > 0 || message.Usage.OutputTokens > 0 {
			usage = Usage{
				InputTokens:  message.Usage.InputTokens,
				OutputTokens: message.Usage.OutputTokens,
				CacheTokens:  message.Usage.CacheCreationInputTokens + message.Usage.CacheReadInputTokens,
			}
			break
		}
	}
	return usage
}

func extractGeminiStreamUsage(body []byte) Usage {
	var usage Usage
	payloads := sseDataPayloads(body)
	for index := len(payloads) - 1; index >= 0; index-- {
		jsonPayload := payloads[index]
		var resp struct {
			UsageMetadata struct {
				PromptTokenCount        int64 `json:"promptTokenCount"`
				CandidatesTokenCount    int64 `json:"candidatesTokenCount"`
				TotalTokenCount         int64 `json:"totalTokenCount"`
				CachedContentTokenCount int64 `json:"cachedContentTokenCount"`
			} `json:"usageMetadata"`
		}
		if err := json.Unmarshal(jsonPayload, &resp); err != nil {
			continue
		}
		input := resp.UsageMetadata.PromptTokenCount
		output := resp.UsageMetadata.CandidatesTokenCount
		cacheTokens := geminiCacheTokens(input, output, resp.UsageMetadata.TotalTokenCount, resp.UsageMetadata.CachedContentTokenCount)
		if input == 0 && output == 0 && resp.UsageMetadata.TotalTokenCount > 0 {
			input = resp.UsageMetadata.TotalTokenCount
		}
		if input > 0 || output > 0 {
			usage = Usage{
				InputTokens:  input,
				OutputTokens: output,
				CacheTokens:  cacheTokens,
			}
			break
		}
	}
	return usage
}

func geminiCacheTokens(inputTokens, outputTokens, totalTokens, cachedTokens int64) int64 {
	if cachedTokens <= 0 {
		return 0
	}
	if inputTokens > 0 || outputTokens > 0 {
		if totalTokens > 0 {
			return totalTokens
		}
		return inputTokens + outputTokens
	}
	return cachedTokens
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
