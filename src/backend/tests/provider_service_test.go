package tests

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"

	"simple-api-pool/adminapi"
	"simple-api-pool/config"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestProviderServiceSaveProviderPreservesExistingKeysAndAppliesDefaults(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "key-1"}},
	}); err != nil {
		t.Fatalf("准备提供商失败: %v", err)
	}

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	service := adminapi.NewProviderService(cfg, statsManager, newTestCacheStore(t))

	snapshot, created, err := service.SaveProvider(config.Provider{
		Name:         "openai",
		Type:         config.OpenAIChat,
		KeyStrategy:  "fill",
		CacheEnabled: true,
	})
	if err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}
	if created {
		t.Fatal("期望更新已有提供商时 created=false")
	}
	if snapshot.BaseURL != "https://api.openai.com" {
		t.Fatalf("期望补齐默认上游地址，实际是 %q", snapshot.BaseURL)
	}
	if snapshot.KeyStrategy != "fill" {
		t.Fatalf("期望保存 key 策略 fill，实际是 %q", snapshot.KeyStrategy)
	}
	if snapshot.FailThreshold != 3 || snapshot.MinDisableSecs != 30 || snapshot.MaxDisableSecs != 43200 {
		t.Fatalf("期望应用默认禁用策略，实际是 %+v", snapshot)
	}
	if snapshot.CacheMaxEntries != 1000 {
		t.Fatalf("期望应用默认缓存条目数 1000，实际是 %d", snapshot.CacheMaxEntries)
	}
	if len(snapshot.Keys) != 1 {
		t.Fatalf("期望保留已有密钥，实际是 %+v", snapshot.Keys)
	}
}

func TestProviderServiceDeleteProviderRemovesProviderStatsAndCache(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
	}); err != nil {
		t.Fatalf("准备提供商失败: %v", err)
	}

	cacheStore := newTestCacheStore(t)
	requestBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", requestBody, []byte(`{"id":"cached"}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	statsManager.RecordSuccess("openai", 1, 2)

	service := adminapi.NewProviderService(cfg, statsManager, cacheStore)
	if err := service.DeleteProvider("openai"); err != nil {
		t.Fatalf("删除提供商失败: %v", err)
	}

	if provider, _ := cfg.Provider("openai"); provider != nil {
		t.Fatalf("期望提供商已删除，实际仍存在: %+v", provider)
	}
	if _, ok := cacheStore.Get("openai", config.OpenAIChat, "gpt-4.1", requestBody); ok {
		t.Fatal("期望删除提供商时一并清理缓存")
	}
	if _, ok := statsManager.Snapshot()["openai"]; ok {
		t.Fatal("期望删除提供商时一并移除统计")
	}
}

func TestProviderServiceResolvesKeyIdentifiersByValueAndReference(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "key-1"},
			{Value: "key-2"},
		},
	}); err != nil {
		t.Fatalf("准备提供商失败: %v", err)
	}

	service := adminapi.NewProviderService(cfg, stats.NewManager(store.New(t.TempDir())), newTestCacheStore(t))
	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	keyRef := buildKeyReferenceForTest(provider.Keys[0].Value)

	resolved := service.ResolveKeyIdentifiers("openai", []string{keyRef, "key-2", keyRef, "missing"})
	if len(resolved) != 2 {
		t.Fatalf("期望解析出两个唯一密钥，实际是 %+v", resolved)
	}
	if resolved[0] != "key-1" || resolved[1] != "key-2" {
		t.Fatalf("期望解析结果保留原始密钥值，实际是 %+v", resolved)
	}
}

func buildKeyReferenceForTest(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:8])
}
