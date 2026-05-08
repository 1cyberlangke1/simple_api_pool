package tests

import (
	"fmt"
	"testing"

	"simple-api-pool/cache"
	"simple-api-pool/config"
)

func BenchmarkCacheSQLiteSet(b *testing.B) {
	store := cache.NewStore(b.TempDir())
	b.Cleanup(func() {
		_ = store.Close()
	})

	headers := map[string]string{"Content-Type": "application/json"}
	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		body := []byte(fmt.Sprintf(`{"model":"gpt-4.1","messages":[{"role":"user","content":"bench-set-%d"}]}`, i))
		response := []byte(fmt.Sprintf(`{"id":"bench-set-%d"}`, i))
		store.Set("openai", config.OpenAIChat, "gpt-4.1", body, response, 200, headers, 1, 1, int64(b.N+1))
	}
}

func BenchmarkCacheSQLiteGet(b *testing.B) {
	store := cache.NewStore(b.TempDir())
	b.Cleanup(func() {
		_ = store.Close()
	})

	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"bench-get"}]}`)
	store.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"bench-get"}`), 200, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		entry, ok := store.Get("openai", config.OpenAIChat, "gpt-4.1", body)
		if !ok || string(entry.ResponseBody) != `{"id":"bench-get"}` {
			b.Fatalf("基准读取未命中或响应错误: ok=%v entry=%+v", ok, entry)
		}
	}
}
