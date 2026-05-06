package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestAdminLoginAllowsRequestBodyKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())))

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

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())))

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

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())))

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

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())))

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
