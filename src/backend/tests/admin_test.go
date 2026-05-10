package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"simple-api-pool/adminapi"
	"simple-api-pool/applog"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/stats"
	"simple-api-pool/statusapi"
	"simple-api-pool/store"
)

func TestAdminLoginAllowsRequestBodyKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)

	h := adminapi.NewHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

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
	if len(rec.Result().Cookies()) == 0 {
		t.Fatal("期望登录成功后下发管理员会话 Cookie")
	}
}

func TestAdminLoginRejectsMissingAdminKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	stateStore := store.New(t.TempDir())
	t.Cleanup(func() {
		_ = stateStore.Close()
	})
	statsManager := stats.NewManager(stateStore)
	t.Cleanup(statsManager.Stop)

	h := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewReader([]byte(`{}`)))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("期望缺少 admin_key 时返回 400，实际是 %d，响应体: %s", rec.Code, rec.Body.String())
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

	h := adminapi.NewHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

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

	h := adminapi.NewHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

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

	h := adminapi.NewHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

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

	h := adminapi.NewHandler(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))

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

func TestAdminBulkKeyActionRejectsMissingActionAndKeys(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "key-1"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}
	stateStore := store.New(t.TempDir())
	t.Cleanup(func() {
		_ = stateStore.Close()
	})
	statsManager := stats.NewManager(stateStore)
	t.Cleanup(statsManager.Stop)

	h := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/providers/openai/keys/bulk", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("期望缺少 action 和 keys 时返回 400，实际是 %d，响应体: %s", rec.Code, rec.Body.String())
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

	h := adminapi.NewHandler(cfg, stats.NewManager(store.New(t.TempDir())), cacheStore)

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

func TestAdminOverviewReturnsConfigProvidersStatsWithoutRecentLogs(t *testing.T) {
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

	h := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))
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
			AdminKeyConfigured     bool `json:"admin_key_configured"`
			TokenEstimationEnabled bool `json:"token_estimation_enabled"`
			ClientKeyCount         int  `json:"client_key_count"`
		} `json:"global_config"`
		Providers     []config.Provider             `json:"providers"`
		ProviderStats map[string]statusapi.Snapshot `json:"provider_stats"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析管理总览响应失败: %v", err)
	}
	if payload.Health.Status != "ok" {
		t.Fatalf("期望 health.status 为 ok，实际是 %q", payload.Health.Status)
	}
	if !payload.GlobalConfig.AdminKeyConfigured || !payload.GlobalConfig.TokenEstimationEnabled {
		t.Fatalf("期望返回全局配置，实际是 %+v", payload.GlobalConfig)
	}
	if payload.GlobalConfig.ClientKeyCount != 1 {
		t.Fatalf("期望返回客户端密钥数量 1，实际是 %+v", payload.GlobalConfig)
	}
	if len(payload.Providers) != 1 || payload.Providers[0].Name != "openai" {
		t.Fatalf("期望返回提供商列表，实际是 %+v", payload.Providers)
	}
	if payload.ProviderStats["openai"].InputTokens != 3 || payload.ProviderStats["openai"].OutputTokens != 4 {
		t.Fatalf("期望返回提供商统计，实际是 %+v", payload.ProviderStats["openai"])
	}
	if strings.Contains(rec.Body.String(), `"recent_logs"`) {
		t.Fatalf("期望管理总览不再返回 recent_logs，实际响应是 %s", rec.Body.String())
	}
}

func TestAdminLogsReturnsLatestSnapshotAndIncrementalEntries(t *testing.T) {
	restoreRecentLogs := applog.ReplaceRecentEntriesForTesting(10)
	defer restoreRecentLogs()

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:00Z", Level: "INFO", Msg: "first"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:01Z", Level: "WARN", Msg: "second"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:02Z", Level: "ERROR", Msg: "third"})

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	handlerInstance := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	firstRequest := httptest.NewRequest(http.MethodGet, "/api/admin/logs?limit=2", nil)
	firstRequest.Header.Set("Authorization", "Bearer secret-admin")
	firstRecorder := httptest.NewRecorder()
	handlerInstance.ServeHTTP(firstRecorder, firstRequest)

	if firstRecorder.Code != http.StatusOK {
		t.Fatalf("第一次日志请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, firstRecorder.Code, firstRecorder.Body.String())
	}

	var firstPayload struct {
		Entries    []applog.Entry `json:"entries"`
		NextCursor uint64         `json:"next_cursor"`
		Gap        bool           `json:"gap"`
		Snapshot   []applog.Entry `json:"snapshot"`
	}
	if err := json.Unmarshal(firstRecorder.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("解析首次日志响应失败: %v", err)
	}
	if firstPayload.Gap {
		t.Fatalf("首次日志请求不应出现缺口，实际是 %+v", firstPayload)
	}
	if len(firstPayload.Entries) != 2 || firstPayload.Entries[0].Msg != "second" || firstPayload.Entries[1].Msg != "third" {
		t.Fatalf("期望首次返回最近两条日志 second/third，实际是 %+v", firstPayload.Entries)
	}
	if len(firstPayload.Snapshot) != 0 {
		t.Fatalf("首次日志请求不应返回 snapshot，实际是 %+v", firstPayload.Snapshot)
	}
	if firstPayload.NextCursor != firstPayload.Entries[len(firstPayload.Entries)-1].Seq {
		t.Fatalf("期望 next_cursor 指向最后一条返回日志，实际是 %+v", firstPayload)
	}

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:03Z", Level: "INFO", Msg: "fourth"})

	secondRequest := httptest.NewRequest(http.MethodGet, "/api/admin/logs?after="+strconv.FormatUint(firstPayload.NextCursor, 10)+"&limit=2", nil)
	secondRequest.Header.Set("Authorization", "Bearer secret-admin")
	secondRecorder := httptest.NewRecorder()
	handlerInstance.ServeHTTP(secondRecorder, secondRequest)

	if secondRecorder.Code != http.StatusOK {
		t.Fatalf("增量日志请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, secondRecorder.Code, secondRecorder.Body.String())
	}

	var secondPayload struct {
		Entries    []applog.Entry `json:"entries"`
		NextCursor uint64         `json:"next_cursor"`
		Gap        bool           `json:"gap"`
		Snapshot   []applog.Entry `json:"snapshot"`
	}
	if err := json.Unmarshal(secondRecorder.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("解析增量日志响应失败: %v", err)
	}
	if secondPayload.Gap {
		t.Fatalf("正常增量请求不应出现缺口，实际是 %+v", secondPayload)
	}
	if len(secondPayload.Entries) != 1 || secondPayload.Entries[0].Msg != "fourth" {
		t.Fatalf("期望增量返回 fourth，实际是 %+v", secondPayload.Entries)
	}
	if len(secondPayload.Snapshot) != 0 {
		t.Fatalf("正常增量请求不应返回 snapshot，实际是 %+v", secondPayload.Snapshot)
	}
	if secondPayload.NextCursor != secondPayload.Entries[0].Seq {
		t.Fatalf("期望 next_cursor 指向新增日志，实际是 %+v", secondPayload)
	}
}

func TestAdminLogsReturnsGapSnapshotWhenCursorTooOld(t *testing.T) {
	restoreRecentLogs := applog.ReplaceRecentEntriesForTesting(2)
	defer restoreRecentLogs()

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:00Z", Level: "INFO", Msg: "first"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:01Z", Level: "WARN", Msg: "second"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:02Z", Level: "ERROR", Msg: "third"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:03Z", Level: "INFO", Msg: "fourth"})

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	handlerInstance := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	request := httptest.NewRequest(http.MethodGet, "/api/admin/logs?after=1&limit=2", nil)
	request.Header.Set("Authorization", "Bearer secret-admin")
	recorder := httptest.NewRecorder()
	handlerInstance.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("缺口日志请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Entries    []applog.Entry `json:"entries"`
		NextCursor uint64         `json:"next_cursor"`
		Gap        bool           `json:"gap"`
		Snapshot   []applog.Entry `json:"snapshot"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析缺口日志响应失败: %v", err)
	}
	if !payload.Gap {
		t.Fatalf("期望缺口响应 gap=true，实际是 %+v", payload)
	}
	if len(payload.Entries) != 0 {
		t.Fatalf("期望缺口响应 entries 为空，实际是 %+v", payload.Entries)
	}
	if len(payload.Snapshot) != 2 || payload.Snapshot[0].Msg != "third" || payload.Snapshot[1].Msg != "fourth" {
		t.Fatalf("期望缺口响应 snapshot 为 third/fourth，实际是 %+v", payload.Snapshot)
	}
	if payload.NextCursor != payload.Snapshot[len(payload.Snapshot)-1].Seq {
		t.Fatalf("期望缺口响应 next_cursor 指向 snapshot 末尾，实际是 %+v", payload)
	}
}

func TestAdminLogsReturnsGapSnapshotWhenCursorAheadOfServer(t *testing.T) {
	restoreRecentLogs := applog.ReplaceRecentEntriesForTesting(10)
	defer restoreRecentLogs()

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:00Z", Level: "INFO", Msg: "first"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-07T08:00:01Z", Level: "WARN", Msg: "second"})

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	handlerInstance := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	request := httptest.NewRequest(http.MethodGet, "/api/admin/logs?after=99&limit=10", nil)
	request.Header.Set("Authorization", "Bearer secret-admin")
	recorder := httptest.NewRecorder()
	handlerInstance.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("服务端日志游标回退时期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, recorder.Code, recorder.Body.String())
	}

	var payload struct {
		Entries    []applog.Entry `json:"entries"`
		NextCursor uint64         `json:"next_cursor"`
		Gap        bool           `json:"gap"`
		Snapshot   []applog.Entry `json:"snapshot"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析游标回退日志响应失败: %v", err)
	}
	if !payload.Gap {
		t.Fatalf("期望服务端在客户端游标超前时返回 gap=true，实际是 %+v", payload)
	}
	if len(payload.Entries) != 0 {
		t.Fatalf("期望游标超前时 entries 为空，实际是 %+v", payload.Entries)
	}
	if len(payload.Snapshot) != 2 || payload.Snapshot[0].Msg != "first" || payload.Snapshot[1].Msg != "second" {
		t.Fatalf("期望游标超前时返回最新快照 first/second，实际是 %+v", payload.Snapshot)
	}
	if payload.NextCursor != payload.Snapshot[len(payload.Snapshot)-1].Seq {
		t.Fatalf("期望游标超前时 next_cursor 指向最新快照末尾，实际是 %+v", payload)
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
	handlerInstance := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

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
	t.Cleanup(func() {
		_ = st.Close()
	})
	cfg := config.New(st)
	cfg.ApplyEnvOverrides()
	return cfg
}

func newTestCacheStore(t *testing.T) *cache.Store {
	t.Helper()
	cs := cache.NewStore(t.TempDir())
	t.Cleanup(func() {
		_ = cs.Close()
	})
	return cs
}
