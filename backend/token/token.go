package token

import (
	"encoding/json"
	"unicode/utf8"
)

type Usage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

func Extract(providerType string, body []byte, estimateEnabled bool) Usage {
	var u Usage

	switch providerType {
	case "openai_chat", "openai_responses":
		u = extractOpenAI(body)
	case "claude":
		u = extractClaude(body)
	case "gemini":
		u = extractGemini(body)
	}

	if u.InputTokens == 0 && u.OutputTokens == 0 && estimateEnabled && len(body) > 0 {
		est := int64(utf8.RuneCount(body) / 4)
		if est < 1 {
			est = 1
		}
		return Usage{InputTokens: est / 2, OutputTokens: est - est/2}
	}
	return u
}

func extractOpenAI(body []byte) Usage {
	var resp struct {
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
			InputTokens      int64 `json:"input_tokens"`
			OutputTokens     int64 `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return Usage{}
	}
	if resp.Usage.PromptTokens > 0 || resp.Usage.CompletionTokens > 0 {
		return Usage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
		}
	}
	if resp.Usage.InputTokens > 0 || resp.Usage.OutputTokens > 0 {
		return Usage{
			InputTokens:  resp.Usage.InputTokens,
			OutputTokens: resp.Usage.OutputTokens,
		}
	}

	var arr struct {
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
		} `json:"usage"`
	}
	var responses struct {
		Output []struct {
			Usage struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"usage"`
		} `json:"output"`
	}
	if err := json.Unmarshal(body, &responses); err == nil {
		for _, o := range responses.Output {
			if o.Usage.InputTokens > 0 || o.Usage.OutputTokens > 0 {
				return Usage{InputTokens: o.Usage.InputTokens, OutputTokens: o.Usage.OutputTokens}
			}
		}
	}
	_ = arr
	return Usage{}
}

func extractClaude(body []byte) Usage {
	var resp struct {
		Usage struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return Usage{}
	}
	return Usage{
		InputTokens:  resp.Usage.InputTokens,
		OutputTokens: resp.Usage.OutputTokens,
	}
}

func extractGemini(body []byte) Usage {
	var resp struct {
		UsageMetadata struct {
			PromptTokenCount     int64 `json:"promptTokenCount"`
			CandidatesTokenCount int64 `json:"candidatesTokenCount"`
			TotalTokenCount      int64 `json:"totalTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return Usage{}
	}
	input := resp.UsageMetadata.PromptTokenCount
	output := resp.UsageMetadata.CandidatesTokenCount
	if input == 0 && output == 0 && resp.UsageMetadata.TotalTokenCount > 0 {
		input = resp.UsageMetadata.TotalTokenCount / 2
		output = resp.UsageMetadata.TotalTokenCount - input
	}
	return Usage{InputTokens: input, OutputTokens: output}
}
