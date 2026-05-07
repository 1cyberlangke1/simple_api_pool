package token

import (
	"encoding/json"
	"strings"
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

	if u.InputTokens == 0 && u.OutputTokens == 0 && estimateEnabled && len(body) > 0 {
		est := int64(len(body) / 4)
		if est < 1 {
			est = 1
		}
		return Usage{InputTokens: est / 2, OutputTokens: est - est/2}
	}
	return u
}

func extractOpenAIStream(body []byte) Usage {
	// Parse SSE stream: each line starts with "data: "
	// The last data line contains "[DONE]" or the final chunk with usage
	lines := strings.Split(string(body), "\n")
	var u Usage
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(line, "data: ") || line == "data: [DONE]" {
			continue
		}
		jsonStr := strings.TrimPrefix(line, "data: ")
		var chunk struct {
			Usage struct {
				PromptTokens     int64 `json:"prompt_tokens"`
				CompletionTokens int64 `json:"completion_tokens"`
			} `json:"usage"`
			Response struct {
				Usage struct {
					InputTokens  int64 `json:"input_tokens"`
					OutputTokens int64 `json:"output_tokens"`
				} `json:"usage"`
			} `json:"response"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &chunk); err != nil {
			continue
		}
		if chunk.Usage.PromptTokens > 0 || chunk.Usage.CompletionTokens > 0 {
			u = Usage{InputTokens: chunk.Usage.PromptTokens, OutputTokens: chunk.Usage.CompletionTokens}
			break
		}
		if chunk.Response.Usage.InputTokens > 0 || chunk.Response.Usage.OutputTokens > 0 {
			u = Usage{InputTokens: chunk.Response.Usage.InputTokens, OutputTokens: chunk.Response.Usage.OutputTokens}
			break
		}
	}
	return u
}

func extractClaudeStream(body []byte) Usage {
	lines := strings.Split(string(body), "\n")
	var u Usage
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		jsonStr := strings.TrimPrefix(line, "data: ")
		var msg struct {
			Type  string `json:"type"`
			Usage struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &msg); err != nil {
			continue
		}
		if msg.Usage.InputTokens > 0 || msg.Usage.OutputTokens > 0 {
			u = Usage{InputTokens: msg.Usage.InputTokens, OutputTokens: msg.Usage.OutputTokens}
			break
		}
	}
	return u
}

func extractGeminiStream(body []byte) Usage {
	lines := strings.Split(string(body), "\n")
	var u Usage
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		jsonStr := strings.TrimPrefix(line, "data: ")
		var resp struct {
			UsageMetadata struct {
				PromptTokenCount     int64 `json:"promptTokenCount"`
				CandidatesTokenCount int64 `json:"candidatesTokenCount"`
				TotalTokenCount      int64 `json:"totalTokenCount"`
			} `json:"usageMetadata"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
			continue
		}
		input := resp.UsageMetadata.PromptTokenCount
		output := resp.UsageMetadata.CandidatesTokenCount
		if input == 0 && output == 0 && resp.UsageMetadata.TotalTokenCount > 0 {
			input = resp.UsageMetadata.TotalTokenCount / 2
			output = resp.UsageMetadata.TotalTokenCount - input
		}
		if input > 0 || output > 0 {
			u = Usage{InputTokens: input, OutputTokens: output}
			break
		}
	}
	return u
}
