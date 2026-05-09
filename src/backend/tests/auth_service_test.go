package tests

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"simple-api-pool/adminapi"
	"simple-api-pool/auth"
)

func TestAuthServiceAuthorizeRejectsCrossOriginSessionMutation(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", false, nil); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	service := adminapi.NewAuthService(cfg, nil)

	loginRequest := httptest.NewRequest(http.MethodPost, "https://admin.example.com/api/admin/login", nil)
	loginRecorder := httptest.NewRecorder()
	if err := service.Login(loginRecorder, loginRequest, "secret-admin"); err != nil {
		t.Fatalf("登录失败: %v", err)
	}

	authorizedRequest := httptest.NewRequest(http.MethodPost, "http://admin.example.com/api/admin/providers", nil)
	authorizedRequest.Host = "admin.example.com"
	authorizedRequest.Header.Set("X-Forwarded-Proto", "https")
	authorizedRequest.Header.Set("Origin", "https://evil.example.com")
	for _, cookie := range loginRecorder.Result().Cookies() {
		authorizedRequest.AddCookie(cookie)
	}

	err := service.Authorize(authorizedRequest)
	if !errors.Is(err, adminapi.ErrAdminOriginInvalid) {
		t.Fatalf("期望跨域会话写请求返回 %v，实际是 %v", adminapi.ErrAdminOriginInvalid, err)
	}
}

func TestAuthServiceAuthorizeAcceptsForwardedProtoForSameOriginSession(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", false, nil); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	service := adminapi.NewAuthService(cfg, nil)

	loginRequest := httptest.NewRequest(http.MethodPost, "https://admin.example.com/api/admin/login", nil)
	loginRecorder := httptest.NewRecorder()
	if err := service.Login(loginRecorder, loginRequest, "secret-admin"); err != nil {
		t.Fatalf("登录失败: %v", err)
	}

	authorizedRequest := httptest.NewRequest(http.MethodPost, "http://admin.example.com/api/admin/providers", nil)
	authorizedRequest.Host = "admin.example.com"
	authorizedRequest.Header.Set("X-Forwarded-Proto", "https")
	authorizedRequest.Header.Set("Origin", "https://admin.example.com")
	for _, cookie := range loginRecorder.Result().Cookies() {
		authorizedRequest.AddCookie(cookie)
	}

	if err := service.Authorize(authorizedRequest); err != nil {
		t.Fatalf("期望同源会话写请求通过，实际是 %v", err)
	}
}

func TestAuthServiceLoginRejectsBadCredentialThenRateLimits(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", false, nil); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	limiter := auth.NewFailureLimiter(1, time.Minute, time.Minute)
	service := adminapi.NewAuthService(cfg, limiter)

	firstRequest := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	firstRequest.RemoteAddr = "198.51.100.10:1234"
	if err := service.Login(httptest.NewRecorder(), firstRequest, "wrong-admin"); !errors.Is(err, adminapi.ErrAdminBadCredential) {
		t.Fatalf("期望错误密钥返回 %v，实际是 %v", adminapi.ErrAdminBadCredential, err)
	}

	secondRequest := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	secondRequest.RemoteAddr = firstRequest.RemoteAddr
	if err := service.Login(httptest.NewRecorder(), secondRequest, "secret-admin"); !errors.Is(err, adminapi.ErrAdminRateLimited) {
		t.Fatalf("期望限流后返回 %v，实际是 %v", adminapi.ErrAdminRateLimited, err)
	}
}

func TestAuthServiceLogoutRevokesSession(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("secret-admin", false, nil); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	service := adminapi.NewAuthService(cfg, nil)

	loginRequest := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	loginRecorder := httptest.NewRecorder()
	if err := service.Login(loginRecorder, loginRequest, "secret-admin"); err != nil {
		t.Fatalf("登录失败: %v", err)
	}

	authorizedRequest := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/admin/logout", nil)
	for _, cookie := range loginRecorder.Result().Cookies() {
		authorizedRequest.AddCookie(cookie)
		logoutRequest.AddCookie(cookie)
	}
	if err := service.Authorize(authorizedRequest); err != nil {
		t.Fatalf("期望登出前会话可用，实际是 %v", err)
	}

	service.Logout(httptest.NewRecorder(), logoutRequest)

	if err := service.Authorize(authorizedRequest); !errors.Is(err, adminapi.ErrAdminUnauthorized) {
		t.Fatalf("期望登出后会话失效，实际是 %v", err)
	}
}
