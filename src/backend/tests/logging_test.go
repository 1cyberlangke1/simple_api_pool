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
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
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
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

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
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

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
		`"model":"gpt-4.1"`,
		`"upstream_path":"/v1/chat/completions"`,
		`"status":200`,
		`"key_ref":"****-key"`,
		`"upstream_header_ms":`,
	} {
		if !strings.Contains(out, fragment) {
			t.Fatalf("期望日志包含 %s，实际日志是 %s", fragment, out)
		}
	}
}

func TestProxyStreamRequestWritesFirstByteLatencyLog(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			_, _ = w.Write([]byte("data: {\"id\":\"chunk-1\"}\n\n"))
			flusher.Flush()
		}
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
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":true}`
	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	out := logs.String()
	for _, fragment := range []string{
		`"msg":"proxy_request"`,
		`"model":"gpt-4.1"`,
		`"stream":true`,
		`"upstream_header_ms":`,
		`"first_byte_ms":`,
	} {
		if !strings.Contains(out, fragment) {
			t.Fatalf("期望流式日志包含 %s，实际日志是 %s", fragment, out)
		}
	}
}

func TestUpstreamErrorBodyUsesDedicatedLogInsteadOfProxyRequestErrorField(t *testing.T) {
	restoreRecentEntries := applog.ReplaceRecentEntriesForTesting(10)
	defer restoreRecentEntries()

	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"quota exceeded"}}`))
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
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", strings.NewReader(`{"model":"gpt-4.1"}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusTooManyRequests, rec.Code, rec.Body.String())
	}

	var proxyEntry applog.Entry
	var bodyEntry applog.Entry
	for _, entry := range applog.RecentEntries(10) {
		switch entry.Msg {
		case "proxy_request":
			proxyEntry = entry
		case "upstream_error_body":
			bodyEntry = entry
		}
	}

	if proxyEntry.Msg != "proxy_request" {
		t.Fatalf("期望记录 proxy_request 日志，实际是 %+v", applog.RecentEntries(10))
	}
	if got := proxyEntry.Attrs["error"]; got != "上游返回 429" {
		t.Fatalf("期望 proxy_request.error 只保留摘要，实际是 %#v", got)
	}
	if bodyEntry.Msg != "upstream_error_body" {
		t.Fatalf("期望记录 upstream_error_body 日志，实际是 %+v", applog.RecentEntries(10))
	}
	if got := bodyEntry.Attrs["body"]; got != `{"error":{"message":"quota exceeded"}}` {
		t.Fatalf("期望专用日志记录上游错误体，实际是 %#v", got)
	}
}

func TestProxyAndAccessLogsRedactSensitiveQueryValues(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodGet, "/gemini/v1beta/models?key=client-gemini-key&pageSize=20", nil)
	req.Header.Set("x-goog-api-key", "client-gemini-key")
	rec := httptest.NewRecorder()

	applog.LoggingMiddleware(proxy).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	logOutput := logs.String()
	if strings.Contains(logOutput, "client-gemini-key") {
		t.Fatalf("期望日志脱敏敏感 query key，实际日志是 %s", logOutput)
	}
	if !strings.Contains(logOutput, `"query":"key=%5Bredacted%5D&pageSize=20"`) &&
		!strings.Contains(logOutput, `"query":"pageSize=20&key=%5Bredacted%5D"`) {
		t.Fatalf("期望日志保留业务参数并脱敏 key，实际日志是 %s", logOutput)
	}
}

func TestSanitizeQueryMasksMalformedSensitiveQuery(t *testing.T) {
	sanitized := applog.SanitizeQuery("key=secret-value&bad=%gg")

	if strings.Contains(sanitized, "secret-value") {
		t.Fatalf("期望畸形 query 也不能泄露敏感值，实际是 %q", sanitized)
	}
	if sanitized != "[unparseable]" {
		t.Fatalf("期望畸形 query 返回统一占位，实际是 %q", sanitized)
	}
}

func TestCacheHitWritesDedicatedCacheEventLog(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         "http://127.0.0.1:1",
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	cacheStore.SetForRequest("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 10, false)

	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	out := logs.String()
	for _, fragment := range []string{
		`"msg":"cache_event"`,
		`"event":"hit"`,
		`"provider":"openai"`,
		`"provider_type":"openai_chat"`,
		`"model":"gpt-4.1"`,
		`"cache_route":true`,
		`"status":200`,
		`"total_tokens":10`,
		`"msg":"proxy_request"`,
		`"cache_hit":true`,
	} {
		if !strings.Contains(out, fragment) {
			t.Fatalf("期望缓存命中日志包含 %s，实际日志是 %s", fragment, out)
		}
	}
}

func TestCacheStoreWritesDedicatedCacheEventLog(t *testing.T) {
	var logs bytes.Buffer
	oldLogger := slog.Default()
	slog.SetDefault(applog.NewTestLogger(&logs))
	defer slog.SetDefault(oldLogger)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"chatcmpl-1","usage":{"prompt_tokens":3,"completion_tokens":2}}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`
	req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	out := logs.String()
	for _, fragment := range []string{
		`"msg":"cache_event"`,
		`"event":"store"`,
		`"provider":"openai"`,
		`"provider_type":"openai_chat"`,
		`"model":"gpt-4.1"`,
		`"cache_route":true`,
		`"status":200`,
		`"input_tokens":3`,
		`"output_tokens":2`,
		`"total_tokens":5`,
		`"msg":"proxy_request"`,
		`"cache_hit":false`,
	} {
		if !strings.Contains(out, fragment) {
			t.Fatalf("期望构造缓存日志包含 %s，实际日志是 %s", fragment, out)
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

func TestRecentEntriesDropsOversizedSingleEntryWithoutEvictingExistingLogs(t *testing.T) {
	restoreRecentEntries := applog.ReplaceRecentEntriesForTestingWithBytes(4, 80)
	defer restoreRecentEntries()

	applog.AppendRecentEntryForTesting(applog.Entry{Time: "1", Level: "INFO", Msg: "keep-first"})
	applog.AppendRecentEntryForTesting(applog.Entry{Time: "2", Level: "INFO", Msg: "keep-second"})
	applog.AppendRecentEntryForTesting(applog.Entry{
		Time:  "3",
		Level: "ERROR",
		Msg:   strings.Repeat("x", 200),
	})

	entries := applog.RecentEntries(10)
	if len(entries) != 2 {
		t.Fatalf("期望超大单条日志被丢弃且保留已有日志，实际条数是 %d，内容是 %+v", len(entries), entries)
	}
	if entries[0].Msg != "keep-first" || entries[1].Msg != "keep-second" {
		t.Fatalf("期望已有日志顺序保持不变，实际是 %+v", entries)
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
	proxy := proxyapi.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

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

func TestNewTestLoggerAlsoFeedsRecentEntries(t *testing.T) {
	restoreRecentEntries := applog.ReplaceRecentEntriesForTesting(10)
	defer restoreRecentEntries()

	var logs bytes.Buffer
	logger := applog.NewTestLogger(&logs)
	logger.Info("recent-entry-test", "provider", "openai")

	entries := applog.RecentEntries(10)
	if len(entries) != 1 {
		t.Fatalf("期望测试 logger 也写入最近日志缓冲，实际条数是 %d", len(entries))
	}
	if entries[0].Msg != "recent-entry-test" {
		t.Fatalf("期望最近日志消息为 recent-entry-test，实际是 %+v", entries)
	}
	if !strings.Contains(logs.String(), `"msg":"recent-entry-test"`) {
		t.Fatalf("期望测试 logger 继续写出结构化日志，实际是 %s", logs.String())
	}
}
