package tests

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestAdminEndpointsReturnExpectedErrorsForUnauthorizedAndInvalidRequests(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	unauthorizedReq := httptest.NewRequest(http.MethodGet, "/api/admin/providers", nil)
	unauthorizedRec := httptest.NewRecorder()
	h.ServeHTTP(unauthorizedRec, unauthorizedReq)
	if unauthorizedRec.Code != http.StatusUnauthorized {
		t.Fatalf("期望未授权状态码为 %d，实际是 %d", http.StatusUnauthorized, unauthorizedRec.Code)
	}

	badLoginReq := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewBufferString("{"))
	badLoginRec := httptest.NewRecorder()
	h.ServeHTTP(badLoginRec, badLoginReq)
	if badLoginRec.Code != http.StatusBadRequest {
		t.Fatalf("期望非法登录请求状态码为 %d，实际是 %d", http.StatusBadRequest, badLoginRec.Code)
	}

	notFoundReq := httptest.NewRequest(http.MethodGet, "/api/admin/unknown", nil)
	notFoundRec := httptest.NewRecorder()
	h.ServeHTTP(notFoundRec, notFoundReq)
	if notFoundRec.Code != http.StatusNotFound {
		t.Fatalf("期望未知接口状态码为 %d，实际是 %d", http.StatusNotFound, notFoundRec.Code)
	}
}

func TestAdminEndpointsReturnMethodNotAllowedForUnsupportedMethods(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	h := handler.NewAdminHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

	req := httptest.NewRequest(http.MethodPatch, "/api/admin/config", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("期望状态码为 %d，实际是 %d，响应体: %s", http.StatusMethodNotAllowed, rec.Code, rec.Body.String())
	}
}
