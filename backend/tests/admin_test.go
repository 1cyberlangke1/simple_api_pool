package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/applog"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestAdminLoginAllowsRequestBodyKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	body, err := json.Marshal(map[string]string{"admin_key": "secret-admin"})
	if err != nil {
		t.Fatalf("构造登录请求失败: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestAdminBulkImportAcceptsMultipleKeyFormats(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	body, err := json.Marshal(map[string]string{"keys": " key1 \nkey2, key3 ,, \n"})
	if err != nil {
		t.Fatalf("构造导入密钥请求失败: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if len(provider.Keys) != 3 {
		t.Fatalf("期望导入 3 个密钥，实际是 %d", len(provider.Keys))
	}
}

func TestAdminBulkImportDeduplicatesExistingAndIncomingKeys(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "key-1"},
			{Value: "key-2"},
			{Value: "key-1"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	body, err := json.Marshal(map[string]string{"keys": "key-2\nkey-3, key-3 , key-4"})
	if err != nil {
		t.Fatalf("构造导入密钥请求失败: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if len(provider.Keys) != 4 {
		t.Fatalf("期望去重后保留 4 个密钥，实际是 %d", len(provider.Keys))
	}
	want := []string{"key-1", "key-2", "key-3", "key-4"}
	for i, key := range provider.Keys {
		if key.Value != want[i] {
			t.Fatalf("期望密钥顺序为 %v，实际是 %+v", want, provider.Keys)
		}
	}
}

func TestAdminDeleteSingleKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "key-1"},
			{Value: "key-2"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai/key-1", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if len(provider.Keys) != 1 || provider.Keys[0].Value != "key-2" {
		t.Fatalf("期望只剩 key-2，实际是 %+v", provider.Keys)
	}
}

func TestAdminBulkUpdateKeyStateAndDeleteKeys(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "key-1"},
			{Value: "key-2"},
			{Value: "key-3"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	disableBody, err := json.Marshal(map[string]any{
		"action": "disable",
		"keys":   []string{"key-1", "key-3"},
	})
	if err != nil {
		t.Fatalf("构造批量禁用请求失败: %v", err)
	}

	disableReq := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys/bulk", bytes.NewReader(disableBody))
	disableReq.Header.Set("Authorization", "Bearer secret-admin")
	disableRec := httptest.NewRecorder()
	h.ServeHTTP(disableRec, disableReq)

	if disableRec.Code != http.StatusOK {
		t.Fatalf("批量禁用期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, disableRec.Code, disableRec.Body.String())
	}

	providerAfterDisable, _ := cfg.Provider("openai")
	if providerAfterDisable == nil {
		t.Fatal("期望提供商存在")
	}
	if providerAfterDisable.Keys[0].DisabledUntil == 0 || providerAfterDisable.Keys[2].DisabledUntil == 0 {
		t.Fatalf("期望 key-1 和 key-3 被禁用，实际是 %+v", providerAfterDisable.Keys)
	}

	enableBody, err := json.Marshal(map[string]any{
		"action": "enable",
		"keys":   []string{"key-1"},
	})
	if err != nil {
		t.Fatalf("构造批量启用请求失败: %v", err)
	}

	enableReq := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys/bulk", bytes.NewReader(enableBody))
	enableReq.Header.Set("Authorization", "Bearer secret-admin")
	enableRec := httptest.NewRecorder()
	h.ServeHTTP(enableRec, enableReq)

	if enableRec.Code != http.StatusOK {
		t.Fatalf("批量启用期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, enableRec.Code, enableRec.Body.String())
	}

	providerAfterEnable, _ := cfg.Provider("openai")
	if providerAfterEnable == nil {
		t.Fatal("期望提供商存在")
	}
	if providerAfterEnable.Keys[0].DisabledUntil != 0 {
		t.Fatalf("期望 key-1 已重新启用，实际是 %+v", providerAfterEnable.Keys[0])
	}
	if providerAfterEnable.Keys[2].DisabledUntil == 0 {
		t.Fatalf("期望 key-3 仍保持禁用，实际是 %+v", providerAfterEnable.Keys[2])
	}

	deleteBody, err := json.Marshal(map[string]any{
		"action": "delete",
		"keys":   []string{"key-2", "key-3"},
	})
	if err != nil {
		t.Fatalf("构造批量删除请求失败: %v", err)
	}

	deleteReq := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys/bulk", bytes.NewReader(deleteBody))
	deleteReq.Header.Set("Authorization", "Bearer secret-admin")
	deleteRec := httptest.NewRecorder()
	h.ServeHTTP(deleteRec, deleteReq)

	if deleteRec.Code != http.StatusOK {
		t.Fatalf("批量删除期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, deleteRec.Code, deleteRec.Body.String())
	}

	providerAfterDelete, _ := cfg.Provider("openai")
	if providerAfterDelete == nil {
		t.Fatal("期望提供商存在")
	}
	if len(providerAfterDelete.Keys) != 1 || providerAfterDelete.Keys[0].Value != "key-1" {
		t.Fatalf("期望最终只剩 key-1，实际是 %+v", providerAfterDelete.Keys)
	}
}

func TestAdminClearProviderCache(t *testing.T) {
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
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", requestBody, []byte(`{"id":"cached","usage":{"prompt_tokens":1,"completion_tokens":1}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)
	if _, ok := cacheStore.Get("openai", config.OpenAIChat, "gpt-4.1", requestBody); !ok {
		t.Fatal("预期清空前缓存已存在")
	}

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), cacheStore)

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai/cache", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if _, ok := cacheStore.Get("openai", config.OpenAIChat, "gpt-4.1", requestBody); ok {
		t.Fatal("期望清空缓存后不再命中")
	}
}

func TestAdminOverviewReturnsConfigProvidersStatsAndRecentLogs(t *testing.T) {
	restoreRecentLogs := applog.ReplaceRecentEntriesForTesting(10)
	defer restoreRecentLogs()
	applog.AppendRecentEntryForTesting(applog.Entry{
		Time:  "2026-05-07T08:00:00Z",
		Level: "INFO",
		Msg:   "proxy_request",
		Attrs: map[string]any{"provider": "openai"},
	})

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", true, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		CacheEnabled:    true,
		CacheMaxEntries: 20,
		Keys: []config.Key{
			{Value: "key-1"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	statsManager.RecordSuccess("openai", 3, 4)

	h := handler.NewAdminHandler(cfg, statsManager, newTestCacheStore(t))
	req := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload struct {
		Health struct {
			Status string `json:"status"`
		} `json:"health"`
		GlobalConfig struct {
			AdminKey               string   `json:"admin_key"`
			TokenEstimationEnabled bool     `json:"token_estimation_enabled"`
			ClientKeys             []string `json:"client_keys"`
		} `json:"global_config"`
		Providers     []config.Provider                 `json:"providers"`
		ProviderStats map[string]handler.StatusSnapshot `json:"provider_stats"`
		RecentLogs    []applog.Entry                    `json:"recent_logs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析管理总览响应失败: %v", err)
	}
	if payload.Health.Status != "ok" {
		t.Fatalf("期望 health.status 为 ok，实际是 %q", payload.Health.Status)
	}
	if payload.GlobalConfig.AdminKey != "secret-admin" || !payload.GlobalConfig.TokenEstimationEnabled {
		t.Fatalf("期望返回全局配置，实际是 %+v", payload.GlobalConfig)
	}
	if len(payload.Providers) != 1 || payload.Providers[0].Name != "openai" {
		t.Fatalf("期望返回提供商列表，实际是 %+v", payload.Providers)
	}
	if payload.ProviderStats["openai"].InputTokens != 3 || payload.ProviderStats["openai"].OutputTokens != 4 {
		t.Fatalf("期望返回提供商统计，实际是 %+v", payload.ProviderStats["openai"])
	}
	if len(payload.RecentLogs) != 1 || payload.RecentLogs[0].Msg != "proxy_request" {
		t.Fatalf("期望返回最近日志，实际是 %+v", payload.RecentLogs)
	}
}

func TestAdminOverviewReturnsNotModifiedWhenEntityTagMatches(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", true, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	handlerInstance := handler.NewAdminHandler(cfg, statsManager, newTestCacheStore(t))

	firstRequest := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	firstRequest.Header.Set("Authorization", "Bearer secret-admin")
	firstRecorder := httptest.NewRecorder()
	handlerInstance.ServeHTTP(firstRecorder, firstRequest)

	if firstRecorder.Code != http.StatusOK {
		t.Fatalf("第一次请求期望状态码 %d，实际是 %d", http.StatusOK, firstRecorder.Code)
	}

	entityTag := firstRecorder.Header().Get("ETag")
	if entityTag == "" {
		t.Fatal("期望总览响应返回 ETag")
	}

	secondRequest := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	secondRequest.Header.Set("Authorization", "Bearer secret-admin")
	secondRequest.Header.Set("If-None-Match", entityTag)
	secondRecorder := httptest.NewRecorder()
	handlerInstance.ServeHTTP(secondRecorder, secondRequest)

	if secondRecorder.Code != http.StatusNotModified {
		t.Fatalf("命中 ETag 后期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotModified, secondRecorder.Code, secondRecorder.Body.String())
	}
	if secondRecorder.Body.Len() != 0 {
		t.Fatalf("命中 ETag 后期望无响应体，实际是 %q", secondRecorder.Body.String())
	}
}

func newTestConfig(t *testing.T) *config.Config {
	t.Helper()
	return newTestConfigWithStore(t, store.New(t.TempDir()))
}

func newTestConfigWithStore(t *testing.T, st *store.Store) *config.Config {
	t.Helper()
	return config.New(st)
}

func newTestCacheStore(t *testing.T) *cache.Store {
	t.Helper()
	cs := cache.NewStore(t.TempDir())
	t.Cleanup(func() {
		_ = cs.Close()
	})
	return cs
}
