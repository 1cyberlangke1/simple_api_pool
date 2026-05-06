package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/auth"
	"simple-api-pool/store"
)

func Test未配置客户端密钥时允许直接访问(t *testing.T) {
	cfg := newTestConfig(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)

	if !auth.CheckClientKey(req, cfg) {
		t.Fatal("未配置客户端密钥时应当允许访问")
	}
}

func Test客户端密钥支持Bearer和原始Header两种格式(t *testing.T) {
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

func Test客户端密钥错误或缺失时拒绝访问(t *testing.T) {
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

func Test管理员密钥校验支持Bearer和原始Header格式(t *testing.T) {
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

func Test未配置管理员密钥时不会放行(t *testing.T) {
	cfg := newTestConfig(t)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer anything")

	if auth.CheckAdminKey(req, cfg) {
		t.Fatal("未配置管理员密钥时不应通过")
	}
}

func Test配置构造时会读取环境变量里的管理员和客户端密钥(t *testing.T) {
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
