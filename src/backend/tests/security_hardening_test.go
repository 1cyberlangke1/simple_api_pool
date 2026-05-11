package tests

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/app"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestSaveProviderRejectsLoopbackBaseURLByDefault(t *testing.T) {
	t.Setenv("ALLOW_PRIVATE_UPSTREAMS", "false")

	cfg := config.New(store.New(t.TempDir()))
	err := cfg.SaveProvider(config.Provider{
		Name:    "loopback",
		Type:    config.OpenAIChat,
		BaseURL: "http://127.0.0.1:8080",
	})
	if err == nil {
		t.Fatal("期望默认拒绝回环上游地址")
	}
}

func TestSaveProviderAllowsLoopbackBaseURLWhenOverrideEnabled(t *testing.T) {
	t.Setenv("ALLOW_PRIVATE_UPSTREAMS", "true")

	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name:    "loopback",
		Type:    config.OpenAIChat,
		BaseURL: "http://127.0.0.1:8080",
	}); err != nil {
		t.Fatalf("显式放行后保存回环上游地址仍失败: %v", err)
	}
}

func TestSaveGroupUsesReferencedProviderBaseURL(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai-a",
		Type:    config.OpenAIChat,
		BaseURL: "https://api.openai.com",
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	err := cfg.SaveGroup(config.Group{
		Name: "router",
		Type: config.OpenAIChat,
		Collections: []config.GroupCollection{
			{
				Name:     "gpt-4.1",
				Strategy: config.GroupStrategyWeightedRandom,
				Entries: []config.GroupEntry{
					{
						Provider: "openai-a",
						Model:    "gpt-4.1",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("期望分组条目直接复用目标提供商的上游地址，实际失败: %v", err)
	}
}

func TestValidatePlainHTTPConfigurationRejectsSensitiveKeysByDefault(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", false, []string{"client-key"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}

	err := app.ValidatePlainHTTPConfiguration(cfg)
	if err == nil {
		t.Fatal("期望默认拒绝携带敏感凭据的明文 HTTP 启动")
	}
}

func TestValidatePlainHTTPConfigurationAllowsOverride(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_HTTP", "true")

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", false, []string{"client-key"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}

	if err := app.ValidatePlainHTTPConfiguration(cfg); err != nil {
		t.Fatalf("显式放行明文 HTTP 后仍返回错误: %v", err)
	}
}

func TestProxyRemovesForwardingAndHopByHopHeadersBeforeUpstream(t *testing.T) {
	receivedHeaders := make(http.Header)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for key, values := range r.Header {
			receivedHeaders[key] = append([]string(nil), values...)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取上游请求体失败: %v", err)
		}
		if len(body) == 0 {
			t.Fatal("期望上游收到请求体")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"usage":{"prompt_tokens":2,"completion_tokens":1}}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai",
		Type:    config.OpenAIChat,
		BaseURL: upstream.URL,
		Keys:    []config.Key{{Value: "upstream-key"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hi"}]}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Forwarded", `for=198.51.100.8;proto=https`)
	req.Header.Set("X-Forwarded-For", "198.51.100.8")
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "evil.example")
	req.Header.Set("X-Real-IP", "198.51.100.8")
	req.Header.Set("CF-Connecting-IP", "198.51.100.8")
	req.Header.Set("Proxy-Authorization", "Basic Zm9vOmJhcg==")
	req.Header.Set("Connection", "keep-alive, x-hop-header")
	req.Header.Set("Keep-Alive", "timeout=5")
	req.Header.Set("X-Hop-Header", "strip-me")
	req.Header.Set("X-Custom-Trace", "trace-123")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if receivedHeaders.Get("Authorization") != "Bearer upstream-key" {
		t.Fatalf("期望上游鉴权头已替换，实际是 %q", receivedHeaders.Get("Authorization"))
	}
	if receivedHeaders.Get("X-Custom-Trace") != "trace-123" {
		t.Fatalf("期望普通业务头继续透传，实际是 %q", receivedHeaders.Get("X-Custom-Trace"))
	}
	for _, headerName := range []string{
		"Forwarded",
		"X-Forwarded-For",
		"X-Forwarded-Proto",
		"X-Forwarded-Host",
		"X-Real-Ip",
		"Cf-Connecting-Ip",
		"Proxy-Authorization",
		"Connection",
		"Keep-Alive",
		"X-Hop-Header",
	} {
		if receivedHeaders.Get(headerName) != "" {
			t.Fatalf("期望头 %s 不再透传到上游，实际是 %q", headerName, receivedHeaders.Get(headerName))
		}
	}
}
