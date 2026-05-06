package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/store"
)

func TestClientKeyAllowsAccessWhenUnconfigured(t *testing.T) {
	cfg := newTestConfig(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	if !auth.CheckClientKey(req, cfg) {
		t.Fatal("未配置客户端密钥时应当允许访问")
	}
}

func TestClientKeyAcceptsBearerAndRawAuthorization(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-a", "client-b"})

	bearerReq := httptest.NewRequest(http.MethodGet, "/", nil)
	bearerReq.Header.Set("Authorization", "Bearer client-a")
	if !auth.CheckClientKey(bearerReq, cfg) {
		t.Fatal("Bearer 格式客户端密钥应当通过")
	}

	rawReq := httptest.NewRequest(http.MethodGet, "/", nil)
	rawReq.Header.Set("Authorization", "client-b")
	if !auth.CheckClientKey(rawReq, cfg) {
		t.Fatal("原始格式客户端密钥应当通过")
	}
}

func TestClientKeyRejectsMissingOrInvalidValues(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-a"})

	missingReq := httptest.NewRequest(http.MethodGet, "/", nil)
	if auth.CheckClientKey(missingReq, cfg) {
		t.Fatal("缺少客户端密钥时不应通过")
	}

	wrongReq := httptest.NewRequest(http.MethodGet, "/", nil)
	wrongReq.Header.Set("Authorization", "Bearer wrong")
	if auth.CheckClientKey(wrongReq, cfg) {
		t.Fatal("错误客户端密钥时不应通过")
	}
}

func TestClientKeyAcceptsGeminiApiKeyHeaderAndQueryKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"gem-header", "gem-query"})
	if err := cfg.SaveProvider(config.Provider{
		Name: "gemini",
		Type: config.Gemini,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	headerReq := httptest.NewRequest(http.MethodPost, "/gemini/v1beta/models", nil)
	headerReq.Header.Set("x-goog-api-key", "gem-header")
	if !auth.CheckClientKey(headerReq, cfg) {
		t.Fatal("Gemini 的 x-goog-api-key 应当通过客户端鉴权")
	}

	queryReq := httptest.NewRequest(http.MethodPost, "/gemini/v1beta/models?key=gem-query", nil)
	if !auth.CheckClientKey(queryReq, cfg) {
		t.Fatal("Gemini 的 query key 应当通过客户端鉴权")
	}
}

func TestClientKeyAcceptsClaudeApiKeyHeader(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"claude-client"})
	if err := cfg.SaveProvider(config.Provider{
		Name: "claude",
		Type: config.Claude,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/claude/v1/messages", nil)
	req.Header.Set("x-api-key", "claude-client")
	if !auth.CheckClientKey(req, cfg) {
		t.Fatal("Claude 的 x-api-key 应当通过客户端鉴权")
	}
}

func TestAdminKeyAcceptsBearerAndRawAuthorization(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	bearerReq := httptest.NewRequest(http.MethodGet, "/", nil)
	bearerReq.Header.Set("Authorization", "Bearer secret-admin")
	if !auth.CheckAdminKey(bearerReq, cfg) {
		t.Fatal("Bearer 格式管理员密钥应当通过")
	}

	rawReq := httptest.NewRequest(http.MethodGet, "/", nil)
	rawReq.Header.Set("Authorization", "secret-admin")
	if !auth.CheckAdminKey(rawReq, cfg) {
		t.Fatal("原始格式管理员密钥应当通过")
	}
}

func TestAdminKeyRejectsWhenUnconfigured(t *testing.T) {
	cfg := newTestConfig(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer anything")

	if auth.CheckAdminKey(req, cfg) {
		t.Fatal("未配置管理员密钥时不应通过")
	}
}

func TestConfigLoadsAdminAndClientKeysFromEnvironment(t *testing.T) {
	t.Setenv("ADMIN_KEY", "env-admin")
	t.Setenv("CLIENT_KEYS", "a, b ,c")

	cfg := newTestConfigWithStore(t, store.New(t.TempDir()))

	if cfg.AdminKey() != "env-admin" {
		t.Fatalf("期望读取环境变量管理员密钥 env-admin，实际是 %q", cfg.AdminKey())
	}

	keys := cfg.ClientKeys()
	if len(keys) != 3 || keys[0] != "a" || keys[1] != "b" || keys[2] != "c" {
		t.Fatalf("期望读取环境变量客户端密钥 [a b c]，实际是 %+v", keys)
	}
}
