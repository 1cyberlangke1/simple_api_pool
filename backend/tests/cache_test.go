package tests

import (
	"os"
	"path/filepath"
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
	if entry, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", body2); !ok || entry.ResponseBody != `{"id":"2"}` {
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
	if entry.ResponseBody != `{"id":"same-cache"}` {
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

	if entry, ok := store.Get("responses", config.OpenAIResponses, "gpt-5", responsesBodyWithDifferentNoise); !ok || entry.ResponseBody != `{"id":"responses-cache"}` {
		t.Fatalf("期望 Responses 按 model + input 命中缓存，实际 entry=%+v ok=%v", entry, ok)
	}
	if entry, ok := store.Get("gemini", config.Gemini, "gemini-2.5-flash", geminiBodyWithDifferentNoise); !ok || entry.ResponseBody != `{"id":"gemini-cache"}` {
		t.Fatalf("期望 Gemini 按 model + contents 命中缓存，实际 entry=%+v ok=%v", entry, ok)
	}
}
