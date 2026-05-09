package tests

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/adminapi"
	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestAdminWritesEmitStructuredAuditLogs(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, []string{"client-1"})
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "key-1"}},
	}); err != nil {
		t.Fatalf("准备提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	handler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	saveProviderReq := httptest.NewRequest(http.MethodPost, "/api/admin/providers", strings.NewReader(`{"name":"gemini","type":"gemini","base_url":"https://generativelanguage.googleapis.com","key_strategy":"round_robin","fail_threshold":3,"min_disable_secs":30,"max_disable_secs":43200,"cache_enabled":true,"cache_max_entries":1000}`))
	saveProviderReq.Header.Set("Authorization", "Bearer secret-admin")
	saveProviderReq.Header.Set("Content-Type", "application/json")
	saveProviderRec := httptest.NewRecorder()
	handler.ServeHTTP(saveProviderRec, saveProviderReq)
	if saveProviderRec.Code != http.StatusCreated {
		t.Fatalf("保存提供商期望状态码 %d，实际是 %d，响应体: %s", http.StatusCreated, saveProviderRec.Code, saveProviderRec.Body.String())
	}

	updateConfigReq := httptest.NewRequest(http.MethodPut, "/api/admin/config", strings.NewReader(`{"token_estimation_enabled":true,"client_keys":["client-1","client-2"]}`))
	updateConfigReq.Header.Set("Authorization", "Bearer secret-admin")
	updateConfigReq.Header.Set("Content-Type", "application/json")
	updateConfigRec := httptest.NewRecorder()
	handler.ServeHTTP(updateConfigRec, updateConfigReq)
	if updateConfigRec.Code != http.StatusOK {
		t.Fatalf("更新全局配置期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, updateConfigRec.Code, updateConfigRec.Body.String())
	}

	keyActionReq := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys/bulk", strings.NewReader(`{"action":"disable_until","keys":["key-1"],"disable_seconds":60}`))
	keyActionReq.Header.Set("Authorization", "Bearer secret-admin")
	keyActionReq.Header.Set("Content-Type", "application/json")
	keyActionRec := httptest.NewRecorder()
	handler.ServeHTTP(keyActionRec, keyActionReq)
	if keyActionRec.Code != http.StatusOK {
		t.Fatalf("批量 key 操作期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, keyActionRec.Code, keyActionRec.Body.String())
	}

	logOutput := logs.String()
	for _, fragment := range []string{
		`"msg":"admin_audit"`,
		`"event":"provider_save"`,
		`"provider":"gemini"`,
		`"event":"global_config_update"`,
		`"client_key_count":2`,
		`"event":"key_action"`,
		`"action":"disable_until"`,
	} {
		if !strings.Contains(logOutput, fragment) {
			t.Fatalf("期望审计日志包含 %s，实际日志是 %s", fragment, logOutput)
		}
	}
}
