package tests

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func BenchmarkCacheHitRouteParallel(b *testing.B) {
	restoreLogger := muteBenchmarkLogger()
	defer restoreLogger()

	cfg := newBenchmarkConfig(b)
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
	b.Cleanup(func() { statsMgr.Stop() })
	cacheStore := newBenchmarkCacheStore(b)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"load"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 20)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 128)

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
			req.Header.Set("Authorization", "Bearer client-key")
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			proxy.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				b.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
			}
		}
	})
}

func BenchmarkDirectStreamProxy(b *testing.B) {
	restoreLogger := muteBenchmarkLogger()
	defer restoreLogger()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data: {\"id\":\"chunk-1\",\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n"))
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer upstream.Close()

	cfg := newBenchmarkConfig(b)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai",
		Type:    config.OpenAIChat,
		BaseURL: upstream.URL,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		b.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(b.TempDir()))
	b.Cleanup(func() { statsMgr.Stop() })
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newBenchmarkCacheStore(b), 64)
	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":true}`

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			b.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
		}
	}
}

func newBenchmarkConfig(tb testing.TB) *config.Config {
	tb.Helper()
	return config.New(store.New(tb.TempDir()))
}

func muteBenchmarkLogger() func() {
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(io.Discard))
	return func() {
		slog.SetDefault(oldLogger)
	}
}
