package tests

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func BenchmarkProxyCacheHit(b *testing.B) {
	restoreLogger := muteBenchmarkLogger()
	defer restoreLogger()

	cfg := config.New(store.New(b.TempDir()))
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         "http://127.0.0.1:1",
		CacheEnabled:    true,
		CacheMaxEntries: 100,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		b.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(b.TempDir()))
	b.Cleanup(func() {
		statsMgr.Stop()
	})
	cacheStore := newBenchmarkCacheStore(b)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"bench-proxy"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 100)

	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 64)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			b.Fatalf("期望状态码为 %d，实际是 %d", http.StatusOK, rec.Code)
		}
	}
}

func newBenchmarkCacheStore(b *testing.B) *cache.Store {
	b.Helper()
	cs := cache.NewStore(b.TempDir())
	b.Cleanup(func() {
		_ = cs.Close()
	})
	return cs
}
