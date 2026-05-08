package tests

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"math/rand"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

type proxyScenarioRequest struct {
	Method  string
	Path    string
	Headers map[string]string
	Body    []byte
}

type proxyScenarioResult struct {
	StatusCode int
	Headers    http.Header
	Body       string
}

type observedUpstreamRequest struct {
	Method           string
	Path             string
	Query            string
	Body             string
	Authorization    string
	XAPIKey          string
	XGoogAPIKey      string
	AnthropicVersion string
	ContentType      string
	Accept           string
}

type officialRoundTripCase struct {
	Name                  string
	ProviderName          string
	ProviderType          config.ProviderType
	Request               proxyScenarioRequest
	ResponseStatusCode    int
	ResponseHeaders       map[string]string
	ResponseBody          string
	AssertFirstResponse   func(t *testing.T, result proxyScenarioResult)
	AssertCachedResponse  func(t *testing.T, result proxyScenarioResult)
	AssertUpstreamRequest func(t *testing.T, observed observedUpstreamRequest)
}

type officialProviderHarness struct {
	proxy         *handler.ProxyHandler
	stats         *stats.Manager
	cacheStore    *cache.Store
	upstream      *httptest.Server
	mu            sync.Mutex
	upstreamCalls int
	lastObserved  observedUpstreamRequest
}

type openAICacheEvictionHarness struct {
	proxy      *handler.ProxyHandler
	stats      *stats.Manager
	cacheStore *cache.Store
	upstream   *httptest.Server
	cacheDir   string
	mu         sync.Mutex
	calls      int
}

type randomTrafficCase struct {
	Request             proxyScenarioRequest
	ExpectedStatusCode  int
	ExpectedBodyMarkers []string
	ProviderName        string
	ResponseStatusCode  int
	ResponseHeaders     map[string]string
	ResponseBody        string
}

type randomTrafficHarness struct {
	proxy           *handler.ProxyHandler
	stats           *stats.Manager
	cacheStore      *cache.Store
	cacheDir        string
	totalCacheLimit int
	providerNames   []string
	servers         []*httptest.Server
	mu              sync.Mutex
	callsByProvider map[string]int
	responseByKey   map[string]randomTrafficCase
}

func runProxyScenario(t *testing.T, proxy http.Handler, request proxyScenarioRequest) proxyScenarioResult {
	t.Helper()

	bodyReader := bytes.NewReader(request.Body)
	req := httptest.NewRequest(request.Method, request.Path, bodyReader)
	for key, value := range request.Headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	proxy.ServeHTTP(recorder, req)

	return proxyScenarioResult{
		StatusCode: recorder.Code,
		Headers:    recorder.Header().Clone(),
		Body:       recorder.Body.String(),
	}
}

func buildOfficialRoundTripCases() []officialRoundTripCase {
	openAIChatMarker := "openai-chat-official-marker"
	openAIResponsesMarker := "openai-responses-official-marker"
	claudeMarker := "claude-official-marker"
	geminiMarker := "gemini-official-marker"

	return []officialRoundTripCase{
		{
			Name:               "openai_chat_non_stream_multiturn_multimodal",
			ProviderName:       "openai",
			ProviderType:       config.OpenAIChat,
			Request:            buildOpenAIChatRequest(openAIChatMarker, false, true),
			ResponseStatusCode: http.StatusOK,
			ResponseHeaders: map[string]string{
				"Content-Type": "application/json",
			},
			ResponseBody: buildOpenAIChatResponse(openAIChatMarker, buildLongText("OpenAI Chat official long answer", 22), 120, 240),
			AssertFirstResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, openAIChatMarker, "OpenAI Chat official long answer")
			},
			AssertCachedResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, openAIChatMarker, `"cached_tokens":360`)
			},
			AssertUpstreamRequest: func(t *testing.T, observed observedUpstreamRequest) {
				if observed.Authorization != "Bearer upstream-key" {
					t.Fatalf("期望 OpenAI Chat 上游鉴权头为 Bearer upstream-key，实际是 %q", observed.Authorization)
				}
				if observed.Path != "/v1/chat/completions" {
					t.Fatalf("期望 OpenAI Chat 上游路径为 /v1/chat/completions，实际是 %q", observed.Path)
				}
				if !strings.Contains(observed.Body, openAIChatMarker) || !strings.Contains(observed.Body, `"image_url"`) {
					t.Fatalf("期望 OpenAI Chat 上游收到完整多模态请求，实际是 %s", observed.Body)
				}
			},
		},
		{
			Name:               "openai_responses_stream_multimodal",
			ProviderName:       "responses",
			ProviderType:       config.OpenAIResponses,
			Request:            buildOpenAIResponsesRequest(openAIResponsesMarker, true),
			ResponseStatusCode: http.StatusOK,
			ResponseHeaders: map[string]string{
				"Content-Type": "text/event-stream",
			},
			ResponseBody: buildOpenAIResponsesStreamResponse(openAIResponsesMarker, buildLongText("Responses official stream answer", 18), 75, 55),
			AssertFirstResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, "response.output_text.delta", openAIResponsesMarker, "data: [DONE]")
			},
			AssertCachedResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, `"cached_tokens":130`, openAIResponsesMarker, "response.completed")
			},
			AssertUpstreamRequest: func(t *testing.T, observed observedUpstreamRequest) {
				if observed.Authorization != "Bearer upstream-key" {
					t.Fatalf("期望 Responses 上游鉴权头为 Bearer upstream-key，实际是 %q", observed.Authorization)
				}
				if observed.Path != "/v1/responses" {
					t.Fatalf("期望 Responses 上游路径为 /v1/responses，实际是 %q", observed.Path)
				}
				if !strings.Contains(observed.Body, openAIResponsesMarker) || !strings.Contains(observed.Body, `"input_image"`) {
					t.Fatalf("期望 Responses 上游收到官方 input_image 请求体，实际是 %s", observed.Body)
				}
			},
		},
		{
			Name:               "claude_non_stream_multimodal",
			ProviderName:       "claude",
			ProviderType:       config.Claude,
			Request:            buildClaudeRequest(claudeMarker, false),
			ResponseStatusCode: http.StatusOK,
			ResponseHeaders: map[string]string{
				"Content-Type": "application/json",
			},
			ResponseBody: buildClaudeResponse(claudeMarker, buildLongText("Claude official long answer", 16), 91, 37),
			AssertFirstResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, claudeMarker, "Claude official long answer")
			},
			AssertCachedResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, `"cache_read_input_tokens":128`, claudeMarker)
			},
			AssertUpstreamRequest: func(t *testing.T, observed observedUpstreamRequest) {
				if observed.XAPIKey != "claude-key" {
					t.Fatalf("期望 Claude 上游鉴权头 x-api-key 为 claude-key，实际是 %q", observed.XAPIKey)
				}
				if observed.AnthropicVersion != "2023-06-01" {
					t.Fatalf("期望 Claude 保留 anthropic-version 请求头，实际是 %q", observed.AnthropicVersion)
				}
				if observed.Path != "/v1/messages" {
					t.Fatalf("期望 Claude 上游路径为 /v1/messages，实际是 %q", observed.Path)
				}
				if !strings.Contains(observed.Body, claudeMarker) || !strings.Contains(observed.Body, `"image"`) {
					t.Fatalf("期望 Claude 上游收到图文混合消息，实际是 %s", observed.Body)
				}
			},
		},
		{
			Name:               "gemini_stream_multimodal_alt_sse",
			ProviderName:       "gemini",
			ProviderType:       config.Gemini,
			Request:            buildGeminiRequest(geminiMarker, true),
			ResponseStatusCode: http.StatusOK,
			ResponseHeaders: map[string]string{
				"Content-Type": "text/event-stream",
			},
			ResponseBody: buildGeminiStreamResponse(geminiMarker, buildLongText("Gemini official stream answer", 14), 64, 48),
			AssertFirstResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, geminiMarker, `"totalTokenCount":112`, "Gemini official stream answer")
			},
			AssertCachedResponse: func(t *testing.T, result proxyScenarioResult) {
				assertProxyStatusAndMarkers(t, result, http.StatusOK, `"cachedContentTokenCount":112`, geminiMarker)
			},
			AssertUpstreamRequest: func(t *testing.T, observed observedUpstreamRequest) {
				if observed.XGoogAPIKey != "gemini-key" {
					t.Fatalf("期望 Gemini 上游鉴权头 x-goog-api-key 为 gemini-key，实际是 %q", observed.XGoogAPIKey)
				}
				if observed.Path != "/v1beta/models/gemini-2.5-flash:streamGenerateContent" {
					t.Fatalf("期望 Gemini 上游路径正确，实际是 %q", observed.Path)
				}
				if observed.Query != "alt=sse" {
					t.Fatalf("期望 Gemini 上游查询参数为 alt=sse，实际是 %q", observed.Query)
				}
				if !strings.Contains(observed.Body, geminiMarker) || !strings.Contains(observed.Body, `"inline_data"`) {
					t.Fatalf("期望 Gemini 上游收到 inline_data 多模态请求，实际是 %s", observed.Body)
				}
			},
		},
	}
}

func newOfficialProviderHarness(t *testing.T, tc officialRoundTripCase) *officialProviderHarness {
	t.Helper()

	harness := &officialProviderHarness{}
	harness.upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取上游请求体失败: %v", err)
		}

		harness.mu.Lock()
		harness.upstreamCalls++
		harness.lastObserved = observedUpstreamRequest{
			Method:           r.Method,
			Path:             r.URL.Path,
			Query:            r.URL.RawQuery,
			Body:             string(body),
			Authorization:    r.Header.Get("Authorization"),
			XAPIKey:          r.Header.Get("x-api-key"),
			XGoogAPIKey:      r.Header.Get("x-goog-api-key"),
			AnthropicVersion: r.Header.Get("anthropic-version"),
			ContentType:      r.Header.Get("Content-Type"),
			Accept:           r.Header.Get("Accept"),
		}
		harness.mu.Unlock()

		for key, value := range tc.ResponseHeaders {
			w.Header().Set(key, value)
		}
		w.WriteHeader(tc.ResponseStatusCode)
		_, _ = w.Write([]byte(tc.ResponseBody))
	}))

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	if err := cfg.SaveProvider(config.Provider{
		Name:            tc.ProviderName,
		Type:            tc.ProviderType,
		BaseURL:         harness.upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 16,
		Keys: []config.Key{
			{Value: upstreamKeyForProvider(tc.ProviderType)},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	harness.stats = stats.NewManager(store.New(t.TempDir()))
	cacheDir := t.TempDir()
	harness.cacheStore = cache.NewStore(cacheDir)
	harness.proxy = handler.NewProxyHandler(cfg, harness.stats, keyring.New(cfg), harness.cacheStore, 8)
	return harness
}

func (h *officialProviderHarness) Close() {
	if h.upstream != nil {
		h.upstream.Close()
	}
	if h.stats != nil {
		h.stats.Stop()
	}
	if h.cacheStore != nil {
		_ = h.cacheStore.Close()
	}
}

func (h *officialProviderHarness) UpstreamCalls() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.upstreamCalls
}

func (h *officialProviderHarness) LastObservedRequest() observedUpstreamRequest {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.lastObserved
}

func buildDeterministicOpenAIChatRequests(seed int64, count int) []proxyScenarioRequest {
	rng := rand.New(rand.NewSource(seed))
	requests := make([]proxyScenarioRequest, 0, count)
	for i := 0; i < count; i++ {
		marker := fmt.Sprintf("evict-%02d-%03d", i, rng.Intn(1000))
		requests = append(requests, buildOpenAIChatRequest(marker, false, true))
	}
	return requests
}

func newOpenAICacheEvictionHarness(t *testing.T, maxEntries int) *openAICacheEvictionHarness {
	t.Helper()

	harness := &openAICacheEvictionHarness{}
	harness.upstream = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("读取 OpenAI 淘汰测试上游请求失败: %v", err)
		}
		marker := shortBodyHash(body)
		harness.mu.Lock()
		harness.calls++
		harness.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(buildOpenAIChatResponse(marker, buildLongText("eviction answer "+marker, 6), 12, 8)))
	}))

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		BaseURL:         harness.upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: maxEntries,
		Keys: []config.Key{
			{Value: "upstream-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	harness.stats = stats.NewManager(store.New(t.TempDir()))
	harness.cacheDir = t.TempDir()
	harness.cacheStore = cache.NewStore(harness.cacheDir)
	harness.proxy = handler.NewProxyHandler(cfg, harness.stats, keyring.New(cfg), harness.cacheStore, 8)
	return harness
}

func (h *openAICacheEvictionHarness) Close() {
	if h.upstream != nil {
		h.upstream.Close()
	}
	if h.stats != nil {
		h.stats.Stop()
	}
	if h.cacheStore != nil {
		_ = h.cacheStore.Close()
	}
}

func (h *openAICacheEvictionHarness) UpstreamCalls() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.calls
}

func (h *openAICacheEvictionHarness) CacheEntryCount(t *testing.T) int {
	t.Helper()
	return sqliteEntryCount(t, filepath.Join(h.cacheDir, "openai", "cache.db"))
}

func buildDeterministicRandomTrafficCases(seed int64, count int) []randomTrafficCase {
	rng := rand.New(rand.NewSource(seed))
	cacheableWarmups := []randomTrafficCase{
		buildRandomOpenAIChatCase(fmt.Sprintf("warm-openai-%03d", rng.Intn(1000)), true),
		buildRandomOpenAIResponsesCase(fmt.Sprintf("warm-responses-%03d", rng.Intn(1000)), true),
		buildRandomClaudeCase(fmt.Sprintf("warm-claude-%03d", rng.Intn(1000)), true),
		buildRandomGeminiCase(fmt.Sprintf("warm-gemini-%03d", rng.Intn(1000)), true),
	}

	cases := make([]randomTrafficCase, 0, count)
	for len(cases) < count {
		if len(cases) < len(cacheableWarmups) {
			cases = append(cases, cacheableWarmups[len(cases)])
			continue
		}

		if len(cases)%3 == 0 {
			cases = append(cases, cacheableWarmups[len(cases)%len(cacheableWarmups)])
			continue
		}

		switch len(cases) % 4 {
		case 0:
			cases = append(cases, buildRandomOpenAIChatCase(fmt.Sprintf("openai-%03d", rng.Intn(1000)), len(cases)%5 != 0))
		case 1:
			cases = append(cases, buildRandomOpenAIResponsesCase(fmt.Sprintf("responses-%03d", rng.Intn(1000)), len(cases)%4 != 0))
		case 2:
			cases = append(cases, buildRandomClaudeCase(fmt.Sprintf("claude-%03d", rng.Intn(1000)), len(cases)%4 != 0))
		default:
			cases = append(cases, buildRandomGeminiCase(fmt.Sprintf("gemini-%03d", rng.Intn(1000)), len(cases)%5 != 0))
		}
	}
	return cases
}

func newRandomTrafficHarness(t *testing.T, traffic []randomTrafficCase) *randomTrafficHarness {
	t.Helper()

	harness := &randomTrafficHarness{
		cacheDir:        t.TempDir(),
		totalCacheLimit: 64,
		providerNames:   []string{"openai", "responses", "claude", "gemini"},
		callsByProvider: make(map[string]int),
		responseByKey:   make(map[string]randomTrafficCase, len(traffic)),
	}

	for _, tc := range traffic {
		harness.responseByKey[randomTrafficKey(tc.ProviderName, tc.Request)] = tc
	}

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}

	type providerSetup struct {
		name string
		pt   config.ProviderType
		key  string
	}
	setups := []providerSetup{
		{name: "openai", pt: config.OpenAIChat, key: "upstream-key"},
		{name: "responses", pt: config.OpenAIResponses, key: "upstream-key"},
		{name: "claude", pt: config.Claude, key: "claude-key"},
		{name: "gemini", pt: config.Gemini, key: "gemini-key"},
	}

	for _, setup := range setups {
		setup := setup
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("读取随机流量上游请求体失败: %v", err)
			}
			request := proxyScenarioRequest{
				Method: r.Method,
				Path:   requestPathWithQuery(r.URL.Path, r.URL.RawQuery),
				Headers: map[string]string{
					"Content-Type": r.Header.Get("Content-Type"),
					"Accept":       r.Header.Get("Accept"),
				},
				Body: body,
			}

			key := randomTrafficKey(setup.name, request)

			harness.mu.Lock()
			harness.callsByProvider[setup.name]++
			response, ok := harness.responseByKey[key]
			harness.mu.Unlock()
			if !ok {
				t.Fatalf("未找到 provider=%s 的随机流量上游响应，path=%s body=%s", setup.name, request.Path, string(body))
			}

			for headerKey, headerValue := range response.ResponseHeaders {
				w.Header().Set(headerKey, headerValue)
			}
			w.WriteHeader(response.ResponseStatusCode)
			_, _ = w.Write([]byte(response.ResponseBody))
		}))
		harness.servers = append(harness.servers, server)

		if err := cfg.SaveProvider(config.Provider{
			Name:            setup.name,
			Type:            setup.pt,
			BaseURL:         server.URL,
			CacheEnabled:    true,
			CacheMaxEntries: 16,
			Keys: []config.Key{
				{Value: setup.key},
			},
		}); err != nil {
			t.Fatalf("保存 provider %s 失败: %v", setup.name, err)
		}
	}

	harness.stats = stats.NewManager(store.New(t.TempDir()))
	harness.cacheStore = cache.NewStore(harness.cacheDir)
	harness.proxy = handler.NewProxyHandler(cfg, harness.stats, keyring.New(cfg), harness.cacheStore, 24)
	return harness
}

func (h *randomTrafficHarness) Close() {
	for _, server := range h.servers {
		server.Close()
	}
	if h.stats != nil {
		h.stats.Stop()
	}
	if h.cacheStore != nil {
		_ = h.cacheStore.Close()
	}
}

func (h *randomTrafficHarness) ProviderNames() []string {
	return append([]string(nil), h.providerNames...)
}

func (h *randomTrafficHarness) TotalUpstreamCalls() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	total := 0
	for _, calls := range h.callsByProvider {
		total += calls
	}
	return total
}

func (h *randomTrafficHarness) TotalCacheEntries(t *testing.T) int {
	t.Helper()
	total := 0
	for _, providerName := range h.providerNames {
		total += sqliteEntryCount(t, filepath.Join(h.cacheDir, providerName, "cache.db"))
	}
	return total
}

func (h *randomTrafficHarness) TotalCacheLimit() int {
	return h.totalCacheLimit
}

func (h *randomTrafficHarness) TotalCacheHitCount() int64 {
	snapshot := h.stats.Snapshot()
	var total int64
	for _, providerName := range h.providerNames {
		total += snapshot[providerName].CacheHits
	}
	return total
}

func runRandomTrafficConcurrently(t *testing.T, proxy http.Handler, traffic []randomTrafficCase) {
	t.Helper()

	warmups := len(traffic) / 4
	if warmups < 4 {
		warmups = minInt(len(traffic), 4)
	}

	for i := 0; i < warmups; i++ {
		result := runProxyScenario(t, proxy, traffic[i].Request)
		assertProxyStatusAndMarkers(t, result, traffic[i].ExpectedStatusCode, traffic[i].ExpectedBodyMarkers...)
	}

	var wg sync.WaitGroup
	errCh := make(chan error, len(traffic)-warmups)
	for i := warmups; i < len(traffic); i++ {
		tc := traffic[i]
		wg.Add(1)
		go func() {
			defer wg.Done()
			result := runProxyScenario(t, proxy, tc.Request)
			if result.StatusCode != tc.ExpectedStatusCode {
				errCh <- fmt.Errorf("provider=%s path=%s 期望状态码 %d，实际是 %d，响应体: %s", tc.ProviderName, tc.Request.Path, tc.ExpectedStatusCode, result.StatusCode, result.Body)
				return
			}
			for _, marker := range tc.ExpectedBodyMarkers {
				if !strings.Contains(result.Body, marker) {
					errCh <- fmt.Errorf("provider=%s path=%s 响应体缺少标记 %q，实际是 %s", tc.ProviderName, tc.Request.Path, marker, result.Body)
					return
				}
			}
		}()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatal(err)
		}
	}
}

func buildRandomOpenAIChatCase(marker string, cacheRoute bool) randomTrafficCase {
	request := buildOpenAIChatRequest(marker, false, cacheRoute)
	return randomTrafficCase{
		Request:            request,
		ExpectedStatusCode: http.StatusOK,
		ExpectedBodyMarkers: []string{
			marker,
			"chat.completion",
		},
		ProviderName:       "openai",
		ResponseStatusCode: http.StatusOK,
		ResponseHeaders: map[string]string{
			"Content-Type": "application/json",
		},
		ResponseBody: buildOpenAIChatResponse(marker, buildLongText("random openai "+marker, 10), 18, 12),
	}
}

func buildRandomOpenAIResponsesCase(marker string, cacheRoute bool) randomTrafficCase {
	request := buildOpenAIResponsesRequestForRoute(marker, false, cacheRoute)
	return randomTrafficCase{
		Request:            request,
		ExpectedStatusCode: http.StatusOK,
		ExpectedBodyMarkers: []string{
			marker,
			`"object":"response"`,
		},
		ProviderName:       "responses",
		ResponseStatusCode: http.StatusOK,
		ResponseHeaders: map[string]string{
			"Content-Type": "application/json",
		},
		ResponseBody: buildOpenAIResponsesJSONResponse(marker, buildLongText("random responses "+marker, 8), 16, 11),
	}
}

func buildRandomClaudeCase(marker string, cacheRoute bool) randomTrafficCase {
	request := buildClaudeRequestForRoute(marker, false, cacheRoute)
	return randomTrafficCase{
		Request:            request,
		ExpectedStatusCode: http.StatusOK,
		ExpectedBodyMarkers: []string{
			marker,
			`"type":"message"`,
		},
		ProviderName:       "claude",
		ResponseStatusCode: http.StatusOK,
		ResponseHeaders: map[string]string{
			"Content-Type": "application/json",
		},
		ResponseBody: buildClaudeResponse(marker, buildLongText("random claude "+marker, 7), 14, 9),
	}
}

func buildRandomGeminiCase(marker string, cacheRoute bool) randomTrafficCase {
	request := buildGeminiRequestForRoute(marker, false, cacheRoute)
	return randomTrafficCase{
		Request:            request,
		ExpectedStatusCode: http.StatusOK,
		ExpectedBodyMarkers: []string{
			marker,
			`"usageMetadata"`,
		},
		ProviderName:       "gemini",
		ResponseStatusCode: http.StatusOK,
		ResponseHeaders: map[string]string{
			"Content-Type": "application/json",
		},
		ResponseBody: buildGeminiJSONResponse(marker, buildLongText("random gemini "+marker, 7), 15, 10),
	}
}

func buildOpenAIChatRequest(marker string, stream bool, cacheRoute bool) proxyScenarioRequest {
	requestBody := mustMarshalJSON(map[string]any{
		"model": "gpt-4.1",
		"messages": []any{
			map[string]any{"role": "system", "content": "Return concise but complete answers."},
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "marker=" + marker},
					map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://example.com/" + marker + ".png"}},
				},
			},
			map[string]any{"role": "assistant", "content": "Acknowledged marker " + marker},
			map[string]any{"role": "user", "content": "continue with long answer for " + marker},
		},
		"stream": stream,
		"stream_options": map[string]any{
			"include_usage": true,
		},
	})

	headers := baseJSONHeaders()
	if stream {
		headers["Accept"] = "text/event-stream"
	}
	return proxyScenarioRequest{
		Method:  http.MethodPost,
		Path:    routePrefix(cacheRoute, "openai") + "/v1/chat/completions",
		Headers: headers,
		Body:    requestBody,
	}
}

func buildOpenAIResponsesRequest(marker string, stream bool) proxyScenarioRequest {
	return buildOpenAIResponsesRequestForRoute(marker, stream, true)
}

func buildOpenAIResponsesRequestForRoute(marker string, stream bool, cacheRoute bool) proxyScenarioRequest {
	requestBody := mustMarshalJSON(map[string]any{
		"model": "gpt-5",
		"input": []any{
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "input_text", "text": "marker=" + marker},
					map[string]any{"type": "input_image", "image_url": "https://example.com/" + marker + ".jpg"},
				},
			},
		},
		"stream": stream,
	})

	headers := baseJSONHeaders()
	if stream {
		headers["Accept"] = "text/event-stream"
	}
	return proxyScenarioRequest{
		Method:  http.MethodPost,
		Path:    routePrefix(cacheRoute, "responses") + "/v1/responses",
		Headers: headers,
		Body:    requestBody,
	}
}

func buildClaudeRequest(marker string, stream bool) proxyScenarioRequest {
	return buildClaudeRequestForRoute(marker, stream, true)
}

func buildClaudeRequestForRoute(marker string, stream bool, cacheRoute bool) proxyScenarioRequest {
	requestBody := mustMarshalJSON(map[string]any{
		"model": "claude-sonnet-4-5",
		"messages": []any{
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "marker=" + marker},
					map[string]any{
						"type": "image",
						"source": map[string]any{
							"type":       "base64",
							"media_type": "image/png",
							"data":       "ZmFrZS1jbGF1ZGUtaW1hZ2U=",
						},
					},
				},
			},
		},
		"stream": stream,
	})

	headers := baseJSONHeaders()
	headers["anthropic-version"] = "2023-06-01"
	if stream {
		headers["Accept"] = "text/event-stream"
	}
	return proxyScenarioRequest{
		Method:  http.MethodPost,
		Path:    routePrefix(cacheRoute, "claude") + "/v1/messages",
		Headers: headers,
		Body:    requestBody,
	}
}

func buildGeminiRequest(marker string, stream bool) proxyScenarioRequest {
	return buildGeminiRequestForRoute(marker, stream, true)
}

func buildGeminiRequestForRoute(marker string, stream bool, cacheRoute bool) proxyScenarioRequest {
	path := routePrefix(cacheRoute, "gemini") + "/v1beta/models/gemini-2.5-flash:generateContent"
	if stream {
		path = routePrefix(cacheRoute, "gemini") + "/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse"
	}

	requestBody := mustMarshalJSON(map[string]any{
		"model": "gemini-2.5-flash",
		"contents": []any{
			map[string]any{
				"role": "user",
				"parts": []any{
					map[string]any{"text": "marker=" + marker},
					map[string]any{
						"inline_data": map[string]any{
							"mime_type": "image/png",
							"data":      "ZmFrZS1nZW1pbmktaW1hZ2U=",
						},
					},
				},
			},
		},
	})

	headers := baseJSONHeaders()
	if stream {
		headers["Accept"] = "text/event-stream"
	}
	return proxyScenarioRequest{
		Method:  http.MethodPost,
		Path:    path,
		Headers: headers,
		Body:    requestBody,
	}
}

func buildOpenAIChatResponse(marker, content string, promptTokens, completionTokens int64) string {
	total := promptTokens + completionTokens
	return string(mustMarshalJSON(map[string]any{
		"id":     "chatcmpl-" + marker,
		"object": "chat.completion",
		"model":  "gpt-4.1",
		"choices": []any{
			map[string]any{
				"index": 0,
				"message": map[string]any{
					"role":    "assistant",
					"content": content + " " + marker,
				},
				"finish_reason": "stop",
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     promptTokens,
			"completion_tokens": completionTokens,
			"total_tokens":      total,
		},
	}))
}

func buildOpenAIResponsesJSONResponse(marker, content string, inputTokens, outputTokens int64) string {
	total := inputTokens + outputTokens
	return string(mustMarshalJSON(map[string]any{
		"id":     "resp_" + marker,
		"object": "response",
		"status": "completed",
		"model":  "gpt-5",
		"output": []any{
			map[string]any{
				"type":   "message",
				"id":     "msg_" + marker,
				"status": "completed",
				"role":   "assistant",
				"content": []any{
					map[string]any{
						"type":        "output_text",
						"text":        content + " " + marker,
						"annotations": []any{},
					},
				},
			},
		},
		"usage": map[string]any{
			"input_tokens":  inputTokens,
			"output_tokens": outputTokens,
			"total_tokens":  total,
		},
	}))
}

func buildOpenAIResponsesStreamResponse(marker, content string, inputTokens, outputTokens int64) string {
	total := inputTokens + outputTokens
	return strings.Join([]string{
		`data: {"type":"response.created","response":{"id":"resp_` + marker + `","object":"response","model":"gpt-5","output":[],"usage":null}}`,
		``,
		`data: {"type":"response.output_text.delta","delta":"` + content[:minInt(len(content), 80)] + `"}`,
		``,
		`data: {"type":"response.output_text.delta","delta":" ` + marker + `"}`,
		``,
		`data: {"type":"response.completed","response":{"id":"resp_` + marker + `","object":"response","status":"completed","model":"gpt-5","output":[{"type":"message","id":"msg_` + marker + `","status":"completed","role":"assistant","content":[{"type":"output_text","text":"` + escapeJSONString(content+" "+marker) + `","annotations":[]}]}],"usage":{"input_tokens":` + fmt.Sprintf("%d", inputTokens) + `,"output_tokens":` + fmt.Sprintf("%d", outputTokens) + `,"total_tokens":` + fmt.Sprintf("%d", total) + `}}}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")
}

func buildClaudeResponse(marker, content string, inputTokens, outputTokens int64) string {
	return string(mustMarshalJSON(map[string]any{
		"id":            "msg_" + marker,
		"type":          "message",
		"role":          "assistant",
		"model":         "claude-sonnet-4-5",
		"stop_reason":   "end_turn",
		"stop_sequence": nil,
		"content": []any{
			map[string]any{
				"type": "text",
				"text": content + " " + marker,
			},
		},
		"usage": map[string]any{
			"input_tokens":  inputTokens,
			"output_tokens": outputTokens,
		},
	}))
}

func buildGeminiJSONResponse(marker, content string, promptTokens, candidateTokens int64) string {
	total := promptTokens + candidateTokens
	return string(mustMarshalJSON(map[string]any{
		"candidates": []any{
			map[string]any{
				"content": map[string]any{
					"parts": []any{
						map[string]any{"text": content + " " + marker},
					},
				},
				"finishReason": "STOP",
			},
		},
		"usageMetadata": map[string]any{
			"promptTokenCount":        promptTokens,
			"candidatesTokenCount":    candidateTokens,
			"totalTokenCount":         total,
			"cachedContentTokenCount": 0,
		},
	}))
}

func buildGeminiStreamResponse(marker, content string, promptTokens, candidateTokens int64) string {
	total := promptTokens + candidateTokens
	firstPart := content[:minInt(len(content), 70)]
	secondPart := content[minInt(len(content), 70):]
	if secondPart == "" {
		secondPart = marker
	}
	return strings.Join([]string{
		`data: {"candidates":[{"content":{"parts":[{"text":"` + escapeJSONString(firstPart) + `"}]}}]}`,
		``,
		`data: {"candidates":[{"content":{"parts":[{"text":"` + escapeJSONString(secondPart+" "+marker) + `"}]}}],"usageMetadata":{"promptTokenCount":` + fmt.Sprintf("%d", promptTokens) + `,"candidatesTokenCount":` + fmt.Sprintf("%d", candidateTokens) + `,"totalTokenCount":` + fmt.Sprintf("%d", total) + `}}`,
		``,
	}, "\n")
}

func baseJSONHeaders() map[string]string {
	return map[string]string{
		"Authorization": "Bearer client-key",
		"Content-Type":  "application/json",
	}
}

func routePrefix(cacheRoute bool, providerName string) string {
	if cacheRoute {
		return "/cache/" + providerName
	}
	return "/" + providerName
}

func upstreamKeyForProvider(providerType config.ProviderType) string {
	switch providerType {
	case config.Claude:
		return "claude-key"
	case config.Gemini:
		return "gemini-key"
	default:
		return "upstream-key"
	}
}

func assertProxyStatusAndMarkers(t *testing.T, result proxyScenarioResult, expectedStatus int, markers ...string) {
	t.Helper()
	if result.StatusCode != expectedStatus {
		t.Fatalf("期望状态码 %d，实际是 %d，响应体: %s", expectedStatus, result.StatusCode, result.Body)
	}
	for _, marker := range markers {
		if !strings.Contains(result.Body, marker) {
			t.Fatalf("期望响应体包含 %q，实际是 %s", marker, result.Body)
		}
	}
}

func randomTrafficKey(providerName string, request proxyScenarioRequest) string {
	return providerName + "|" + request.Method + "|" + normalizeProxyRoute(providerName, request.Path) + "|" + request.Headers["Accept"] + "|" + string(request.Body)
}

func requestPathWithQuery(path, rawQuery string) string {
	if rawQuery == "" {
		return path
	}
	return path + "?" + rawQuery
}

func normalizeProxyRoute(providerName, rawPath string) string {
	for _, prefix := range []string{"/cache/" + providerName, "/" + providerName} {
		if strings.HasPrefix(rawPath, prefix) {
			return strings.TrimPrefix(rawPath, prefix)
		}
	}
	return rawPath
}

func mustMarshalJSON(value any) []byte {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return data
}

func shortBodyHash(body []byte) string {
	sum := sha1.Sum(body)
	return hex.EncodeToString(sum[:6])
}

func buildLongText(prefix string, repeat int) string {
	parts := make([]string, 0, repeat)
	for i := 0; i < repeat; i++ {
		parts = append(parts, fmt.Sprintf("%s segment-%02d", prefix, i))
	}
	return strings.Join(parts, " ")
}

func escapeJSONString(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return strings.Trim(string(encoded), `"`)
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}
