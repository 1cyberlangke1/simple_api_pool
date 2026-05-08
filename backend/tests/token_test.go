package tests

import (
	"testing"

	"simple-api-pool/token"
)

func TestExtractOpenAIResponseTokenCounts(t *testing.T) {
	body := []byte(`{"usage":{"prompt_tokens":12,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":5}}}`)

	got := token.Extract("openai_chat", body, false)

	if got.InputTokens != 12 || got.OutputTokens != 7 || got.CacheTokens != 5 {
		t.Fatalf("期望 usage 为 12/7，实际是 %+v", got)
	}
}

func TestExtractOpenAIResponsesTopLevelUsageTokenCounts(t *testing.T) {
	body := []byte(`{"id":"resp_123","object":"response","usage":{"input_tokens":18,"output_tokens":9,"total_tokens":27,"input_tokens_details":{"cached_tokens":8}}}`)

	got := token.Extract("openai_responses", body, false)

	if got.InputTokens != 18 || got.OutputTokens != 9 || got.CacheTokens != 8 {
		t.Fatalf("期望 usage 为 18/9，实际是 %+v", got)
	}
}

func TestExtractClaudeCacheTokenCounts(t *testing.T) {
	body := []byte(`{"usage":{"input_tokens":20,"output_tokens":6,"cache_creation_input_tokens":4,"cache_read_input_tokens":9}}`)

	got := token.Extract("claude", body, false)

	if got.InputTokens != 20 || got.OutputTokens != 6 || got.CacheTokens != 13 {
		t.Fatalf("期望 Claude usage 为 20/6，缓存 token=13，实际是 %+v", got)
	}
}

func TestExtractGeminiCacheTokenCounts(t *testing.T) {
	body := []byte(`{"usageMetadata":{"promptTokenCount":14,"candidatesTokenCount":5,"totalTokenCount":19,"cachedContentTokenCount":7}}`)

	got := token.Extract("gemini", body, false)

	if got.InputTokens != 14 || got.OutputTokens != 5 || got.CacheTokens != 7 {
		t.Fatalf("期望 Gemini usage 为 14/5，缓存 token=7，实际是 %+v", got)
	}
}

func TestMissingTokenUsageFallsBackToEstimation(t *testing.T) {
	body := []byte(`{"message":"missing usage block"}`)

	got := token.Extract("openai_chat", body, true)

	if got.InputTokens == 0 && got.OutputTokens == 0 {
		t.Fatalf("期望回退到估算值，实际是 %+v", got)
	}
}

func TestStreamResponseUsesLastChunkWithUsage(t *testing.T) {
	stream := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":3,\"prompt_tokens_details\":{\"cached_tokens\":4}}}\n\ndata: [DONE]\n")

	got := token.ExtractFromStream("openai_chat", stream, false)

	if got.InputTokens != 9 || got.OutputTokens != 3 || got.CacheTokens != 4 {
		t.Fatalf("期望 usage 为 9/3，实际是 %+v", got)
	}
}

func TestStreamResponseParsesMultilineSSEDataPayload(t *testing.T) {
	stream := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: {\"usage\":\ndata: {\"prompt_tokens\":9,\"completion_tokens\":3,\"prompt_tokens_details\":{\"cached_tokens\":4}}}\n\ndata: [DONE]\n")

	got := token.ExtractFromStream("openai_chat", stream, false)

	if got.InputTokens != 9 || got.OutputTokens != 3 || got.CacheTokens != 4 {
		t.Fatalf("期望多行 SSE data 仍能提取 usage=9/3/4，实际是 %+v", got)
	}
}

func TestGeminiStreamUsesTotalTokensWithoutInventingSplit(t *testing.T) {
	stream := []byte("data: {\"usageMetadata\":{\"totalTokenCount\":19,\"cachedContentTokenCount\":7}}\n\n")

	got := token.ExtractFromStream("gemini", stream, false)

	if got.InputTokens != 19 || got.OutputTokens != 0 || got.CacheTokens != 7 {
		t.Fatalf("期望 Gemini 只有总 token 时不虚构 input/output 拆分，实际是 %+v", got)
	}
}
