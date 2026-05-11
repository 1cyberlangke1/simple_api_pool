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

func TestAdminGroupCrudFlow(t *testing.T) {
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

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	cacheStore := newTestCacheStore(t)
	handler := adminapi.NewHandler(cfg, statsManager, cacheStore)

	createBody := []byte(`{
		"name":"router",
		"type":"openai_chat",
		"cache_enabled":true,
		"cache_max_entries":32,
		"collections":[
			{
				"name":"chat-router",
				"strategy":"weighted_random",
				"entries":[
					{
						"provider":"openai-a",
						"model":"gpt-4.1",
						"base_url":"https://api.openai.com",
						"weight":2,
						"priority":1
					}
				]
			}
		]
	}`)
	createRequest := httptest.NewRequest(http.MethodPost, "/api/admin/groups", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer secret-admin")
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("创建分组期望状态码 %d，实际是 %d，响应体: %s", http.StatusCreated, createRecorder.Code, createRecorder.Body.String())
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/admin/groups", nil)
	listRequest.Header.Set("Authorization", "Bearer secret-admin")
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("获取分组列表期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, listRecorder.Code, listRecorder.Body.String())
	}
	if !bytes.Contains(listRecorder.Body.Bytes(), []byte(`"name":"router"`)) {
		t.Fatalf("期望列表返回 router 分组，实际是 %s", listRecorder.Body.String())
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/admin/groups/router", nil)
	getRequest.Header.Set("Authorization", "Bearer secret-admin")
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("获取单个分组期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, getRecorder.Code, getRecorder.Body.String())
	}
	if !bytes.Contains(getRecorder.Body.Bytes(), []byte(`"strategy":"weighted_random"`)) {
		t.Fatalf("期望单个分组响应包含策略定义，实际是 %s", getRecorder.Body.String())
	}

	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/admin/groups/router", nil)
	deleteRequest.Header.Set("Authorization", "Bearer secret-admin")
	deleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteRecorder, deleteRequest)
	if deleteRecorder.Code != http.StatusOK {
		t.Fatalf("删除分组期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, deleteRecorder.Code, deleteRecorder.Body.String())
	}

	missingRequest := httptest.NewRequest(http.MethodGet, "/api/admin/groups/router", nil)
	missingRequest.Header.Set("Authorization", "Bearer secret-admin")
	missingRecorder := httptest.NewRecorder()
	handler.ServeHTTP(missingRecorder, missingRequest)
	if missingRecorder.Code != http.StatusNotFound {
		t.Fatalf("已删除分组再次获取期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotFound, missingRecorder.Code, missingRecorder.Body.String())
	}
}

func TestAdminGroupErrorBranches(t *testing.T) {
	cfg := newTestConfig(t)
	cfg.UpdateGlobalConfig("secret-admin", false, nil)
	if err := cfg.SaveProvider(config.Provider{
		Name:    "openai-a",
		Type:    config.OpenAIChat,
		BaseURL: "https://api.openai.com",
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	handler := adminapi.NewHandler(cfg, statsManager, newTestCacheStore(t))

	invalidCreateRequest := httptest.NewRequest(http.MethodPost, "/api/admin/groups", bytes.NewReader([]byte(`{`)))
	invalidCreateRequest.Header.Set("Authorization", "Bearer secret-admin")
	invalidCreateRecorder := httptest.NewRecorder()
	handler.ServeHTTP(invalidCreateRecorder, invalidCreateRequest)
	if invalidCreateRecorder.Code != http.StatusBadRequest {
		t.Fatalf("非法分组请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, invalidCreateRecorder.Code, invalidCreateRecorder.Body.String())
	}

	missingProviderRequest := httptest.NewRequest(http.MethodPost, "/api/admin/groups", bytes.NewReader([]byte(`{
		"name":"router",
		"type":"openai_chat",
		"collections":[
			{
				"name":"chat-router",
				"strategy":"weighted_random",
				"entries":[
					{"provider":"missing","model":"gpt-4.1","base_url":"https://api.openai.com","weight":1,"priority":1}
				]
			}
		]
	}`)))
	missingProviderRequest.Header.Set("Authorization", "Bearer secret-admin")
	missingProviderRecorder := httptest.NewRecorder()
	handler.ServeHTTP(missingProviderRecorder, missingProviderRequest)
	if missingProviderRecorder.Code != http.StatusBadRequest {
		t.Fatalf("引用不存在提供商的分组期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, missingProviderRecorder.Code, missingProviderRecorder.Body.String())
	}

	if err := cfg.SaveGroup(config.Group{
		Name: "router",
		Type: config.OpenAIChat,
		Collections: []config.GroupCollection{
			{
				Name:     "chat-router",
				Strategy: config.GroupStrategyWeightedRandom,
				Entries: []config.GroupEntry{
					{
						Provider: "openai-a",
						Model:    "gpt-4.1",
						BaseURL:  "https://api.openai.com",
						Weight:   1,
						Priority: 1,
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("保存分组失败: %v", err)
	}

	deleteReferencedProviderRequest := httptest.NewRequest(http.MethodDelete, "/api/admin/providers/openai-a", nil)
	deleteReferencedProviderRequest.Header.Set("Authorization", "Bearer secret-admin")
	deleteReferencedProviderRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteReferencedProviderRecorder, deleteReferencedProviderRequest)
	if deleteReferencedProviderRecorder.Code != http.StatusBadRequest {
		t.Fatalf("删除被分组引用的提供商期望状态码 %d，实际是 %d，响应体: %s", http.StatusBadRequest, deleteReferencedProviderRecorder.Code, deleteReferencedProviderRecorder.Body.String())
	}

	missingGroupDeleteRequest := httptest.NewRequest(http.MethodDelete, "/api/admin/groups/missing", nil)
	missingGroupDeleteRequest.Header.Set("Authorization", "Bearer secret-admin")
	missingGroupDeleteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(missingGroupDeleteRecorder, missingGroupDeleteRequest)
	if missingGroupDeleteRecorder.Code != http.StatusNotFound {
		t.Fatalf("删除不存在分组期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotFound, missingGroupDeleteRecorder.Code, missingGroupDeleteRecorder.Body.String())
	}
}

func TestGroupModelDiscoveryRoutesReturnCollections(t *testing.T) {
	testCases := []struct {
		name              string
		groupName         string
		providerName      string
		providerType      config.ProviderType
		path              string
		headerKey         string
		headerValue       string
		expectOpenAIList  bool
		expectClaudeList  bool
		expectGeminiList  bool
		expectFirstModel  string
		expectSecondModel string
	}{
		{
			name:              "openai_chat_cache_route",
			groupName:         "router-chat",
			providerName:      "openai-a",
			providerType:      config.OpenAIChat,
			path:              "/cache/router-chat/v1/models",
			headerKey:         "Authorization",
			headerValue:       "Bearer client-key",
			expectOpenAIList:  true,
			expectFirstModel:  "chat-router",
			expectSecondModel: "vision-router",
		},
		{
			name:              "openai_responses",
			groupName:         "router-responses",
			providerName:      "responses-a",
			providerType:      config.OpenAIResponses,
			path:              "/router-responses/v1/models",
			headerKey:         "Authorization",
			headerValue:       "Bearer client-key",
			expectOpenAIList:  true,
			expectFirstModel:  "chat-router",
			expectSecondModel: "vision-router",
		},
		{
			name:              "claude_protocol_auth",
			groupName:         "router-claude",
			providerName:      "claude-a",
			providerType:      config.Claude,
			path:              "/router-claude/v1/models",
			headerKey:         "x-api-key",
			headerValue:       "client-key",
			expectClaudeList:  true,
			expectFirstModel:  "chat-router",
			expectSecondModel: "vision-router",
		},
		{
			name:              "gemini_protocol_auth",
			groupName:         "router-gemini",
			providerName:      "gemini-a",
			providerType:      config.Gemini,
			path:              "/router-gemini/v1beta/models",
			headerKey:         "x-goog-api-key",
			headerValue:       "client-key",
			expectGeminiList:  true,
			expectFirstModel:  "models/chat-router",
			expectSecondModel: "models/vision-router",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := newTestConfig(t)
			cfg.UpdateGlobalConfig("", false, []string{"client-key"})
			if err := cfg.SaveProvider(config.Provider{
				Name:    tc.providerName,
				Type:    tc.providerType,
				BaseURL: "https://example.com",
			}); err != nil {
				t.Fatalf("保存提供商失败: %v", err)
			}
			if err := cfg.SaveGroup(config.Group{
				Name:         tc.groupName,
				Type:         tc.providerType,
				CacheEnabled: true,
				Collections: []config.GroupCollection{
					{
						Name:     "chat-router",
						Strategy: config.GroupStrategyWeightedRandom,
						Entries: []config.GroupEntry{
							{
								Provider: tc.providerName,
								Model:    "upstream-chat",
								BaseURL:  "https://example.com",
								Weight:   1,
							},
						},
					},
					{
						Name:     "vision-router",
						Strategy: config.GroupStrategyWeightedRandom,
						Entries: []config.GroupEntry{
							{
								Provider: tc.providerName,
								Model:    "upstream-vision",
								BaseURL:  "https://example.com",
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
			proxy := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), newTestCacheStore(t), 1)

			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set(tc.headerKey, tc.headerValue)
			rec := httptest.NewRecorder()

			proxy.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("模型发现请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
			}

			if contentType := rec.Header().Get("Content-Type"); !strings.Contains(strings.ToLower(contentType), "application/json") {
				t.Fatalf("期望返回 JSON，实际 Content-Type=%q", contentType)
			}

			if tc.expectOpenAIList {
				var payload struct {
					Object string `json:"object"`
					Data   []struct {
						ID string `json:"id"`
					} `json:"data"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
					t.Fatalf("解析 OpenAI 模型列表失败: %v", err)
				}
				if payload.Object != "list" {
					t.Fatalf("期望 object=list，实际是 %q", payload.Object)
				}
				if len(payload.Data) != 2 || payload.Data[0].ID != tc.expectFirstModel || payload.Data[1].ID != tc.expectSecondModel {
					t.Fatalf("期望返回集合 [%s %s]，实际是 %+v", tc.expectFirstModel, tc.expectSecondModel, payload.Data)
				}
			}

			if tc.expectClaudeList {
				var payload struct {
					Data []struct {
						ID string `json:"id"`
					} `json:"data"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
					t.Fatalf("解析 Claude 模型列表失败: %v", err)
				}
				if len(payload.Data) != 2 || payload.Data[0].ID != tc.expectFirstModel || payload.Data[1].ID != tc.expectSecondModel {
					t.Fatalf("期望返回集合 [%s %s]，实际是 %+v", tc.expectFirstModel, tc.expectSecondModel, payload.Data)
				}
			}

			if tc.expectGeminiList {
				var payload struct {
					Models []struct {
						Name string `json:"name"`
					} `json:"models"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
					t.Fatalf("解析 Gemini 模型列表失败: %v", err)
				}
				if len(payload.Models) != 2 || payload.Models[0].Name != tc.expectFirstModel || payload.Models[1].Name != tc.expectSecondModel {
					t.Fatalf("期望返回集合 [%s %s]，实际是 %+v", tc.expectFirstModel, tc.expectSecondModel, payload.Models)
				}
			}
		})
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
