package tests

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"simple-api-pool/adminapi"
	"simple-api-pool/app"
	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/stats"
	"simple-api-pool/statusapi"
	"simple-api-pool/store"
)

func TestStatusBootstrapUsesGzipWhenClientAcceptsIt(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	runtimeInstance, err := app.NewRuntime(app.Options{
		DataDir:      t.TempDir(),
		FrontendRoot: frontendRootFromRepoRoot(repoRoot),
	})
	if err != nil {
		t.Fatalf("创建运行时失败: %v", err)
	}
	t.Cleanup(func() {
		_ = runtimeInstance.Close()
	})

	req := httptest.NewRequest(http.MethodGet, "/api/status/bootstrap", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()

	runtimeInstance.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("期望 bootstrap 响应使用 gzip，实际是 %q", rec.Header().Get("Content-Encoding"))
	}

	reader, err := gzip.NewReader(strings.NewReader(rec.Body.String()))
	if err != nil {
		t.Fatalf("创建 gzip reader 失败: %v", err)
	}
	defer reader.Close()

	decodedBody, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("读取 gzip 响应失败: %v", err)
	}
	if !strings.Contains(string(decodedBody), `"stream_cursor"`) {
		t.Fatalf("期望 bootstrap 响应包含 stream_cursor，实际是 %s", string(decodedBody))
	}
}

func TestStatusBootstrapReturnsCursorAndOverview(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "key-1"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	statsManager.RecordSuccess("openai", 4, 2)

	statusHandler := statusapi.NewHandler(cfg, statsManager)
	req := httptest.NewRequest(http.MethodGet, "/api/status/bootstrap", nil)
	rec := httptest.NewRecorder()

	statusHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload struct {
		Version      uint64 `json:"version"`
		StreamCursor uint64 `json:"stream_cursor"`
		Health       struct {
			Status string `json:"status"`
		} `json:"health"`
		ProviderTypes map[string]string             `json:"provider_types"`
		ProviderStats map[string]statusapi.Snapshot `json:"provider_stats"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析 status bootstrap 失败: %v", err)
	}
	if payload.Health.Status != "ok" {
		t.Fatalf("期望 health.status 为 ok，实际是 %q", payload.Health.Status)
	}
	if payload.ProviderTypes["openai"] != string(config.OpenAIChat) {
		t.Fatalf("期望返回 provider_types，实际是 %+v", payload.ProviderTypes)
	}
	if payload.ProviderStats["openai"].InputTokens != 4 || payload.ProviderStats["openai"].OutputTokens != 2 {
		t.Fatalf("期望返回 provider_stats，实际是 %+v", payload.ProviderStats["openai"])
	}
	if payload.StreamCursor == 0 {
		t.Fatal("期望 status bootstrap 返回非零 stream_cursor")
	}
	if payload.Version == 0 {
		t.Fatal("期望 status bootstrap 返回非零 version")
	}
}

func TestAdminBootstrapReturnsConfigProvidersStatsAndRecentLogs(t *testing.T) {
	restoreRecentLogs := applog.ReplaceRecentEntriesForTesting(10)
	defer restoreRecentLogs()
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-10T12:00:00Z", Level: "INFO", Msg: "first"})

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", true, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "key-1"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	statsManager.RecordSuccess("openai", 3, 1)

	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))
	req := httptest.NewRequest(http.MethodGet, "/api/admin/bootstrap", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	adminHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload struct {
		Version       uint64                        `json:"version"`
		StreamCursor  uint64                        `json:"stream_cursor"`
		GlobalConfig  map[string]any                `json:"global_config"`
		Providers     []map[string]any              `json:"providers"`
		ProviderStats map[string]statusapi.Snapshot `json:"provider_stats"`
		RecentLogs    []applog.Entry                `json:"recent_logs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析 admin bootstrap 失败: %v", err)
	}
	if payload.Version == 0 || payload.StreamCursor == 0 {
		t.Fatalf("期望 bootstrap 返回 version 和 stream_cursor，实际是 %+v", payload)
	}
	if len(payload.Providers) != 1 {
		t.Fatalf("期望返回 providers，实际是 %+v", payload.Providers)
	}
	if len(payload.RecentLogs) != 1 || payload.RecentLogs[0].Msg != "first" {
		t.Fatalf("期望返回 recent_logs，实际是 %+v", payload.RecentLogs)
	}
	if payload.ProviderStats["openai"].InputTokens != 3 {
		t.Fatalf("期望返回 provider_stats，实际是 %+v", payload.ProviderStats["openai"])
	}
}

func TestStatusStreamReturnsStatsDeltaEvent(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()

	statusHandler := statusapi.NewHandler(cfg, statsManager)
	req := httptest.NewRequest(http.MethodGet, "/api/status/stream", nil)
	rec := newSafeResponseRecorder()

	done := make(chan struct{})
	go func() {
		statusHandler.ServeHTTP(rec, req)
		close(done)
	}()

	statsManager.RecordSuccess("openai", 9, 4)

	waitForBodyContains(t, rec, "event: stats_delta")
	waitForBodyContains(t, rec, `"provider":"openai"`)
	waitForBodyContains(t, rec, `"input_tokens":9`)
}

func TestAdminStreamReturnsLogAppendAndResyncGap(t *testing.T) {
	restoreRecentLogs := applog.ReplaceRecentEntriesForTesting(2)
	defer restoreRecentLogs()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	adminHandler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	firstReq := httptest.NewRequest(http.MethodGet, "/api/admin/stream", nil)
	firstReq.Header.Set("Authorization", "Bearer secret-admin")
	firstRec := newSafeResponseRecorder()
	go adminHandler.ServeHTTP(firstRec, firstReq)

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2026-05-10T12:00:00Z", Level: "INFO", Msg: "first"})
	waitForBodyContains(t, firstRec, "event: log_append")
	waitForBodyContains(t, firstRec, `"msg":"first"`)

	gapReq := httptest.NewRequest(http.MethodGet, "/api/admin/stream?after=999", nil)
	gapReq.Header.Set("Authorization", "Bearer secret-admin")
	gapRec := httptest.NewRecorder()
	adminHandler.ServeHTTP(gapRec, gapReq)

	if gapRec.Code != http.StatusOK {
		t.Fatalf("gap 请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, gapRec.Code, gapRec.Body.String())
	}
	if !strings.Contains(gapRec.Body.String(), "event: resync_required") {
		t.Fatalf("期望 gap 返回 resync_required，实际是 %s", gapRec.Body.String())
	}
}

type responseBodyReader interface {
	BodyString() string
}

type safeResponseRecorder struct {
	mu       sync.Mutex
	recorder *httptest.ResponseRecorder
}

func newSafeResponseRecorder() *safeResponseRecorder {
	return &safeResponseRecorder{
		recorder: httptest.NewRecorder(),
	}
}

func (recorder *safeResponseRecorder) Header() http.Header {
	return recorder.recorder.Header()
}

func (recorder *safeResponseRecorder) Write(payload []byte) (int, error) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return recorder.recorder.Write(payload)
}

func (recorder *safeResponseRecorder) WriteHeader(statusCode int) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.recorder.WriteHeader(statusCode)
}

func (recorder *safeResponseRecorder) Flush() {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.recorder.Flush()
}

func (recorder *safeResponseRecorder) BodyString() string {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return recorder.recorder.Body.String()
}

func waitForBodyContains(t *testing.T, recorder responseBodyReader, pattern string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(recorder.BodyString(), pattern) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("在超时前未看到 %q，当前响应体: %s", pattern, recorder.BodyString())
}

func readFirstSSEBlock(t *testing.T, reader io.Reader) string {
	t.Helper()
	scanner := bufio.NewScanner(reader)
	var lines []string
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			break
		}
		lines = append(lines, line)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("读取 SSE 块失败: %v", err)
	}
	return strings.Join(lines, "\n")
}
