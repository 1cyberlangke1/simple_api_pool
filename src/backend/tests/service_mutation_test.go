package tests

import (
	"net/http"
	"testing"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/service"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func TestGlobalConfigMutationServiceValidatesAndNormalizesInput(t *testing.T) {
	cfg := newTestConfig(t)
	mutationService := service.NewGlobalConfigService(cfg)

	if _, err := mutationService.Update(service.GlobalConfigUpdateInput{
		AdminKey: stringPointer("   "),
	}); err == nil {
		t.Fatal("期望 service 层拒绝空白管理员密钥")
	}

	changedAdminKey, err := mutationService.Update(service.GlobalConfigUpdateInput{
		AdminKey:               stringPointer(" next-admin "),
		TokenEstimationEnabled: boolPointer(true),
		ClientKeys:             &[]string{" client-1 ", "", "client-2"},
	})
	if err != nil {
		t.Fatalf("通过 service 更新全局配置失败: %v", err)
	}
	if !changedAdminKey {
		t.Fatal("期望 service 层标记管理员密钥已变化")
	}

	snapshot := cfg.GlobalConfig()
	if snapshot.AdminKey != "next-admin" {
		t.Fatalf("期望管理员密钥被规范化保存，实际是 %q", snapshot.AdminKey)
	}
	if len(snapshot.ClientKeys) != 2 || snapshot.ClientKeys[0] != "client-1" || snapshot.ClientKeys[1] != "client-2" {
		t.Fatalf("期望客户端密钥被规范化保存，实际是 %+v", snapshot.ClientKeys)
	}
}

func TestProviderMutationServiceCoordinatesConfigCacheAndStats(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name:            "openai",
		Type:            config.OpenAIChat,
		CacheEnabled:    true,
		CacheMaxEntries: 10,
		Keys:            []config.Key{{Value: "key-1"}},
	}); err != nil {
		t.Fatalf("准备提供商失败: %v", err)
	}

	cacheStore := newTestCacheStore(t)
	requestBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	cacheStore.Set("openai", config.OpenAIChat, "gpt-4.1", requestBody, []byte(`{"id":"cached"}`), http.StatusOK, map[string]string{"Content-Type": "application/json"}, 1, 1, 10)

	statsManager := stats.NewManager(store.New(t.TempDir()))
	defer statsManager.Stop()
	statsManager.RecordSuccess("openai", 1, 2)

	mutationService := service.NewProviderMutationService(cfg, statsManager, cacheStore)

	savedProvider, created, err := mutationService.SaveProvider(config.Provider{
		Name:         "openai",
		Type:         config.OpenAIChat,
		KeyStrategy:  "fill",
		CacheEnabled: true,
	})
	if err != nil {
		t.Fatalf("通过 service 保存提供商失败: %v", err)
	}
	if created {
		t.Fatal("期望更新已有提供商时 created=false")
	}
	if savedProvider.KeyStrategy != "fill" || len(savedProvider.Keys) != 1 {
		t.Fatalf("期望保留已有 key 并应用新策略，实际是 %+v", savedProvider)
	}

	if err := mutationService.DeleteProvider("openai"); err != nil {
		t.Fatalf("通过 service 删除提供商失败: %v", err)
	}
	if provider, _ := cfg.Provider("openai"); provider != nil {
		t.Fatalf("期望提供商已删除，实际仍存在: %+v", provider)
	}
	if _, ok := cacheStore.Get("openai", config.OpenAIChat, "gpt-4.1", requestBody); ok {
		t.Fatal("期望删除提供商时 service 一并清理缓存")
	}
	if _, ok := statsManager.Snapshot()["openai"]; ok {
		t.Fatal("期望删除提供商时 service 一并移除统计")
	}
}

func TestKeyActionServiceNormalizesDisableUntilInputs(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "k1"}},
	}); err != nil {
		t.Fatalf("准备提供商失败: %v", err)
	}

	actionService := service.NewKeyActionService(cfg)
	before := time.Now().Unix()
	if err := actionService.Apply("openai", service.KeyActionInput{
		Action:         "disable_until",
		Keys:           []string{"k1"},
		DisableSeconds: 60,
	}); err != nil {
		t.Fatalf("通过 service 执行定时禁用失败: %v", err)
	}
	after := time.Now().Unix()

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if provider.Keys[0].DisabledUntil < before+60 || provider.Keys[0].DisabledUntil > after+60 {
		t.Fatalf("期望 service 把 disable_seconds 转成 disabled_until，实际是 %d", provider.Keys[0].DisabledUntil)
	}
}
