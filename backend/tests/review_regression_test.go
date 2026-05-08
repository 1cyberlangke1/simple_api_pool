package tests

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"simple-api-pool/adminapi"
	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
	"simple-api-pool/token"
)

func TestAdminSessionCookieDefaultsToSecure(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	httpReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/admin/login", nil)
	httpRec := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(httpRec, httpReq, cfg); err != nil {
		t.Fatalf("签发管理员会话 Cookie 失败: %v", err)
	}

	httpCookies := httpRec.Result().Cookies()
	if len(httpCookies) != 1 {
		t.Fatalf("期望签发 1 个管理员会话 Cookie，实际是 %d", len(httpCookies))
	}
	if !httpCookies[0].Secure {
		t.Fatal("管理员会话 Cookie 默认应启用 Secure")
	}

	httpsReq := httptest.NewRequest(http.MethodPost, "https://example.com/api/admin/login", nil)
	httpsReq.TLS = &tls.ConnectionState{}
	httpsRec := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(httpsRec, httpsReq, cfg); err != nil {
		t.Fatalf("签发 HTTPS 管理员会话 Cookie 失败: %v", err)
	}

	httpsCookies := httpsRec.Result().Cookies()
	if len(httpsCookies) != 1 {
		t.Fatalf("期望签发 1 个 HTTPS 管理员会话 Cookie，实际是 %d", len(httpsCookies))
	}
	if !httpsCookies[0].Secure {
		t.Fatal("HTTPS 请求下管理员会话 Cookie 应继续保持 Secure")
	}
}

func TestAdminSessionCookieAllowsExplicitInsecureOverride(t *testing.T) {
	t.Setenv("ADMIN_COOKIE_SECURE", "false")

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	rec := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(rec, req, cfg); err != nil {
		t.Fatalf("签发管理员会话 Cookie 失败: %v", err)
	}

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("期望签发 1 个管理员会话 Cookie，实际是 %d", len(cookies))
	}
	if cookies[0].Secure {
		t.Fatal("显式关闭后不应继续为管理员会话 Cookie 设置 Secure")
	}
}

func TestDeleteProviderAlsoClearsProviderCache(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	cacheStore := newTestCacheStore(t)
	requestBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", requestBody, []byte(`{"id":"cached"}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)
	if _, ok := cacheStore.Get("openai", config.OpenAIChat, "gpt-4.1", requestBody); !ok {
		t.Fatal("期望删除前缓存已存在")
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	adminHandler := adminapi.NewHandler(cfg, statsManager, cacheStore)

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	adminHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if provider, _ := cfg.Provider("openai"); provider != nil {
		t.Fatalf("期望提供商已删除，实际仍存在: %+v", provider)
	}
	if _, ok := cacheStore.Get("openai", config.OpenAIChat, "gpt-4.1", requestBody); ok {
		t.Fatal("期望删除提供商后同步清理对应缓存")
	}
}

func TestStatsManagerSupportsConcurrentProviderCreation(t *testing.T) {
	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()

	const providerCount = 128
	const perProviderWrites = 8

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < providerCount; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			name := fmt.Sprintf("provider-%03d", index)
			for round := 0; round < perProviderWrites; round++ {
				statsManager.RecordSuccess(name, 1, 2)
				statsManager.RecordError(name, http.StatusTooManyRequests)
				statsManager.RecordCacheHit(name, 3)
			}
		}(i)
	}

	close(start)
	wg.Wait()

	snapshot := statsManager.Snapshot()
	if len(snapshot) != providerCount {
		t.Fatalf("期望有 %d 个提供商统计，实际是 %d", providerCount, len(snapshot))
	}

	for i := 0; i < providerCount; i++ {
		name := fmt.Sprintf("provider-%03d", i)
		providerStats, ok := snapshot[name]
		if !ok {
			t.Fatalf("期望快照中存在 %s", name)
		}
		if providerStats.SuccessCount != perProviderWrites {
			t.Fatalf("%s 成功次数期望为 %d，实际是 %d", name, perProviderWrites, providerStats.SuccessCount)
		}
		if providerStats.ErrorCount != perProviderWrites {
			t.Fatalf("%s 失败次数期望为 %d，实际是 %d", name, perProviderWrites, providerStats.ErrorCount)
		}
		if providerStats.CacheHits != perProviderWrites {
			t.Fatalf("%s 缓存命中次数期望为 %d，实际是 %d", name, perProviderWrites, providerStats.CacheHits)
		}
	}
}

func TestCacheRouteFallsBackToDirectProxyWhenProviderCacheDisabled(t *testing.T) {
	var upstreamCalls int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("期望透传路径 /v1/chat/completions，实际是 %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"usage":{"prompt_tokens":4,"completion_tokens":2}}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:         "openai",
		Type:         config.OpenAIChat,
		BaseURL:      upstream.URL,
		CacheEnabled: false,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxyHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望直接访问上游 1 次，实际是 %d", upstreamCalls)
	}
}

func TestTokenEstimationUsesUTF8ByteLengthForResponses(t *testing.T) {
	body := []byte(`{"message":"你好，世界，你好，世界"}`)

	got := token.Extract("openai_chat", body, true)

	expectedTotal := int64(len(body) / 4)
	if expectedTotal < 1 {
		expectedTotal = 1
	}
	if got.InputTokens+got.OutputTokens != expectedTotal {
		t.Fatalf("期望按字节数估算总 token=%d，实际是 %+v", expectedTotal, got)
	}
}

func TestTokenEstimationUsesUTF8ByteLengthForStreams(t *testing.T) {
	streamBody := []byte("data: {\"delta\":{\"content\":\"你好，世界，你好，世界\"}}\n\n")

	got := token.ExtractFromStream("openai_chat", streamBody, true)

	expectedTotal := int64(len(streamBody) / 4)
	if expectedTotal < 1 {
		expectedTotal = 1
	}
	if got.InputTokens+got.OutputTokens != expectedTotal {
		t.Fatalf("期望按字节数估算流式总 token=%d，实际是 %+v", expectedTotal, got)
	}
}

func TestSessionAuthenticatedAdminWriteRejectsCrossOriginRequest(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	loginReq := httptest.NewRequest(http.MethodPost, "https://example.com/api/admin/login", nil)
	loginReq.TLS = &tls.ConnectionState{}
	loginRec := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(loginRec, loginReq, cfg); err != nil {
		t.Fatalf("签发管理员会话失败: %v", err)
	}

	cookies := loginRec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("期望签发 1 个管理员会话 Cookie，实际是 %d", len(cookies))
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	body := bytes.NewBufferString(`{"token_estimation_enabled":true}`)
	req := httptest.NewRequest(http.MethodPut, "https://example.com/api/admin/config", body)
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://evil.example")
	req.AddCookie(cookies[0])
	rec := httptest.NewRecorder()

	adminHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("跨站会话写请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusForbidden, rec.Code, rec.Body.String())
	}
}

func TestSessionAuthenticatedAdminWriteAllowsSameOriginRequest(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	loginReq := httptest.NewRequest(http.MethodPost, "https://example.com/api/admin/login", nil)
	loginReq.TLS = &tls.ConnectionState{}
	loginRec := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(loginRec, loginReq, cfg); err != nil {
		t.Fatalf("签发管理员会话失败: %v", err)
	}

	cookies := loginRec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("期望签发 1 个管理员会话 Cookie，实际是 %d", len(cookies))
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	body := bytes.NewBufferString(`{"token_estimation_enabled":true}`)
	req := httptest.NewRequest(http.MethodPut, "https://example.com/api/admin/config", body)
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://example.com")
	req.AddCookie(cookies[0])
	rec := httptest.NewRecorder()

	adminHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("同源会话写请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestAdminWriteWithAuthorizationHeaderDoesNotRequireOrigin(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	body := bytes.NewBufferString(`{"token_estimation_enabled":true}`)
	req := httptest.NewRequest(http.MethodPut, "https://example.com/api/admin/config", body)
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("Authorization", "Bearer secret-admin")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	adminHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("显式管理员密钥请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestProxyDoesNotFollowUpstreamRedirect(t *testing.T) {
	redirectTargetCalls := 0
	redirectTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirectTargetCalls++
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"message":"unexpected target"}`))
	}))
	defer redirectTarget.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", redirectTarget.URL+"/final")
		w.WriteHeader(http.StatusTemporaryRedirect)
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

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxyHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTemporaryRedirect {
		t.Fatalf("期望保留上游重定向状态码 %d，实际是 %d，响应体: %s", http.StatusTemporaryRedirect, rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Location") != redirectTarget.URL+"/final" {
		t.Fatalf("期望透传上游 Location，实际是 %q", rec.Header().Get("Location"))
	}
	if redirectTargetCalls != 0 {
		t.Fatalf("期望代理不跟随上游重定向，实际上游目标被访问了 %d 次", redirectTargetCalls)
	}
}
