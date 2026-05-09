package tests

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestLargeNonStreamCacheRouteFallsBackToPassthroughWithoutCaching(t *testing.T) {
	t.Setenv("UPSTREAM_RESPONSE_LIMIT_BYTES", "64")

	upstreamCalls := 0
	largeBody := `{"id":"large-response","payload":"` + strings.Repeat("A", 256) + `"}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(largeBody))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys:            []config.Key{{Value: "upstream-key"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), newTestCacheStore(t), 1)
	requestBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(requestBody))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		proxyHandler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次请求期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"large-response"`) {
			t.Fatalf("第 %d 次请求期望直接透传大响应，实际是 %s", i+1, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望超限非流式响应不进入缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestLargeStreamCacheRouteFallsBackToPassthroughWithoutCaching(t *testing.T) {
	upstreamCalls := 0
	largeChunk := strings.Repeat("A", (600 << 10))
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data: {\"delta\":{\"content\":\"" + largeChunk + "\"}}\n\n"))
		_, _ = w.Write([]byte("data: {\"delta\":{\"content\":\"" + largeChunk + "\"},\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":2}}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys:            []config.Key{{Value: "upstream-key"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), newTestCacheStore(t), 1)
	requestBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":true}`

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewBufferString(requestBody))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")
		rec := httptest.NewRecorder()
		proxyHandler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次流式请求期望状态码 %d，实际是 %d，响应体长度: %d", i+1, http.StatusOK, rec.Code, rec.Body.Len())
		}
		if !strings.Contains(rec.Body.String(), "data: [DONE]") {
			t.Fatalf("第 %d 次流式请求期望继续透传 SSE，实际是 %s", i+1, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望超限流式响应不进入缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}
