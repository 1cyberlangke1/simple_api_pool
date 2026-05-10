package tests

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"simple-api-pool/adminapi"
	"simple-api-pool/auth"
	"simple-api-pool/config"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestAdminProviderCrudConfigAndLogoutFlow(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, []string{"client-0"})

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	createBody := []byte(`{"name":"openai","type":"openai_chat","base_url":"https://example.com","cache_enabled":true}`)
	createRequest := httptest.NewRequest(http.MethodPost, "/api/admin/providers", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer secret-admin")
	createRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("创建提供商期望状态码 %d，实际是 %d，响应体: %s", http.StatusCreated, createRecorder.Code, createRecorder.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/admin/providers", nil)
	listRequest.Header.Set("Authorization", "Bearer secret-admin")
	listRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("获取提供商列表期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, listRecorder.Code, listRecorder.Body.String())
	}
	if !bytes.Contains(listRecorder.Body.Bytes(), []byte(`"name":"openai"`)) {
		t.Fatalf("期望列表返回 openai，实际是 %s", listRecorder.Body.String())
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/admin/providers/openai", nil)
	getRequest.Header.Set("Authorization", "Bearer secret-admin")
	getRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("获取单个提供商期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, getRecorder.Code, getRecorder.Body.String())
	}

	configGetRequest := httptest.NewRequest(http.MethodGet, "/api/admin/config", nil)
	configGetRequest.Header.Set("Authorization", "Bearer secret-admin")
	configGetRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(configGetRecorder, configGetRequest)
	if configGetRecorder.Code != http.StatusOK {
		t.Fatalf("获取配置期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, configGetRecorder.Code, configGetRecorder.Body.String())
	}
	if !bytes.Contains(configGetRecorder.Body.Bytes(), []byte(`"client_keys":["client-0"]`)) {
		t.Fatalf("期望配置快照包含客户端密钥列表，实际是 %s", configGetRecorder.Body.String())
	}

	configPutBody := []byte(`{"admin_key":"  next-admin  ","token_estimation_enabled":true,"client_keys":["  alpha ",""," beta "]}`)
	configPutRequest := httptest.NewRequest(http.MethodPut, "/api/admin/config", bytes.NewReader(configPutBody))
	configPutRequest.Header.Set("Authorization", "Bearer secret-admin")
	configPutRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(configPutRecorder, configPutRequest)
	if configPutRecorder.Code != http.StatusOK {
		t.Fatalf("更新配置期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, configPutRecorder.Code, configPutRecorder.Body.String())
	}
	if cfg.AdminKey() != "next-admin" {
		t.Fatalf("期望管理员密钥被修整为 next-admin，实际是 %q", cfg.AdminKey())
	}
	clientKeys := cfg.ClientKeys()
	if len(clientKeys) != 2 || clientKeys[0] != "alpha" || clientKeys[1] != "beta" {
		t.Fatalf("期望客户端密钥被修整为 [alpha beta]，实际是 %+v", clientKeys)
	}
	if len(configPutRecorder.Result().Cookies()) == 0 {
		t.Fatal("期望更新管理员密钥后刷新会话 Cookie")
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/admin/logout", nil)
	logoutRequest.Header.Set("Authorization", "Bearer next-admin")
	logoutRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(logoutRecorder, logoutRequest)
	if logoutRecorder.Code != http.StatusOK {
		t.Fatalf("登出期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, logoutRecorder.Code, logoutRecorder.Body.String())
	}
	logoutCookies := logoutRecorder.Result().Cookies()
	if len(logoutCookies) == 0 {
		t.Fatal("期望登出时返回清理 Cookie")
	}
	if logoutCookies[0].MaxAge != -1 {
		t.Fatalf("期望登出 Cookie MaxAge 为 -1，实际是 %d", logoutCookies[0].MaxAge)
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai", nil)
	deleteRequest.Header.Set("Authorization", "Bearer next-admin")
	deleteRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusOK {
		t.Fatalf("删除提供商期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, deleteRecorder.Code, deleteRecorder.Body.String())
	}

	missingRequest := httptest.NewRequest(http.MethodGet, "/api/admin/providers/openai", nil)
	missingRequest.Header.Set("Authorization", "Bearer next-admin")
	missingRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(missingRecorder, missingRequest)
	if missingRecorder.Code != http.StatusNotFound {
		t.Fatalf("已删除提供商再次获取期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotFound, missingRecorder.Code, missingRecorder.Body.String())
	}
}

func TestAdminErrorBranchesForProviderAndConfigOperations(t *testing.T) {
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

	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	invalidProviderRequest := httptest.NewRequest(http.MethodPost, "/api/admin/providers", bytes.NewReader([]byte(`{`)))
	invalidProviderRequest.Header.Set("Authorization", "Bearer secret-admin")
	invalidProviderRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(invalidProviderRecorder, invalidProviderRequest)
	if invalidProviderRecorder.Code != http.StatusBadRequest {
		t.Fatalf("非法提供商请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, invalidProviderRecorder.Code, invalidProviderRecorder.Body.String())
	}

	reservedProviderRequest := httptest.NewRequest(http.MethodPost, "/api/admin/providers", bytes.NewReader([]byte(`{"name":"status","type":"openai_chat"}`)))
	reservedProviderRequest.Header.Set("Authorization", "Bearer secret-admin")
	reservedProviderRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(reservedProviderRecorder, reservedProviderRequest)
	if reservedProviderRecorder.Code != http.StatusBadRequest {
		t.Fatalf("保留名称提供商期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, reservedProviderRecorder.Code, reservedProviderRecorder.Body.String())
	}

	invalidConfigRequest := httptest.NewRequest(http.MethodPut, "/api/admin/config", bytes.NewReader([]byte(`{`)))
	invalidConfigRequest.Header.Set("Authorization", "Bearer secret-admin")
	invalidConfigRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(invalidConfigRecorder, invalidConfigRequest)
	if invalidConfigRecorder.Code != http.StatusBadRequest {
		t.Fatalf("非法配置请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, invalidConfigRecorder.Code, invalidConfigRecorder.Body.String())
	}

	emptyAdminKeyRequest := httptest.NewRequest(http.MethodPut, "/api/admin/config", bytes.NewReader([]byte(`{"admin_key":"   "}`)))
	emptyAdminKeyRequest.Header.Set("Authorization", "Bearer secret-admin")
	emptyAdminKeyRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(emptyAdminKeyRecorder, emptyAdminKeyRequest)
	if emptyAdminKeyRecorder.Code != http.StatusBadRequest {
		t.Fatalf("空管理员密钥请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, emptyAdminKeyRecorder.Code, emptyAdminKeyRecorder.Body.String())
	}

	invalidBulkRequest := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys/bulk", bytes.NewReader([]byte(`{"action":"noop","keys":["key-1"]}`)))
	invalidBulkRequest.Header.Set("Authorization", "Bearer secret-admin")
	invalidBulkRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(invalidBulkRecorder, invalidBulkRequest)
	if invalidBulkRecorder.Code != http.StatusBadRequest {
		t.Fatalf("非法批量操作期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, invalidBulkRecorder.Code, invalidBulkRecorder.Body.String())
	}

	missingProviderBulkRequest := httptest.NewRequest(http.MethodPost, "/api/admin/providers/missing/keys/bulk", bytes.NewReader([]byte(`{"action":"enable","keys":["key-1"]}`)))
	missingProviderBulkRequest.Header.Set("Authorization", "Bearer secret-admin")
	missingProviderBulkRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(missingProviderBulkRecorder, missingProviderBulkRequest)
	if missingProviderBulkRecorder.Code != http.StatusNotFound {
		t.Fatalf("不存在提供商批量操作期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotFound, missingProviderBulkRecorder.Code, missingProviderBulkRecorder.Body.String())
	}

	missingKeyRequest := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai/missing-key", nil)
	missingKeyRequest.Header.Set("Authorization", "Bearer secret-admin")
	missingKeyRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(missingKeyRecorder, missingKeyRequest)
	if missingKeyRecorder.Code != http.StatusNotFound {
		t.Fatalf("删除不存在密钥期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotFound, missingKeyRecorder.Code, missingKeyRecorder.Body.String())
	}

	cacheMethodRequest := httptest.NewRequest(http.MethodGet, "/api/admin/providers/openai/cache", nil)
	cacheMethodRequest.Header.Set("Authorization", "Bearer secret-admin")
	cacheMethodRecorder := httptest.NewRecorder()
	adminHandler.ServeHTTP(cacheMethodRecorder, cacheMethodRequest)
	if cacheMethodRecorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("缓存错误方法期望状态码 %d，实际是 %d，响应体: %s", http.StatusMethodNotAllowed, cacheMethodRecorder.Code, cacheMethodRecorder.Body.String())
	}

	nilCacheHandler := adminapi.NewHandler(cfg, statsManager, nil)
	nilCacheRequest := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai/cache", nil)
	nilCacheRequest.Header.Set("Authorization", "Bearer secret-admin")
	nilCacheRecorder := httptest.NewRecorder()
	nilCacheHandler.ServeHTTP(nilCacheRecorder, nilCacheRequest)
	if nilCacheRecorder.Code != http.StatusInternalServerError {
		t.Fatalf("缓存服务缺失时期望状态码 %d，实际是 %d，响应体: %s", http.StatusInternalServerError, nilCacheRecorder.Code, nilCacheRecorder.Body.String())
	}
}

func TestPatchGlobalConfigOnlyTouchesProvidedFields(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, []string{"client-a"})

	tokenEstimationEnabled := true
	clientKeys := []string{"  next-a ", "", " next-b "}
	cfg.PatchGlobalConfig(nil, &tokenEstimationEnabled, &clientKeys)

	if cfg.AdminKey() != "secret-admin" {
		t.Fatalf("未传入管理员密钥时不应变更，实际是 %q", cfg.AdminKey())
	}
	if !cfg.TokenEstimationEnabled() {
		t.Fatal("期望仅更新 token estimation 开关")
	}

	trimmedClientKeys := cfg.ClientKeys()
	if len(trimmedClientKeys) != 2 || trimmedClientKeys[0] != "next-a" || trimmedClientKeys[1] != "next-b" {
		t.Fatalf("期望客户端密钥修整为 [next-a next-b]，实际是 %+v", trimmedClientKeys)
	}
}

func TestFailureLimiterUsesReasonableDefaultsAndRemoteAddressFallbacks(t *testing.T) {
	limiter := auth.NewFailureLimiter(0, 0, 0)

	if !limiter.Allow("127.0.0.1:8080") {
		t.Fatal("初始请求应当被允许")
	}

	for i := 0; i < 10; i++ {
		limiter.RecordFailure("127.0.0.1:8080")
	}
	if limiter.Allow("127.0.0.1:9090") {
		t.Fatal("相同主机不同端口在达到默认失败次数后应当被拦截")
	}

	limiter.RecordSuccess("127.0.0.1:9090")
	if !limiter.Allow("127.0.0.1:10000") {
		t.Fatal("记录成功后应当解除同主机拦截")
	}

	emptyLimiter := auth.NewFailureLimiter(1, time.Minute, time.Minute)
	emptyLimiter.RecordFailure("")
	if emptyLimiter.Allow("") {
		t.Fatal("空 remote addr 在失败阈值后应当被拦截")
	}

	rawLimiter := auth.NewFailureLimiter(1, time.Minute, time.Minute)
	rawLimiter.RecordFailure("bare-host")
	if rawLimiter.Allow("bare-host") {
		t.Fatal("无法分离 host:port 的地址也应按原值参与限流")
	}
}
