package tests

import (
	"testing"

	"simple-api-pool/token"
)

func Test提取OpenAI响应里的Token计数(t *testing.T) {
	body := []byte(`{"usage":{"prompt_tokens":12,"completion_tokens":7}}`)

	got := token.Extract("openai_chat", body, false)

	if got.InputTokens != 12 || got.OutputTokens != 7 {
		t.Fatalf("期望 usage 为 12/7，实际是 %+v", got)
	}
}

func Test提取OpenAIResponses顶层Usage里的Token计数(t *testing.T) {
	body := []byte(`{"id":"resp_123","object":"response","usage":{"input_tokens":18,"output_tokens":9,"total_tokens":27}}`)

	got := token.Extract("openai_responses", body, false)

	if got.InputTokens != 18 || got.OutputTokens != 9 {
		t.Fatalf("期望 usage 为 18/9，实际是 %+v", got)
	}
}

func Test缺少Token统计时会回退到估算(t *testing.T) {
	body := []byte(`{"message":"missing usage block"}`)

	got := token.Extract("openai_chat", body, true)

	if got.InputTokens == 0 && got.OutputTokens == 0 {
		t.Fatalf("期望回退到估算值，实际是 %+v", got)
	}
}

func Test流式响应会读取最后一个带Usage的块(t *testing.T) {
	stream := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":3}}\n\ndata: [DONE]\n")

	got := token.ExtractFromStream("openai_chat", stream, false)

	if got.InputTokens != 9 || got.OutputTokens != 3 {
		t.Fatalf("期望 usage 为 9/3，实际是 %+v", got)
	}
}
