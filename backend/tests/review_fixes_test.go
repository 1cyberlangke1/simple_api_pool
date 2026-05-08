package tests

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"simple-api-pool/adminapi"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestSaveProviderAllowsExplicitKeyReplacement(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "old-key"}},
	}); err != nil {
		t.Fatalf("保存初始提供商失败: %v", err)
	}

	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "new-key"}},
	}); err != nil {
		t.Fatalf("替换提供商密钥失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if len(provider.Keys) != 1 || provider.Keys[0].Value != "new-key" {
		t.Fatalf("期望显式传入的新密钥被保存，实际是 %+v", provider.Keys)
	}
}

func TestApplyKeyActionDisableUsesPermanentTimestamp(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "k1"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	if err := cfg.ApplyKeyAction("openai", "disable", []string{"k1"}); err != nil {
		t.Fatalf("手动禁用密钥失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if provider.Keys[0].DisabledUntil <= time.Now().AddDate(100, 0, 0).Unix() {
		t.Fatalf("期望手动禁用写入长期禁用时间，实际是 %d", provider.Keys[0].DisabledUntil)
	}
}

func TestRoundRobinResetsWhenAvailableKeysChange(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name:        "openai",
		Type:        config.OpenAIChat,
		KeyStrategy: "round_robin",
		Keys: []config.Key{
			{Value: "k1"},
			{Value: "k2"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	kr := keyring.New(cfg)
	first, _ := kr.GetKey("openai")
	second, _ := kr.GetKey("openai")
	if first != "k1" || second != "k2" {
		t.Fatalf("期望初始轮询顺序为 k1 -> k2，实际是 %q -> %q", first, second)
	}

	cfg.UpdateKeyState("openai", "k1", time.Now().Add(time.Hour).Unix(), 0)
	disabledOnly, _ := kr.GetKey("openai")
	if disabledOnly != "k2" {
		t.Fatalf("期望禁用 k1 后只返回 k2，实际是 %q", disabledOnly)
	}

	cfg.UpdateKeyState("openai", "k1", 0, 0)
	resetFirst, _ := kr.GetKey("openai")
	if resetFirst != "k1" {
		t.Fatalf("期望可用密钥集合变化后从 k1 重新开始轮询，实际是 %q", resetFirst)
	}
}

func TestStatsManagerFlushesDirtyDataQuickly(t *testing.T) {
	testStore := store.New(t.TempDir())
	statsManager := stats.NewManager(testStore)
	defer statsManager.Stop()

	statsManager.RecordSuccess("openai", 3, 4)
	statsManager.RecordError("openai", http.StatusTooManyRequests)
	statsManager.RecordCacheHit("openai", 7)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var snapshot map[string]stats.Snapshot
		if err := testStore.Load("stats/all.json", &snapshot); err == nil {
			openaiStats := snapshot["openai"]
			if openaiStats.SuccessCount == 1 && openaiStats.ErrorCount == 1 && openaiStats.CacheHits == 1 {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("期望统计数据在短时间内刷盘")
}

func TestCacheRouteBypassesCacheForOversizedRequestBody(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"large-body","usage":{"prompt_tokens":2,"completion_tokens":1}}`))
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
	cacheStore := newTestCacheStore(t)
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), cacheStore, 1)

	largeContent := strings.Repeat("a", (1<<20)+128)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"` + largeContent + `"}]}`)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		proxyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次大请求期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望超大请求绕过缓存直通上游两次，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestCacheRouteBypassesCacheForRequestBodyAboveDefaultMemoryBudget(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"mid-body","usage":{"prompt_tokens":2,"completion_tokens":1}}`))
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
	cacheStore := newTestCacheStore(t)
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), cacheStore, 1)

	bodyContent := strings.Repeat("a", 300<<10)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"` + bodyContent + `"}]}`)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		proxyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次中型请求期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望超出默认内存预算的请求体不进入缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestProxyStreamsLargeUpstreamErrorBody(t *testing.T) {
	largeErrorBody := strings.Repeat("quota-exceeded;", 1<<16)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(largeErrorBody))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
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

	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", strings.NewReader(`{"model":"gpt-4.1"}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxyHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusTooManyRequests, rec.Code)
	}
	if rec.Body.Len() != len(largeErrorBody) {
		t.Fatalf("期望原样透传完整错误体，期望长度 %d，实际是 %d", len(largeErrorBody), rec.Body.Len())
	}
	if rec.Body.String() != largeErrorBody {
		t.Fatal("期望错误响应体内容保持不变")
	}
}

func TestProxyPassesThroughOversizedNonStreamUpstreamResponseWithoutCaching(t *testing.T) {
	t.Setenv("UPSTREAM_RESPONSE_LIMIT_BYTES", "64")

	oversizedBody := strings.Repeat("abcdefgh", 16)
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(oversizedBody))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}
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

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		proxyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次超大非流式响应期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
		if rec.Body.String() != oversizedBody {
			t.Fatalf("第 %d 次超大非流式响应期望原样透传，实际是 %s", i+1, rec.Body.String())
		}
		if got := rec.Header().Get("Content-Type"); !strings.Contains(got, "application/json") {
			t.Fatalf("第 %d 次超大非流式响应期望保留 Content-Type，实际是 %q", i+1, got)
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望超大非流式响应不进入缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestProxyDefaultsToPassthroughForMediumNonStreamResponses(t *testing.T) {
	oversizedBody := strings.Repeat("abcdefgh", 24<<10)
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(oversizedBody))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}
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

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		proxyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次中等响应期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
		if rec.Body.String() != oversizedBody {
			t.Fatalf("第 %d 次中等响应期望保持透传，实际是 %s", i+1, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望默认配置下中等非流式响应走透传不走缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestBrokenStreamResponseIsNotCachedAsCompleteResponse(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("期望测试服务器支持 Hijacker")
		}
		conn, rw, err := hijacker.Hijack()
		if err != nil {
			t.Fatalf("劫持连接失败: %v", err)
		}
		defer conn.Close()

		event := "data: {\"id\":\"partial\"}\n\n"
		_, _ = rw.WriteString("HTTP/1.1 200 OK\r\n")
		_, _ = rw.WriteString("Content-Type: text/event-stream\r\n")
		_, _ = rw.WriteString("Transfer-Encoding: chunked\r\n")
		_, _ = rw.WriteString("\r\n")
		_, _ = rw.WriteString(fmt.Sprintf("%x\r\n%s\r\n", len(event), event))
		_ = rw.Flush()
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}
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
	cacheStore := newTestCacheStore(t)
	proxyHandler := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), cacheStore, 1)

	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":true}`
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")
		rec := httptest.NewRecorder()

		proxyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次损坏流响应期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"id":"partial"`) {
			t.Fatalf("第 %d 次损坏流响应期望透传已收到的上游片段，实际是 %s", i+1, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望损坏流响应不写入缓存，第二次继续访问上游，实际上游调用次数是 %d", upstreamCalls)
	}

	providerStats := statsManager.Snapshot()["openai"]
	if providerStats.SuccessCount != 0 {
		t.Fatalf("期望损坏流响应不计为成功，实际 success_count 是 %d", providerStats.SuccessCount)
	}
	if providerStats.ErrorCount != 2 {
		t.Fatalf("期望损坏流响应计入错误两次，实际 error_count 是 %d", providerStats.ErrorCount)
	}
}

func TestDeleteProviderAlsoClearsProviderStats(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	statsManager.RecordSuccess("openai", 3, 4)
	statsManager.RecordError("openai", http.StatusTooManyRequests)

	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	adminHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if _, ok := statsManager.Snapshot()["openai"]; ok {
		t.Fatal("期望删除提供商后同步清理统计项")
	}
}
