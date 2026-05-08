package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestOfficialProviderRoundTripAndCacheHit(t *testing.T) {
	for _, tc := range buildOfficialRoundTripCases() {
		t.Run(tc.Name, func(t *testing.T) {
			harness := newOfficialProviderHarness(t, tc)
			defer harness.Close()

			first := runProxyScenario(t, harness.proxy, tc.Request)
			tc.AssertFirstResponse(t, first)

			second := runProxyScenario(t, harness.proxy, tc.Request)
			tc.AssertCachedResponse(t, second)

			if got := harness.UpstreamCalls(); got != 1 {
				t.Fatalf("期望第二次相同缓存请求不再访问上游，实际上游调用次数是 %d", got)
			}
			tc.AssertUpstreamRequest(t, harness.LastObservedRequest())
		})
	}
}

func TestGeminiCacheKeySeparatesModelsWhenBodyOmitsTopLevelModel(t *testing.T) {
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1beta/models/gemini-2.5-flash:generateContent":
			_, _ = w.Write([]byte(buildGeminiJSONResponse("flash-marker", buildLongText("flash-answer", 4), 9, 6)))
		case "/v1beta/models/gemini-2.5-pro:generateContent":
			_, _ = w.Write([]byte(buildGeminiJSONResponse("pro-marker", buildLongText("pro-answer", 4), 11, 7)))
		default:
			t.Fatalf("未预期的 Gemini 上游路径: %s", r.URL.Path)
		}
	}))
	defer upstream.Close()

	cfg := newTestConfig(t)
	if err := cfg.UpdateGlobalConfig("", false, []string{"client-key"}); err != nil {
		t.Fatalf("更新全局配置失败: %v", err)
	}
	if err := cfg.SaveProvider(config.Provider{
		Name:            "gemini",
		Type:            config.Gemini,
		BaseURL:         upstream.URL,
		CacheEnabled:    true,
		CacheMaxEntries: 16,
		Keys: []config.Key{
			{Value: "gemini-key"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	cacheStore := cache.NewStore(t.TempDir())
	defer cacheStore.Close()
	proxy := proxyapi.NewProxyHandler(cfg, statsManager, keyring.New(cfg), cacheStore, 8)

	flash := buildGeminiRequestForModelPath("shared-marker", "gemini-2.5-flash", false, true)
	flashFirst := runProxyScenario(t, proxy, flash)
	assertProxyStatusAndMarkers(t, flashFirst, http.StatusOK, "flash-marker")
	flashSecond := runProxyScenario(t, proxy, flash)
	assertProxyStatusAndMarkers(t, flashSecond, http.StatusOK, "flash-marker", `"cachedContentTokenCount":15`)

	pro := buildGeminiRequestForModelPath("shared-marker", "gemini-2.5-pro", false, true)
	proFirst := runProxyScenario(t, proxy, pro)
	assertProxyStatusAndMarkers(t, proFirst, http.StatusOK, "pro-marker")
	proSecond := runProxyScenario(t, proxy, pro)
	assertProxyStatusAndMarkers(t, proSecond, http.StatusOK, "pro-marker", `"cachedContentTokenCount":18`)

	if upstreamCalls != 2 {
		t.Fatalf("期望两个不同 Gemini 模型各自首请回源一次，实际上游调用次数是 %d", upstreamCalls)
	}
}
