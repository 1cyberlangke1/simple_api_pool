package tests

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/store"
)

func TestClientKeyRejectsAccessWhenUnconfigured(t *testing.T) {
	cfg := newTestConfig(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	if auth.CheckClientKey(req, cfg) {
		t.Fatal("未配置客户端密钥时不应允许访问")
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

func TestClientKeyRejectsNonBearerAuthorizationSchemes(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-a"})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic client-a")

	if auth.CheckClientKey(req, cfg) {
		t.Fatal("非 Bearer 鉴权方案不应被当作客户端密钥")
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

func TestClientKeyPrefersDedicatedProviderCredentialsOverBearer(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"provider-key", "bearer-key"})

	if err := cfg.SaveProvider(config.Provider{
		Name: "gemini",
		Type: config.Gemini,
	}); err != nil {
		t.Fatalf("保存 Gemini 提供商失败: %v", err)
	}
	if err := cfg.SaveProvider(config.Provider{
		Name: "claude",
		Type: config.Claude,
	}); err != nil {
		t.Fatalf("保存 Claude 提供商失败: %v", err)
	}

	testCases := []struct {
		name   string
		path   string
		header string
	}{
		{name: "gemini", path: "/gemini/v1beta/models", header: "x-goog-api-key"},
		{name: "claude", path: "/claude/v1/messages", header: "x-api-key"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.path, nil)
			req.Header.Set("Authorization", "Bearer bearer-key")
			req.Header.Set(tc.header, "provider-key")
			if !auth.CheckClientKey(req, cfg) {
				t.Fatalf("%s 路径存在专用凭据时应优先通过专用鉴权", tc.name)
			}
		})
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

func TestAdminKeyRejectsNonBearerAuthorizationSchemes(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic secret-admin")

	if auth.CheckAdminKey(req, cfg) {
		t.Fatal("非 Bearer 鉴权方案不应被当作管理员密钥")
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

func TestAdminSessionCookiePassesAdminAuth(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	loginRequest := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	loginRecorder := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(loginRecorder, loginRequest, cfg); err != nil {
		t.Fatalf("签发管理员会话 Cookie 失败: %v", err)
	}

	response := loginRecorder.Result()
	cookies := response.Cookies()
	if len(cookies) == 0 {
		t.Fatal("期望签发管理员会话 Cookie")
	}

	adminRequest := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	adminRequest.AddCookie(cookies[0])
	if !auth.CheckAdminKey(adminRequest, cfg) {
		t.Fatal("管理员会话 Cookie 应当通过鉴权")
	}
}

func TestRevokedAdminSessionCookieFailsAdminAuth(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	loginRequest := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	loginRecorder := httptest.NewRecorder()
	if err := auth.SetAdminSessionCookie(loginRecorder, loginRequest, cfg); err != nil {
		t.Fatalf("签发管理员会话 Cookie 失败: %v", err)
	}

	response := loginRecorder.Result()
	cookies := response.Cookies()
	if len(cookies) == 0 {
		t.Fatal("期望签发管理员会话 Cookie")
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/admin/logout", nil)
	logoutRequest.AddCookie(cookies[0])
	auth.RevokeAdminSession(logoutRequest, cfg)

	adminRequest := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	adminRequest.AddCookie(cookies[0])
	if auth.CheckAdminKey(adminRequest, cfg) {
		t.Fatal("已撤销的管理员会话 Cookie 不应继续通过鉴权")
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

func TestFailureLimiterSuccessDoesNotFullyResetFailures(t *testing.T) {
	limiter := auth.NewFailureLimiter(3, time.Minute, time.Minute)
	remoteAddr := "127.0.0.1:8080"

	limiter.RecordFailure(remoteAddr)
	limiter.RecordFailure(remoteAddr)
	limiter.RecordSuccess(remoteAddr)
	limiter.RecordFailure(remoteAddr)
	if !limiter.Allow(remoteAddr) {
		t.Fatal("单次成功后第一次再次失败不应立即封禁")
	}
	limiter.RecordFailure(remoteAddr)
	if limiter.Allow(remoteAddr) {
		t.Fatal("单次成功后不应把之前的失败记录全部清空")
	}
}

func TestFailureLimiterCapsTrackedEntries(t *testing.T) {
	limiter := auth.NewFailureLimiter(10, time.Minute, time.Minute)

	for i := 0; i < 5000; i++ {
		limiter.RecordFailure(fmt.Sprintf("192.0.2.%d:8080", i))
	}

	if limiter.Len() > 4096 {
		t.Fatalf("期望失败限流器限制跟踪条目数量，实际是 %d", limiter.Len())
	}
}
