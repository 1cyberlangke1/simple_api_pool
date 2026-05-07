package tests

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestGeminiModelListGETPassThrough(t *testing.T) {
	received := struct {
		Method string
		Path   string
		Query  string
		APIKey string
	}{}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Method = r.Method
		received.Path = r.URL.Path
		received.Query = r.URL.RawQuery
		received.APIKey = r.Header.Get("x-goog-api-key")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"models":[{"name":"models/gemini-2.5-flash"}]}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:    "gemini",
		Type:    config.Gemini,
		BaseURL: upstream.URL,
		Keys: []config.Key{
			{Value: "gemini-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodGet, "/gemini/v1beta/models?pageSize=100", nil)
	req.Header.Set("Authorization", "Bearer client-key")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if received.Method != http.MethodGet {
		t.Fatalf("期望透传 GET，实际是 %q", received.Method)
	}
	if received.Path != "/v1beta/models" {
		t.Fatalf("期望透传路径 /v1beta/models，实际是 %q", received.Path)
	}
	if received.Query != "pageSize=100" {
		t.Fatalf("期望透传查询参数 pageSize=100，实际是 %q", received.Query)
	}
	if received.APIKey != "gemini-key" {
		t.Fatalf("期望注入 x-goog-api-key，实际是 %q", received.APIKey)
	}
}

func TestProxyRequestWritesStructuredLogs(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"usage":{"prompt_tokens":3,"completion_tokens":2}}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai",
		Type:    config.OpenAIChat,
		BaseURL: upstream.URL,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`
	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions?trace=1", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	out := logs.String()
	for _, fragment := range []string{
		`"msg":"proxy_request"`,
		`"provider":"openai"`,
		`"provider_type":"openai_chat"`,
		`"upstream_path":"/v1/chat/completions"`,
		`"status":200`,
		`"key_ref":"****-key"`,
	} {
		if !strings.Contains(out, fragment) {
			t.Fatalf("期望日志包含 %s，实际日志是 %s", fragment, out)
		}
	}
}

func TestAccessLoggingMiddlewareWritesStatusAndResponseBytes(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	rec := httptest.NewRecorder()

	applog.LoggingMiddleware(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusCreated, rec.Code)
	}

	out := logs.String()
	for _, fragment := range []string{
		`"msg":"http_request"`,
		`"path":"/status"`,
		`"status":201`,
		`"response_bytes":2`,
	} {
		if !strings.Contains(out, fragment) {
			t.Fatalf("期望访问日志包含 %s，实际日志是 %s", fragment, out)
		}
	}
}

func TestRecentEntriesKeepsOnlyLatestRecords(t *testing.T) {
	restoreRecentEntries := applog.ReplaceRecentEntriesForTesting(2)
	defer restoreRecentEntries()

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "1", Level: "INFO", Msg: "first"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2", Level: "INFO", Msg: "second"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "3", Level: "ERROR", Msg: "third"})

	entries := applog.RecentEntries(10)
	if len(entries) != 2 {
		t.Fatalf("期望只保留最近 2 条日志，实际是 %d", len(entries))
	}
	if entries[0].Msg != "second" || entries[1].Msg != "third" {
		t.Fatalf("期望日志顺序为 second, third，实际是 %+v", entries)
	}
}

func TestRecentEntriesEvictsOldRecordsWhenByteLimitIsReached(t *testing.T) {
	restoreRecentEntries := applog.ReplaceRecentEntriesForTestingWithBytes(10, 90)
	defer restoreRecentEntries()

	applog.AppendRecentEntryForTesting(applog.Entry{
		Time:  "1",
		Level: "INFO",
		Msg:   "first-message-with-size",
		Attrs: map[string]any{"path": "/status"},
	})
	applog.AppendRecentEntryForTesting(applog.Entry{
		Time:  "2",
		Level: "WARN",
		Msg:   "second-message-with-size",
		Attrs: map[string]any{"path": "/openai"},
	})
	applog.AppendRecentEntryForTesting(applog.Entry{
		Time:  "3",
		Level: "ERROR",
		Msg:   "third-message-with-size",
		Attrs: map[string]any{"path": "/gemini"},
	})

	entries := applog.RecentEntries(10)
	if len(entries) != 1 {
		t.Fatalf("期望按字节限制淘汰旧日志后只剩 1 条，实际是 %d", len(entries))
	}
	if entries[0].Msg != "third-message-with-size" {
		t.Fatalf("期望只保留最新日志，实际是 %+v", entries)
	}
}

func TestGeminiClientAuthIsReplacedWithUpstreamKey(t *testing.T) {
	received := struct {
		APIKey string
		Query  string
	}{}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.APIKey = r.Header.Get("x-goog-api-key")
		received.Query = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":1}}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-gemini-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:    "gemini",
		Type:    config.Gemini,
		BaseURL: upstream.URL,
		Keys: []config.Key{
			{Value: "upstream-gemini-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodGet, "/gemini/v1beta/models?key=client-gemini-key&pageSize=20", nil)
	req.Header.Set("x-goog-api-key", "client-gemini-key")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if received.APIKey != "upstream-gemini-key" {
		t.Fatalf("期望上游收到上游 key，实际是 %q", received.APIKey)
	}
	if received.Query != "pageSize=20" {
		t.Fatalf("期望移除客户端 query key 后仅保留业务参数，实际是 %q", received.Query)
	}
}
