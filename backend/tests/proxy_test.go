package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestProxyPassesThroughMethodPathQueryBodyAndAuth(t *testing.T) {
	received := struct {
		Method string
		Path   string
		Query  string
		Body   string
		Auth   string
	}{}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取上游请求体失败: %v", err)
		}
		received.Method = r.Method
		received.Path = r.URL.Path
		received.Query = r.URL.RawQuery
		received.Body = string(body)
		received.Auth = r.Header.Get("Authorization")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"usage":{"prompt_tokens":3,"completion_tokens":2}}`))
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

	reqBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hi"}]}`
	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions?stream=false&trace=abc", strings.NewReader(reqBody))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if received.Method != http.MethodPost {
		t.Fatalf("期望透传 POST，实际是 %q", received.Method)
	}
	if received.Path != "/v1/chat/completions" {
		t.Fatalf("期望透传完整路径 /v1/chat/completions，实际是 %q", received.Path)
	}
	if received.Query != "stream=false&trace=abc" {
		t.Fatalf("期望透传完整查询参数，实际是 %q", received.Query)
	}
	if received.Body != reqBody {
		t.Fatalf("期望透传原始请求体，实际是 %q", received.Body)
	}
	if received.Auth != "Bearer upstream-key" {
		t.Fatalf("期望注入上游鉴权头，实际是 %q", received.Auth)
	}
}

func TestProxyPassesThroughUpstreamErrors(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"quota exceeded"}}`))
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

	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", bytes.NewBufferString(`{"model":"gpt-4.1"}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusTooManyRequests, rec.Code)
	}
	if strings.TrimSpace(rec.Body.String()) != `{"error":{"message":"quota exceeded"}}` {
		t.Fatalf("期望原样透传上游错误体，实际是 %s", rec.Body.String())
	}
}

func TestErrorResponsesAreNotCached(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"quota exceeded"}}`))
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hi"}]}`
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()

		proxy.ServeHTTP(rec, req)

		if rec.Code != http.StatusTooManyRequests {
			t.Fatalf("第 %d 次请求期望状态码 %d，实际是 %d", i+1, http.StatusTooManyRequests, rec.Code)
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望错误响应不被缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestCacheHitReturnsCachedResponseAndUpdatesStats(t *testing.T) {
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
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 10)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析缓存响应失败: %v", err)
	}
	if payload["id"] != "cached" {
		t.Fatalf("期望缓存响应 id 为 cached，实际是 %#v", payload["id"])
	}
	usage := payload["usage"].(map[string]any)
	if usage["cache_tokens"] != float64(10) {
		t.Fatalf("期望 cache_tokens 为 10，实际是 %#v", usage["cache_tokens"])
	}

	snapshot := statsMgr.Snapshot()
	stat, ok := snapshot["openai"]
	if !ok {
		t.Fatal("期望缓存命中后产生统计")
	}
	if stat.CacheHits != 1 {
		t.Fatalf("期望缓存命中次数为 1，实际是 %d", stat.CacheHits)
	}
	if stat.CacheTokens != 10 {
		t.Fatalf("期望缓存 token 为 10，实际是 %d", stat.CacheTokens)
	}
}

func TestCacheHitReturnsWithoutAvailableUpstreamKey(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         "http://127.0.0.1:1",
		CacheEnabled:    true,
		CacheMaxEntries: 10,
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached-without-key","usage":{"prompt_tokens":4,"completion_tokens":6}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 10)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析缓存响应失败: %v", err)
	}
	if payload["id"] != "cached-without-key" {
		t.Fatalf("期望返回缓存响应 cached-without-key，实际是 %#v", payload["id"])
	}
}

func TestCacheHitIgnoresStreamFlagAndReturnsStreamFormat(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":"resp-1","usage":{"prompt_tokens":4,"completion_tokens":6},"choices":[{"message":{"role":"assistant","content":"cached hello"}}]}`))
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	nonStreamBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":false}`
	firstReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(nonStreamBody))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}

	streamBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":true}`
	secondReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(streamBody))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondReq.Header.Set("Accept", "text/event-stream")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望第二次请求命中缓存，不再请求上游，实际上游调用次数是 %d", upstreamCalls)
	}
	if got := secondRec.Header().Get("Content-Type"); !strings.Contains(got, "text/event-stream") {
		t.Fatalf("期望缓存命中后按流式格式返回，实际 Content-Type 是 %q", got)
	}
	if !strings.Contains(secondRec.Body.String(), "\"id\":\"resp-1\"") {
		t.Fatalf("期望缓存命中后返回 SSE 数据块，实际是 %s", secondRec.Body.String())
	}
	if !strings.Contains(secondRec.Body.String(), "data: [DONE]") {
		t.Fatalf("期望缓存命中后返回 SSE 结束标记，实际是 %s", secondRec.Body.String())
	}
}

func TestFirstStreamResponseBuildsNonStreamCacheForLaterNonStreamHits(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		chunks := []string{
			"data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-4.1\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Hello\"},\"finish_reason\":null}],\"usage\":null}\n\n",
			"data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-4.1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" world\"},\"finish_reason\":\"stop\"}],\"usage\":null}\n\n",
			"data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-4.1\",\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":7,\"total_tokens\":12}}\n\n",
			"data: [DONE]\n\n",
		}
		for _, chunk := range chunks {
			if _, err := w.Write([]byte(chunk)); err != nil {
				t.Fatalf("写入流式块失败: %v", err)
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	streamBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":true,"stream_options":{"include_usage":true}}`
	firstReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(streamBody))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstReq.Header.Set("Accept", "text/event-stream")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次流式请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}
	if !strings.Contains(firstRec.Body.String(), "data: [DONE]") {
		t.Fatalf("期望第一次流式请求返回 DONE，实际是 %s", firstRec.Body.String())
	}

	nonStreamBody := `{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}],"stream":false}`
	secondReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(nonStreamBody))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次非流式请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望第二次非流式请求命中缓存，不再访问上游，实际上游调用次数是 %d", upstreamCalls)
	}

	var payload map[string]any
	if err := json.Unmarshal(secondRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析非流式缓存响应失败: %v", err)
	}
	choices := payload["choices"].([]any)
	message := choices[0].(map[string]any)["message"].(map[string]any)
	if message["content"] != "Hello world" {
		t.Fatalf("期望缓存里的非流式内容为 Hello world，实际是 %#v", message["content"])
	}
	usage := payload["usage"].(map[string]any)
	if usage["cache_tokens"] != float64(12) {
		t.Fatalf("期望 cache_tokens 为 12，实际是 %#v", usage["cache_tokens"])
	}
}

func TestClaudeFirstStreamResponseBuildsNonStreamCache(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		events := []string{
			"event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5\",\"stop_reason\":null,\"stop_sequence\":null}}\n\n",
			"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" Claude\"}}\n\n",
			"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
			"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":8,\"output_tokens\":6}}\n\n",
			"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
		}
		for _, event := range events {
			if _, err := w.Write([]byte(event)); err != nil {
				t.Fatalf("写入 Claude 流式事件失败: %v", err)
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "claude",
		Type:            config.Claude,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys: []config.Key{
			{Value: "claude-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	streamBody := `{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hello"}],"stream":true}`
	firstReq := httptest.NewRequest(http.MethodPost, "/cache/claude/v1/messages", strings.NewReader(streamBody))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstReq.Header.Set("Accept", "text/event-stream")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次 Claude 流式请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}

	nonStreamBody := `{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hello"}],"stream":false}`
	secondReq := httptest.NewRequest(http.MethodPost, "/cache/claude/v1/messages", strings.NewReader(nonStreamBody))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次 Claude 非流式请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望 Claude 第二次请求命中缓存，不再访问上游，实际上游调用次数是 %d", upstreamCalls)
	}

	var payload map[string]any
	if err := json.Unmarshal(secondRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析 Claude 非流式缓存响应失败: %v", err)
	}
	content := payload["content"].([]any)
	block := content[0].(map[string]any)
	if block["text"] != "Hello Claude" {
		t.Fatalf("期望 Claude 缓存文本为 Hello Claude，实际是 %#v", block["text"])
	}
	usage := payload["usage"].(map[string]any)
	if usage["cache_tokens"] != float64(14) {
		t.Fatalf("期望 Claude cache_tokens 为 14，实际是 %#v", usage["cache_tokens"])
	}
}

func TestOpenAIResponsesFirstStreamResponseBuildsNonStreamCache(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		events := []string{
			"data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_1\",\"object\":\"response\",\"model\":\"gpt-5\",\"output\":[],\"usage\":null}}\n\n",
			"data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\n",
			"data: {\"type\":\"response.output_text.delta\",\"delta\":\" Responses\"}\n\n",
			"data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_1\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-5\",\"output\":[{\"type\":\"message\",\"id\":\"msg_1\",\"status\":\"completed\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Hello Responses\",\"annotations\":[]}]}],\"usage\":{\"input_tokens\":9,\"output_tokens\":4,\"total_tokens\":13}}}\n\n",
		}
		for _, event := range events {
			if _, err := w.Write([]byte(event)); err != nil {
				t.Fatalf("写入 Responses 流式事件失败: %v", err)
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "responses",
		Type:            config.OpenAIResponses,
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	streamBody := `{"model":"gpt-5","input":"hello","stream":true}`
	firstReq := httptest.NewRequest(http.MethodPost, "/cache/responses/v1/responses", strings.NewReader(streamBody))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstReq.Header.Set("Accept", "text/event-stream")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次 Responses 流式请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}

	nonStreamBody := `{"model":"gpt-5","input":"hello","stream":false}`
	secondReq := httptest.NewRequest(http.MethodPost, "/cache/responses/v1/responses", strings.NewReader(nonStreamBody))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次 Responses 非流式请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望 Responses 第二次请求命中缓存，不再访问上游，实际上游调用次数是 %d", upstreamCalls)
	}

	var payload map[string]any
	if err := json.Unmarshal(secondRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析 Responses 非流式缓存响应失败: %v", err)
	}
	output := payload["output"].([]any)
	message := output[0].(map[string]any)
	content := message["content"].([]any)
	part := content[0].(map[string]any)
	if part["text"] != "Hello Responses" {
		t.Fatalf("期望 Responses 缓存文本为 Hello Responses，实际是 %#v", part["text"])
	}
	usage := payload["usage"].(map[string]any)
	if usage["cache_tokens"] != float64(13) {
		t.Fatalf("期望 Responses cache_tokens 为 13，实际是 %#v", usage["cache_tokens"])
	}
}

func TestGeminiFirstStreamResponseBuildsNonStreamCache(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		events := []string{
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n",
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" Gemini\"}]}}]}\n\n",
			"data: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\n\n",
		}
		for _, event := range events {
			if _, err := w.Write([]byte(event)); err != nil {
				t.Fatalf("写入 Gemini 流式事件失败: %v", err)
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "gemini",
		Type:            config.Gemini,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys: []config.Key{
			{Value: "gemini-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	streamBody := `{"model":"gemini-2.5-flash","contents":[{"parts":[{"text":"hello"}]}],"stream":true}`
	firstReq := httptest.NewRequest(http.MethodPost, "/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent", strings.NewReader(streamBody))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstReq.Header.Set("Accept", "text/event-stream")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次 Gemini 流式请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}

	nonStreamBody := `{"model":"gemini-2.5-flash","contents":[{"parts":[{"text":"hello"}]}],"stream":false}`
	secondReq := httptest.NewRequest(http.MethodPost, "/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent", strings.NewReader(nonStreamBody))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次 Gemini 非流式请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望 Gemini 第二次请求命中缓存，不再访问上游，实际上游调用次数是 %d", upstreamCalls)
	}

	var payload map[string]any
	if err := json.Unmarshal(secondRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析 Gemini 非流式缓存响应失败: %v", err)
	}
	candidates := payload["candidates"].([]any)
	content := candidates[0].(map[string]any)["content"].(map[string]any)
	parts := content["parts"].([]any)
	if parts[0].(map[string]any)["text"] != "Hello Gemini" {
		t.Fatalf("期望 Gemini 缓存文本为 Hello Gemini，实际是 %#v", parts[0].(map[string]any)["text"])
	}
	usage := payload["usageMetadata"].(map[string]any)
	if usage["cacheTokens"] != float64(11) {
		t.Fatalf("期望 Gemini cacheTokens 为 11，实际是 %#v", usage["cacheTokens"])
	}
}

func TestGeminiAltSSEStreamRequestUpdatesCacheTokensOnCacheHit(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		events := []string{
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n",
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" Gemini\"}]}}]}\n\n",
			"data: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":6,\"candidatesTokenCount\":5,\"totalTokenCount\":11}}\n\n",
		}
		for _, event := range events {
			if _, err := w.Write([]byte(event)); err != nil {
				t.Fatalf("写入 Gemini alt=sse 流式事件失败: %v", err)
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "gemini",
		Type:            config.Gemini,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys: []config.Key{
			{Value: "gemini-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	cacheStore := newTestCacheStore(t)
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	body := `{"model":"gemini-2.5-flash","contents":[{"parts":[{"text":"hello"}]}]}`

	firstReq := httptest.NewRequest(http.MethodPost, "/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse", strings.NewReader(body))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次 Gemini alt=sse 请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}

	secondReq := httptest.NewRequest(http.MethodPost, "/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse", strings.NewReader(body))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次 Gemini alt=sse 请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望 Gemini alt=sse 第二次请求命中缓存，不再访问上游，实际上游调用次数是 %d", upstreamCalls)
	}

	snapshot := statsMgr.Snapshot()
	stat, ok := snapshot["gemini"]
	if !ok {
		t.Fatal("期望 Gemini 产生缓存统计")
	}
	if stat.CacheHits != 1 {
		t.Fatalf("期望 Gemini 缓存命中次数为 1，实际是 %d", stat.CacheHits)
	}
	if stat.CacheTokens != 11 {
		t.Fatalf("期望 Gemini alt=sse 缓存 token 为 11，实际是 %d", stat.CacheTokens)
	}
}

func TestCacheHitWritesCacheTokensIntoOpenAIChatUsage(t *testing.T) {
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
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"cached","usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 10)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	req := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析缓存响应失败: %v", err)
	}
	usage := payload["usage"].(map[string]any)
	if usage["cache_tokens"] != float64(10) {
		t.Fatalf("期望 cache_tokens 为 10，实际是 %#v", usage["cache_tokens"])
	}
}

func TestGeminiModelListRequestDoesNotUseCacheRoute(t *testing.T) {
	upstreamCalls := 0
	responseBody := `{"models":[{"name":"models/gemini-2.5-flash"}]}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(responseBody))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "gemini",
		Type:            config.Gemini,
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/cache/gemini/v1beta/models?pageSize=5", nil)
		req.Header.Set("Authorization", "Bearer client-key")
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次模型列表请求期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
		if strings.TrimSpace(rec.Body.String()) != responseBody {
			t.Fatalf("第 %d 次模型列表请求期望原样透传，实际是 %s", i+1, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望模型列表请求始终直通上游 2 次，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestOpenAIModelListRequestDoesNotUseCacheRoute(t *testing.T) {
	upstreamCalls := 0
	responseBody := `{"object":"list","data":[{"id":"gpt-4.1","object":"model","owned_by":"openai"}]}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(responseBody))
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), newTestCacheStore(t), 1)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/cache/openai/v1/models", nil)
		req.Header.Set("Authorization", "Bearer client-key")
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("第 %d 次 OpenAI 模型列表请求期望状态码 %d，实际是 %d，响应体: %s", i+1, http.StatusOK, rec.Code, rec.Body.String())
		}
		if strings.TrimSpace(rec.Body.String()) != responseBody {
			t.Fatalf("第 %d 次 OpenAI 模型列表请求期望原样透传，实际是 %s", i+1, rec.Body.String())
		}
	}

	if upstreamCalls != 2 {
		t.Fatalf("期望 OpenAI 模型列表请求始终直通上游 2 次，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestNonCacheRouteRefreshesExistingCacheEntry(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"fresh","usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}`))
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
	body := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", body, []byte(`{"id":"stale","usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	nonCacheReq := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", bytes.NewReader(body))
	nonCacheReq.Header.Set("Authorization", "Bearer client-key")
	nonCacheReq.Header.Set("Content-Type", "application/json")
	nonCacheRec := httptest.NewRecorder()
	proxy.ServeHTTP(nonCacheRec, nonCacheReq)

	if nonCacheRec.Code != http.StatusOK {
		t.Fatalf("普通端点请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, nonCacheRec.Code, nonCacheRec.Body.String())
	}
	if !strings.Contains(nonCacheRec.Body.String(), `"id":"fresh"`) {
		t.Fatalf("普通端点请求期望返回新响应，实际是 %s", nonCacheRec.Body.String())
	}

	cacheReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", bytes.NewReader(body))
	cacheReq.Header.Set("Authorization", "Bearer client-key")
	cacheReq.Header.Set("Content-Type", "application/json")
	cacheRec := httptest.NewRecorder()
	proxy.ServeHTTP(cacheRec, cacheReq)

	if cacheRec.Code != http.StatusOK {
		t.Fatalf("缓存端点请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, cacheRec.Code, cacheRec.Body.String())
	}
	if !strings.Contains(cacheRec.Body.String(), `"id":"fresh"`) {
		t.Fatalf("缓存端点期望读到普通端点刚更新的新响应，实际是 %s", cacheRec.Body.String())
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望只有普通端点访问上游 1 次，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestCacheHitWritesCacheTokensIntoGeminiUsageMetadata(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "gemini",
		Type:            config.Gemini,
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
	body := []byte(`{"model":"gemini-2.5-flash","contents":[{"parts":[{"text":"hello"}]}]}`)
	cacheStore.Set("gemini", config.Gemini, "gemini-2.5-flash", body, []byte(`{"candidates":[{"content":{"parts":[{"text":"hi"}]}}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":6,"totalTokenCount":10}}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 4, 6, 10)

	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	req := httptest.NewRequest(http.MethodPost, "/cache/gemini/v1beta/models/gemini-2.5-flash:generateContent", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析缓存响应失败: %v", err)
	}
	usage := payload["usageMetadata"].(map[string]any)
	if usage["cacheTokens"] != float64(10) {
		t.Fatalf("期望 cacheTokens 为 10，实际是 %#v", usage["cacheTokens"])
	}
}

func TestGeminiProviderInjectsGoogAPIKey(t *testing.T) {
	var gotHeader string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("x-goog-api-key")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":1}}`))
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

	req := httptest.NewRequest(http.MethodPost, "/gemini/v1beta/models/gemini-2.5-flash:generateContent", strings.NewReader(`{"model":"gemini-2.5-flash"}`))
	req.Header.Set("Authorization", "Bearer client-key")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}
	if gotHeader != "gemini-key" {
		t.Fatalf("期望注入 x-goog-api-key，实际是 %q", gotHeader)
	}
}

func TestMultimodalOpenAIChatRequestPassesThroughUnchanged(t *testing.T) {
	var gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取多模态上游请求体失败: %v", err)
		}
		gotBody = string(body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"usage":{"prompt_tokens":10,"completion_tokens":2}}`))
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

	body := `{"model":"gpt-4.1","messages":[{"role":"user","content":[{"type":"text","text":"这是什么？"},{"type":"image_url","image_url":{"url":"https://example.com/cat.png"}}]}]}`
	req := httptest.NewRequest(http.MethodPost, "/openai/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}
	if gotBody != body {
		t.Fatalf("期望多模态请求体原样透传，实际是 %s", gotBody)
	}
}

func TestMultimodalGeminiRequestPassesThroughUnchanged(t *testing.T) {
	var gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取 Gemini 多模态上游请求体失败: %v", err)
		}
		gotBody = string(body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"usageMetadata":{"promptTokenCount":6,"candidatesTokenCount":1}}`))
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

	body := `{"model":"gemini-2.5-flash","contents":[{"role":"user","parts":[{"text":"这张图里有什么？"},{"inline_data":{"mime_type":"image/png","data":"ZmFrZQ=="}}]}]}`
	req := httptest.NewRequest(http.MethodPost, "/gemini/v1beta/models/gemini-2.5-flash:generateContent", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}
	if gotBody != body {
		t.Fatalf("期望 Gemini 多模态请求体原样透传，实际是 %s", gotBody)
	}
}

func TestMultimodalMessageArrayMatchesCacheCorrectly(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":"resp-mm","usage":{"prompt_tokens":8,"completion_tokens":3}}`))
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
	proxy := handler.NewProxyHandler(cfg, statsMgr, keyring.New(cfg), cacheStore, 1)

	body := `{"model":"gpt-4.1","messages":[{"role":"system","content":"你是助手"},{"role":"user","content":[{"type":"text","text":"图里是什么？"},{"type":"image_url","image_url":{"url":"https://example.com/cat.png"}},{"type":"input_audio","input_audio":{"data":"ZmFrZQ==","format":"mp3"}}]}]}`
	firstReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(body))
	firstReq.Header.Set("Authorization", "Bearer client-key")
	firstReq.Header.Set("Content-Type", "application/json")
	firstRec := httptest.NewRecorder()
	proxy.ServeHTTP(firstRec, firstReq)

	if firstRec.Code != http.StatusOK {
		t.Fatalf("第一次多模态缓存请求期望状态码 %d，实际是 %d", http.StatusOK, firstRec.Code)
	}

	secondReq := httptest.NewRequest(http.MethodPost, "/cache/openai/v1/chat/completions", strings.NewReader(body))
	secondReq.Header.Set("Authorization", "Bearer client-key")
	secondReq.Header.Set("Content-Type", "application/json")
	secondRec := httptest.NewRecorder()
	proxy.ServeHTTP(secondRec, secondReq)

	if secondRec.Code != http.StatusOK {
		t.Fatalf("第二次多模态缓存请求期望状态码 %d，实际是 %d", http.StatusOK, secondRec.Code)
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望多模态消息数组第二次命中缓存，实际上游调用次数是 %d", upstreamCalls)
	}
}

func TestStatusEndpointReturnsFrontendReadyStats(t *testing.T) {
	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	statsMgr.RecordSuccess("openai", 11, 7)
	statsMgr.RecordError("openai", 401)
	statsMgr.RecordError("openai", 404)
	statsMgr.RecordCacheHit("openai", 18)

	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "key-a"},
			{Value: "key-b", DisabledUntil: time.Now().Add(10 * time.Minute).Unix()},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statusHandler := handler.NewStatusHandler(cfg, statsMgr)
	req := httptest.NewRequest(http.MethodGet, "/api/status/stats", nil)
	rec := httptest.NewRecorder()

	statusHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}

	var payload map[string]map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析状态响应失败: %v", err)
	}
	openaiPayload := payload["openai"]
	if openaiPayload["success_count"].(float64) != 1 {
		t.Fatalf("期望 success_count 为 1，实际是 %v", openaiPayload["success_count"])
	}
	if openaiPayload["error_count"].(float64) != 2 {
		t.Fatalf("期望 error_count 为 2，实际是 %v", openaiPayload["error_count"])
	}
	if openaiPayload["cache_hits"].(float64) != 1 {
		t.Fatalf("期望 cache_hits 为 1，实际是 %v", openaiPayload["cache_hits"])
	}
	if openaiPayload["available_keys"].(float64) != 1 {
		t.Fatalf("期望 available_keys 为 1，实际是 %v", openaiPayload["available_keys"])
	}
	if openaiPayload["total_keys"].(float64) != 2 {
		t.Fatalf("期望 total_keys 为 2，实际是 %v", openaiPayload["total_keys"])
	}
	errorTypes := openaiPayload["error_types"].(map[string]any)
	if errorTypes["401"].(float64) != 1 || errorTypes["404"].(float64) != 1 {
		t.Fatalf("期望 error_types 包含 401 和 404 各 1 次，实际是 %+v", errorTypes)
	}
}

func TestStatusEndpointReturnsKeyOverviewWithoutRequestStats(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "gemini",
		Type: config.Gemini,
		Keys: []config.Key{
			{Value: "key-1"},
			{Value: "key-2"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()

	statusHandler := handler.NewStatusHandler(cfg, statsMgr)
	req := httptest.NewRequest(http.MethodGet, "/api/status/stats", nil)
	rec := httptest.NewRecorder()

	statusHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}

	var payload map[string]map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析状态响应失败: %v", err)
	}
	geminiPayload := payload["gemini"]
	if geminiPayload["available_keys"].(float64) != 2 {
		t.Fatalf("期望 available_keys 为 2，实际是 %v", geminiPayload["available_keys"])
	}
	if geminiPayload["total_keys"].(float64) != 2 {
		t.Fatalf("期望 total_keys 为 2，实际是 %v", geminiPayload["total_keys"])
	}
	if geminiPayload["success_count"].(float64) != 0 {
		t.Fatalf("期望 success_count 默认为 0，实际是 %v", geminiPayload["success_count"])
	}
	if _, ok := geminiPayload["error_types"]; ok {
		t.Fatalf("期望没有错误类型时不返回 error_types，实际是 %+v", geminiPayload["error_types"])
	}
}

func TestStatusOverviewReturnsHealthAndProviderStats(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "key-1"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsMgr := stats.NewManager(store.New(t.TempDir()))
	defer statsMgr.Stop()
	statsMgr.RecordSuccess("openai", 7, 5)

	statusHandler := handler.NewStatusHandler(cfg, statsMgr)
	req := httptest.NewRequest(http.MethodGet, "/api/status/overview", nil)
	rec := httptest.NewRecorder()

	statusHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload struct {
		Health struct {
			Status string `json:"status"`
		} `json:"health"`
		ProviderStats map[string]handler.StatusSnapshot `json:"provider_stats"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析状态总览响应失败: %v", err)
	}
	if payload.Health.Status != "ok" {
		t.Fatalf("期望 health.status 为 ok，实际是 %q", payload.Health.Status)
	}
	if payload.ProviderStats["openai"].InputTokens != 7 || payload.ProviderStats["openai"].OutputTokens != 5 {
		t.Fatalf("期望状态总览返回提供商统计，实际是 %+v", payload.ProviderStats["openai"])
	}
}
