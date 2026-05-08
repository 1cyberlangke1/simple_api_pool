package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"simple-api-pool/cache"
	"simple-api-pool/config"
)

func TestProviderCacheUsesSingleSQLiteMainFile(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	body1 := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"a"}]}`)
	body2 := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"b"}]}`)

	store.Set("openai", config.OpenAIChat, "gpt-4.1", body1, []byte(`{"id":"1"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)
	store.Set("openai", config.OpenAIChat, "gpt-4.1", body2, []byte(`{"id":"2"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	entries, err := os.ReadDir(filepath.Join(baseDir, "openai"))
	if err != nil {
		t.Fatalf("读取缓存目录失败: %v", err)
	}

	dbFiles := 0
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".db" {
			dbFiles++
		}
	}

	if dbFiles != 1 {
		t.Fatalf("期望单提供商缓存目录里只有一个 SQLite 主文件，实际是 %d 个", dbFiles)
	}
}

func TestCacheEvictsOldEntriesWhenLimitExceeded(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	body1 := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"a"}]}`)
	body2 := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"b"}]}`)

	store.Set("openai", config.OpenAIChat, "gpt-4.1", body1, []byte(`{"id":"1"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 1)
	store.Set("openai", config.OpenAIChat, "gpt-4.1", body2, []byte(`{"id":"2"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 1)

	if _, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", body1); ok {
		t.Fatal("期望旧条目被淘汰，但仍然命中")
	}
	if entry, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", body2); !ok || string(entry.ResponseBody) != `{"id":"2"}` {
		t.Fatalf("期望新条目保留，实际 entry=%+v ok=%v", entry, ok)
	}
}

func TestOpenAIChatCacheKeyUsesOnlyModelAndMessagesWithoutRouteKey(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	firstBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image_url","image_url":{"url":"https://example.com/cat.png"}}]}],"temperature":0.1}`)
	secondBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image_url","image_url":{"url":"https://example.com/cat.png"}}]}],"temperature":1.2,"stream":true}`)

	store.Set("openai", config.OpenAIChat, "gpt-4.1", firstBody, []byte(`{"id":"same-cache"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	entry, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", secondBody)
	if !ok {
		t.Fatal("期望相同 model + messages 的请求可以命中缓存")
	}
	if string(entry.ResponseBody) != `{"id":"same-cache"}` {
		t.Fatalf("期望命中已有缓存响应，实际是 %s", entry.ResponseBody)
	}
}

func TestOpenAIChatCacheKeyDistinguishesDifferentImagesUnderSameText(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	firstBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image_url","image_url":{"url":"https://example.com/cat.png"}}]}]}`)
	secondBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image_url","image_url":{"url":"https://example.com/dog.png"}}]}]}`)

	store.Set("openai", config.OpenAIChat, "gpt-4.1", firstBody, []byte(`{"id":"cat-cache"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	if _, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", secondBody); ok {
		t.Fatal("期望相同文本但不同图片的请求不能命中同一缓存")
	}
}

func TestOpenAIChatCacheKeyTreatsEquivalentImageObjectsAsSameRequest(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	firstBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":[{"type":"text","text":"hi"},{"type":"image_url","image_url":{"url":"https://example.com/cat.png","detail":"high"}}]}]}`)
	secondBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":[{"text":"hi","type":"text"},{"image_url":{"detail":"high","url":"https://example.com/cat.png"},"type":"image_url"}]}]}`)

	store.Set("openai", config.OpenAIChat, "gpt-4.1", firstBody, []byte(`{"id":"same-image-cache"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	entry, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", secondBody)
	if !ok {
		t.Fatal("期望字段顺序不同但语义等价的多模态请求命中同一缓存")
	}
	if string(entry.ResponseBody) != `{"id":"same-image-cache"}` {
		t.Fatalf("期望命中已有缓存响应，实际是 %s", entry.ResponseBody)
	}
}

func TestCacheKeyUsesProviderSpecificCoreMessageFields(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	responsesBody := []byte(`{"model":"gpt-5","input":[{"role":"user","content":[{"type":"input_text","text":"hello"}]}],"temperature":0.2}`)
	responsesBodyWithDifferentNoise := []byte(`{"model":"gpt-5","input":[{"role":"user","content":[{"type":"input_text","text":"hello"}]}],"temperature":1.8,"metadata":{"trace":"abc"}}`)
	geminiBody := []byte(`{"model":"gemini-2.5-flash","contents":[{"role":"user","parts":[{"text":"hello"}]}],"generationConfig":{"temperature":0.3}}`)
	geminiBodyWithDifferentNoise := []byte(`{"model":"gemini-2.5-flash","contents":[{"role":"user","parts":[{"text":"hello"}]}],"generationConfig":{"temperature":1.5},"safetySettings":[{"category":"HARM_CATEGORY_HATE_SPEECH","threshold":"BLOCK_NONE"}]}`)

	store.Set("responses", config.OpenAIResponses, "gpt-5", responsesBody, []byte(`{"id":"responses-cache"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)
	store.Set("gemini", config.Gemini, "gemini-2.5-flash", geminiBody, []byte(`{"id":"gemini-cache"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	if entry, ok := store.Get("responses", config.OpenAIResponses, "gpt-5", responsesBodyWithDifferentNoise); !ok || string(entry.ResponseBody) != `{"id":"responses-cache"}` {
		t.Fatalf("期望 Responses 按 model + input 命中缓存，实际 entry=%+v ok=%v", entry, ok)
	}
	if entry, ok := store.Get("gemini", config.Gemini, "gemini-2.5-flash", geminiBodyWithDifferentNoise); !ok || string(entry.ResponseBody) != `{"id":"gemini-cache"}` {
		t.Fatalf("期望 Gemini 按 model + contents 命中缓存，实际 entry=%+v ok=%v", entry, ok)
	}
}

func TestGetForRequestReturnsPreDecoratedCachedBody(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	responseBody := []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}`)

	store.SetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, responseBody, 200, map[string]string{"Content-Type": "application/json"}, 4, 6, 10, false)

	entry, ok := store.GetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, false)
	if !ok {
		t.Fatal("期望命中非流式缓存")
	}
	if !strings.Contains(string(entry.ResponseBody), `"prompt_tokens_details":{"cached_tokens":10}`) {
		t.Fatalf("期望直接返回已注入 prompt_tokens_details.cached_tokens 的缓存体，实际是 %s", entry.ResponseBody)
	}
	if !strings.Contains(string(entry.ResponseBody), `"total_tokens":10`) {
		t.Fatalf("期望直接返回已注入 total_tokens 的缓存体，实际是 %s", entry.ResponseBody)
	}
}

func TestStreamAndNonStreamRequestCachesUseSeparateEntries(t *testing.T) {
	baseDir := t.TempDir()
	store := cache.NewStore(baseDir)
	t.Cleanup(func() { _ = store.Close() })

	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":false}`)
	nonStreamResponse := []byte(`{"id":"non-stream","usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}`)
	streamResponse := []byte("data: {\"id\":\"stream-1\"}\n\ndata: [DONE]\n\n")

	if ok := store.SetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, nonStreamResponse, 200, map[string]string{"Content-Type": "application/json"}, 4, 6, 1, false); !ok {
		t.Fatal("写入非流式缓存失败")
	}
	if ok := store.SetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, streamResponse, 200, map[string]string{"Content-Type": "text/event-stream"}, 4, 6, 1, true); !ok {
		t.Fatal("写入流式缓存失败")
	}

	if _, ok := store.GetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, false); ok {
		t.Fatal("期望 maxEntries=1 时，后写入的流式缓存占用独立条目并淘汰旧的非流式缓存")
	}
	entry, ok := store.GetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, true)
	if !ok {
		t.Fatal("期望保留最新写入的流式缓存")
	}
	if !strings.Contains(string(entry.ResponseBody), `"id":"stream-1"`) {
		t.Fatalf("期望命中流式缓存内容，实际是 %s", entry.ResponseBody)
	}
}

func TestPrepareCachedBodiesBuildsLegalOpenAIChatStream(t *testing.T) {
	nonStreamBody, streamBody := cache.PrepareCachedBodies(
		config.OpenAIChat,
		[]byte(`{"id":"chat-1","object":"chat.completion","model":"glm-4.6v-flash","choices":[{"index":0,"message":{"role":"assistant","content":"hello zhipu"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}`),
		5,
		7,
	)

	if !strings.Contains(string(nonStreamBody), `"prompt_tokens_details":{"cached_tokens":12}`) {
		t.Fatalf("期望 OpenAI Chat 缓存响应注入 prompt_tokens_details.cached_tokens，实际是 %s", nonStreamBody)
	}
	if !strings.Contains(string(streamBody), `"object":"chat.completion.chunk"`) {
		t.Fatalf("期望 OpenAI Chat 流式缓存回放使用 chunk 对象，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `"delta":{"content":"hello zhipu","role":"assistant"}`) &&
		!strings.Contains(string(streamBody), `"delta":{"role":"assistant","content":"hello zhipu"}`) {
		t.Fatalf("期望 OpenAI Chat 流式缓存回放在 delta.content 中返回正文，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `data: [DONE]`) {
		t.Fatalf("期望 OpenAI Chat 流式缓存回放带结束标记，实际是 %s", streamBody)
	}
}

func TestPrepareCachedBodiesBuildsLegalResponsesStream(t *testing.T) {
	_, streamBody := cache.PrepareCachedBodies(
		config.OpenAIResponses,
		[]byte(`{"id":"resp_1","object":"response","status":"completed","model":"gpt-5","output":[{"type":"message","id":"msg_1","status":"completed","role":"assistant","content":[{"type":"output_text","text":"hello responses","annotations":[]}]}],"usage":{"input_tokens":9,"output_tokens":4,"total_tokens":13}}`),
		9,
		4,
	)

	if !strings.Contains(string(streamBody), `"type":"response.output_text.delta"`) {
		t.Fatalf("期望 Responses 流式缓存回放输出 output_text.delta，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `"delta":"hello responses"`) {
		t.Fatalf("期望 Responses 流式缓存回放输出正文 delta，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `"type":"response.completed"`) {
		t.Fatalf("期望 Responses 流式缓存回放输出 response.completed，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `data: [DONE]`) {
		t.Fatalf("期望 Responses 流式缓存回放带结束标记，实际是 %s", streamBody)
	}
}

func TestPrepareCachedBodiesBuildsLegalClaudeStream(t *testing.T) {
	_, streamBody := cache.PrepareCachedBodies(
		config.Claude,
		[]byte(`{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5","stop_reason":"end_turn","stop_sequence":null,"content":[{"type":"text","text":"hello claude"}],"usage":{"input_tokens":8,"output_tokens":6}}`),
		8,
		6,
	)

	if !strings.Contains(string(streamBody), `"type":"message_start"`) {
		t.Fatalf("期望 Claude 流式缓存回放输出 message_start，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `"type":"content_block_delta"`) {
		t.Fatalf("期望 Claude 流式缓存回放输出 content_block_delta，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `"text":"hello claude"`) {
		t.Fatalf("期望 Claude 流式缓存回放输出正文文本，实际是 %s", streamBody)
	}
	if !strings.Contains(string(streamBody), `"type":"message_stop"`) {
		t.Fatalf("期望 Claude 流式缓存回放输出 message_stop，实际是 %s", streamBody)
	}
}

func TestDecorateCachedStreamBodyUsesOfficialCachedTokenFields(t *testing.T) {
	openAIChatStream := cache.DecorateCachedStreamBody(
		config.OpenAIChat,
		[]byte("data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-4.1\",\"choices\":[],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":6,\"total_tokens\":10}}\n\ndata: [DONE]\n\n"),
		4,
		6,
	)
	if !strings.Contains(string(openAIChatStream), `"prompt_tokens_details":{"cached_tokens":10}`) {
		t.Fatalf("期望 OpenAI Chat 流式缓存命中带 prompt_tokens_details.cached_tokens，实际是 %s", openAIChatStream)
	}

	responsesStream := cache.DecorateCachedStreamBody(
		config.OpenAIResponses,
		[]byte("data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_1\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-5\",\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"total_tokens\":13}}}\n\ndata: [DONE]\n\n"),
		9,
		4,
	)
	if !strings.Contains(string(responsesStream), `"input_tokens_details":{"cached_tokens":13}`) {
		t.Fatalf("期望 Responses 流式缓存命中带 input_tokens_details.cached_tokens，实际是 %s", responsesStream)
	}

	claudeStream := cache.DecorateCachedStreamBody(
		config.Claude,
		[]byte("event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"input_tokens\":8,\"output_tokens\":6}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"),
		8,
		6,
	)
	if !strings.Contains(string(claudeStream), `"cache_read_input_tokens":14`) {
		t.Fatalf("期望 Claude 流式缓存命中带 cache_read_input_tokens，实际是 %s", claudeStream)
	}

	geminiStream := cache.DecorateCachedStreamBody(
		config.Gemini,
		[]byte("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"hello gemini\"}]}}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\n\n"),
		6,
		5,
	)
	if !strings.Contains(string(geminiStream), `"cachedContentTokenCount":11`) {
		t.Fatalf("期望 Gemini 流式缓存命中带 cachedContentTokenCount，实际是 %s", geminiStream)
	}
}

func TestDecorateCachedStreamBodyPreservesGeminiEventsAcrossLineEndings(t *testing.T) {
	testCases := []struct {
		name       string
		streamBody string
	}{
		{
			name:       "lf",
			streamBody: "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}]}}]}\n\ndata: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" Gemini\"}]}}]}\n\ndata: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\n\n",
		},
		{
			name:       "crlf",
			streamBody: "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}]}}]}\r\n\r\ndata: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" Gemini\"}]}}]}\r\n\r\ndata: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\r\n\r\n",
		},
		{
			name:       "cr",
			streamBody: "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}]}}]}\r\rdata: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" Gemini\"}]}}]}\r\rdata: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\r\r",
		},
		{
			name:       "mixed",
			streamBody: "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}]}}]}\r\n\r\ndata: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" Gemini\"}]}}]}\n\ndata: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\r\r",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			geminiStream := cache.DecorateCachedStreamBody(
				config.Gemini,
				[]byte(tc.streamBody),
				6,
				5,
			)
			streamText := string(geminiStream)
			if strings.Count(streamText, "data: ") != 3 {
				t.Fatalf("期望保留 3 个 Gemini SSE 事件，实际是 %d，内容是 %s", strings.Count(streamText, "data: "), streamText)
			}
			if !strings.Contains(streamText, `"text":"Hello"`) || !strings.Contains(streamText, `"text":" Gemini"`) {
				t.Fatalf("期望保留 Gemini 的完整多事件文本，实际是 %s", streamText)
			}
			if !strings.Contains(streamText, `"cachedContentTokenCount":11`) {
				t.Fatalf("期望 Gemini 流式缓存命中带 cachedContentTokenCount，实际是 %s", streamText)
			}
			if strings.Contains(streamText, "\r") {
				t.Fatalf("期望输出统一规范化为 LF 分隔，实际是 %q", streamText)
			}
			if !strings.Contains(streamText, "\n\ndata: ") {
				t.Fatalf("期望输出使用 LF 空行分隔事件，实际是 %q", streamText)
			}
		})
	}
}

func TestDecorateCachedStreamBodyKeepsGeminiUsageOnlyOnFinalEvent(t *testing.T) {
	geminiStream := cache.DecorateCachedStreamBody(
		config.Gemini,
		[]byte(
			"data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"thought-1\"}]}}],\"usageMetadata\":{\"promptTokenCount\":417,\"totalTokenCount\":431,\"thoughtsTokenCount\":14}}\n\n"+
				"data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"draft\"}]}}],\"usageMetadata\":{\"promptTokenCount\":417,\"candidatesTokenCount\":422,\"totalTokenCount\":839,\"thoughtsTokenCount\":839}}\n\n"+
				"data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"final-text\"}]}}],\"usageMetadata\":{\"promptTokenCount\":417,\"candidatesTokenCount\":439,\"totalTokenCount\":856,\"thoughtsTokenCount\":839}}\n\n"+
				"data: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":417,\"candidatesTokenCount\":439,\"totalTokenCount\":856,\"thoughtsTokenCount\":839}}\n\n",
		),
		417,
		439,
	)
	streamText := string(geminiStream)
	if strings.Contains(streamText, `"candidatesTokenCount":422`) {
		t.Fatalf("期望 Gemini 流式缓存只在最终事件保留 output token，实际是 %s", streamText)
	}
	if strings.Count(streamText, `"candidatesTokenCount":439`) != 1 {
		t.Fatalf("期望 Gemini 流式缓存只保留一个最终 candidatesTokenCount，实际是 %s", streamText)
	}
	if strings.Count(streamText, `"cachedContentTokenCount":856`) != 1 {
		t.Fatalf("期望 Gemini 流式缓存只保留一个最终 cachedContentTokenCount，实际是 %s", streamText)
	}
}

func TestDecorateCachedStreamBodyKeepsClaudeUsageOnlyOnFinalEvent(t *testing.T) {
	claudeStream := cache.DecorateCachedStreamBody(
		config.Claude,
		[]byte(
			"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"text\":\"A\"},\"usage\":{\"input_tokens\":8,\"output_tokens\":2}}\n\n"+
				"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"text\":\"B\"},\"usage\":{\"input_tokens\":8,\"output_tokens\":6}}\n\n"+
				"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
		),
		8,
		6,
	)
	streamText := string(claudeStream)
	if strings.Contains(streamText, `"output_tokens":2`) {
		t.Fatalf("期望 Claude 流式缓存移除早期累计 usage，实际是 %s", streamText)
	}
	if strings.Count(streamText, `"output_tokens":6`) != 1 {
		t.Fatalf("期望 Claude 流式缓存只保留一个最终 output_tokens，实际是 %s", streamText)
	}
	if strings.Count(streamText, `"cache_read_input_tokens":14`) != 1 {
		t.Fatalf("期望 Claude 流式缓存只保留一个最终 cache_read_input_tokens，实际是 %s", streamText)
	}
}

func TestDecorateCachedStreamBodyParsesMultilineClaudeDataChunk(t *testing.T) {
	claudeStream := cache.DecorateCachedStreamBody(
		config.Claude,
		[]byte(
			"event: message_delta\n"+
				"data: {\"type\":\"message_delta\",\"delta\":\n"+
				"data: {\"text\":\"hello\"},\"usage\":{\"input_tokens\":8,\"output_tokens\":6}}\n\n"+
				"event: message_stop\n"+
				"data: {\"type\":\"message_stop\"}\n\n",
		),
		8,
		6,
	)

	streamText := string(claudeStream)
	if !strings.Contains(streamText, `"text":"hello"`) {
		t.Fatalf("期望保留多行 Claude SSE 事件内容，实际是 %s", streamText)
	}
	if !strings.Contains(streamText, `"cache_read_input_tokens":14`) {
		t.Fatalf("期望多行 Claude SSE 事件仍能注入缓存 token，实际是 %s", streamText)
	}
}
