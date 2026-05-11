package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/adminapi"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestAdminOverviewReturnsGroups(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai-a",
		Type:    config.OpenAIChat,
		BaseURL: "https://api.openai.com",
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}
	if err := cfg.SaveGroup(config.Group{
		Name:            "router",
		Type:            config.OpenAIChat,
		CacheEnabled:    true,
		CacheMaxEntries: 64,
		Collections: []config.GroupCollection{
			{
				Name:     "chat-router",
				Strategy: "weighted_random",
				Entries: []config.GroupEntry{
					{
						Provider: "openai-a",
						Model:    "gpt-4.1",
						BaseURL:  "https://api.openai.com",
						Weight:   2,
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("保存分组失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()

	handler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))
	req := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	req.Header.Set("Authorization", "Bearer secret-admin")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload struct {
		Groups []struct {
			Name        string `json:"name"`
			Type        string `json:"type"`
			Collections []struct {
				Name     string `json:"name"`
				Strategy string `json:"strategy"`
				Entries  []struct {
					Provider string `json:"provider"`
					Model    string `json:"model"`
					BaseURL  string `json:"base_url"`
					Weight   int    `json:"weight"`
				} `json:"entries"`
			} `json:"collections"`
		} `json:"groups"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("解析响应失败: %v", err)
	}
	if len(payload.Groups) != 1 {
		t.Fatalf("期望返回 1 个分组，实际是 %+v", payload.Groups)
	}
	if payload.Groups[0].Name != "router" || payload.Groups[0].Type != string(config.OpenAIChat) {
		t.Fatalf("期望返回 router 分组，实际是 %+v", payload.Groups[0])
	}
	if len(payload.Groups[0].Collections) != 1 || payload.Groups[0].Collections[0].Name != "chat-router" {
		t.Fatalf("期望返回集合定义，实际是 %+v", payload.Groups[0].Collections)
	}
	if len(payload.Groups[0].Collections[0].Entries) != 1 || payload.Groups[0].Collections[0].Entries[0].Provider != "openai-a" {
		t.Fatalf("期望返回条目定义，实际是 %+v", payload.Groups[0].Collections[0].Entries)
	}
}

func TestGroupCacheRouteRewritesModelAndCachesPerGroup(t *testing.T) {
	upstreamCalls := 0
	var receivedBody string
	var receivedAuth string
	var receivedPath string

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取上游请求体失败: %v", err)
		}
		receivedBody = string(body)
		receivedAuth = r.Header.Get("Authorization")
		receivedPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"group-hit","usage":{"prompt_tokens":2,"completion_tokens":3}}`))
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai-a",
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
	if err := cfg.SaveGroup(config.Group{
		Name:            "router",
		Type:            config.OpenAIChat,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Collections: []config.GroupCollection{
			{
				Name:     "chat-router",
				Strategy: "weighted_random",
				Entries: []config.GroupEntry{
					{
						Provider: "openai-a",
						Model:    "gpt-4.1",
						BaseURL:  upstream.URL,
						Weight:   1,
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("保存分组失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	cacheStore := newTestCacheStore(t)
	proxy := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), cacheStore, 1)

	requestBody := `{"model":"chat-router","messages":[{"role":"user","content":"hello"}]}`
	makeRequest := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/cache/router/v1/chat/completions", strings.NewReader(requestBody))
		req.Header.Set("Authorization", "Bearer client-key")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		return rec
	}

	firstResponse := makeRequest()
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("第一次请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, firstResponse.Code, firstResponse.Body.String())
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望第一次请求访问上游 1 次，实际是 %d", upstreamCalls)
	}
	if receivedPath != "/v1/chat/completions" {
		t.Fatalf("期望透传到原始 suffix，实际是 %q", receivedPath)
	}
	if receivedAuth != "Bearer upstream-key" {
		t.Fatalf("期望使用上游密钥，实际是 %q", receivedAuth)
	}
	if !strings.Contains(receivedBody, `"model":"gpt-4.1"`) {
		t.Fatalf("期望请求体模型被改写为 gpt-4.1，实际是 %s", receivedBody)
	}
	if strings.Contains(receivedBody, `"model":"chat-router"`) {
		t.Fatalf("期望逻辑模型名不再透传到上游，实际是 %s", receivedBody)
	}

	secondResponse := makeRequest()
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("第二次请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, secondResponse.Code, secondResponse.Body.String())
	}
	if upstreamCalls != 1 {
		t.Fatalf("期望第二次请求命中分组缓存不上游，实际访问上游 %d 次", upstreamCalls)
	}
}

func TestGroupFailoverRetriesNextEntry(t *testing.T) {
	firstCalls := 0
	secondCalls := 0
	firstUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		firstCalls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"quota exceeded"}}`))
	}))
	defer firstUpstream.Close()

	var secondBody string
	secondUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secondCalls++
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取第二个上游请求体失败: %v", err)
		}
		secondBody = string(body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"fallback-ok","usage":{"prompt_tokens":1,"completion_tokens":1}}`))
	}))
	defer secondUpstream.Close()

	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("", false, []string{"client-key"})
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai-a",
		Type:    config.OpenAIChat,
		BaseURL: firstUpstream.URL,
		Keys: []config.Key{
			{Value: "key-a"},
		},
	}); err != nil {
		t.Fatalf("保存提供商 A 失败: %v", err)
	}
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai-b",
		Type:    config.OpenAIChat,
		BaseURL: secondUpstream.URL,
		Keys: []config.Key{
			{Value: "key-b"},
		},
	}); err != nil {
		t.Fatalf("保存提供商 B 失败: %v", err)
	}
	if err := cfg.SaveGroup(config.Group{
		Name: "router",
		Type: config.OpenAIChat,
		Collections: []config.GroupCollection{
			{
				Name:     "chat-router",
				Strategy: "failover",
				Entries: []config.GroupEntry{
					{
						Provider: "openai-a",
						Model:    "gpt-4.1",
						BaseURL:  firstUpstream.URL,
						Priority: 1,
					},
					{
						Provider: "openai-b",
						Model:    "gpt-4.1-mini",
						BaseURL:  secondUpstream.URL,
						Priority: 2,
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("保存分组失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	proxy := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), newTestCacheStore(t), 1)

	req := httptest.NewRequest(http.MethodPost, "/router/v1/chat/completions", bytes.NewBufferString(`{"model":"chat-router","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer client-key")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("期望故障转移后返回 200，实际是 %d，响应体: %s", rec.Code, rec.Body.String())
	}
	if firstCalls != 1 || secondCalls != 1 {
		t.Fatalf("期望先后访问两个上游各一次，实际 first=%d second=%d", firstCalls, secondCalls)
	}
	if !strings.Contains(secondBody, `"model":"gpt-4.1-mini"`) {
		t.Fatalf("期望第二个上游收到改写后的目标模型，实际是 %s", secondBody)
	}
	providerA, _ := cfg.Provider("openai-a")
	if providerA == nil || providerA.Keys[0].ConsecutiveFails == 0 {
		t.Fatalf("期望首个上游失败后记录密钥失败状态，实际是 %+v", providerA)
	}
}
