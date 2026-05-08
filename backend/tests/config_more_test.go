package tests

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/store"
)

func TestDefaultBaseURLCoversAllSupportedProviderTypes(t *testing.T) {
	cases := []struct {
		name string
		in   config.ProviderType
		want string
	}{
		{name: "openai_chat", in: config.OpenAIChat, want: "https://api.openai.com"},
		{name: "openai_responses", in: config.OpenAIResponses, want: "https://api.openai.com"},
		{name: "claude", in: config.Claude, want: "https://api.anthropic.com"},
		{name: "gemini", in: config.Gemini, want: "https://generativelanguage.googleapis.com"},
		{name: "unknown", in: config.ProviderType("unknown"), want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := config.DefaultBaseURL(tc.in); got != tc.want {
				t.Fatalf("期望 %q，实际是 %q", tc.want, got)
			}
		})
	}
}

func TestConfigSupportsDeleteProviderUpdateKeyStateAndReadGlobalConfig(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "k1"}, {Value: "k2"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	if err := cfg.UpdateGlobalConfig("admin", true, []string{"c1", "c2"}); err != nil {
		t.Fatalf("保存全局配置失败: %v", err)
	}
	global := cfg.GlobalConfig()
	if global.AdminKey != "admin" || !global.TokenEstimationEnabled {
		t.Fatalf("期望全局配置被保存，实际是 %+v", global)
	}
	if len(global.Providers) != 0 {
		t.Fatalf("期望 GlobalConfig 不直接暴露 Providers，实际是 %+v", global.Providers)
	}

	if err := cfg.UpdateKeyState("openai", "k2", 12345, 3); err != nil {
		t.Fatalf("更新密钥状态失败: %v", err)
	}
	provider, idx := cfg.Provider("openai")
	if provider == nil || idx != 0 {
		t.Fatalf("期望能读到 openai 提供商，实际 provider=%+v idx=%d", provider, idx)
	}
	if provider.Keys[1].DisabledUntil != 12345 || provider.Keys[1].ConsecutiveFails != 3 {
		t.Fatalf("期望密钥状态被更新，实际是 %+v", provider.Keys[1])
	}

	if err := cfg.DeleteProvider("openai"); err != nil {
		t.Fatalf("删除提供商失败: %v", err)
	}
	deleted, idx := cfg.Provider("openai")
	if deleted != nil || idx != -1 {
		t.Fatalf("期望删除提供商后查不到，实际 provider=%+v idx=%d", deleted, idx)
	}
}

func TestConfigMutationReturnsPersistenceErrors(t *testing.T) {
	baseDir := t.TempDir()
	blockingPath := filepath.Join(baseDir, "blocked")
	if err := os.WriteFile(blockingPath, []byte("blocked"), 0600); err != nil {
		t.Fatalf("创建阻塞文件失败: %v", err)
	}

	cfg := config.New(store.New(blockingPath))
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "k1"}},
	}); err == nil {
		t.Fatal("期望保存提供商时返回持久化错误")
	}
	if err := cfg.UpdateGlobalConfig("admin", true, []string{"client-key"}); err == nil {
		t.Fatal("期望更新全局配置时返回持久化错误")
	}
	if err := cfg.UpdateKeyState("openai", "k1", 10, 1); err == nil {
		t.Fatal("期望更新密钥状态时返回持久化错误")
	}
	if err := cfg.DeleteProvider("openai"); err == nil {
		t.Fatal("期望删除提供商时返回持久化错误")
	}
}

func TestConfigReturnsNotExistForMissingKeyDeletionAndUnknownProviderKeyAdd(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))

	if err := cfg.AddKeys("missing", []string{"a"}); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("期望 AddKeys 返回 os.ErrNotExist，实际是 %v", err)
	}
	if err := cfg.DeleteKey("missing", "a"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("期望 DeleteKey 返回 os.ErrNotExist，实际是 %v", err)
	}
}

func TestConfigSupportsBulkKeyActions(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "k1"},
			{Value: "k2"},
			{Value: "k3"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	if err := cfg.ApplyKeyAction("openai", "disable", []string{"k1", "k3"}); err != nil {
		t.Fatalf("批量禁用失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if provider.Keys[0].DisabledUntil == 0 || provider.Keys[2].DisabledUntil == 0 {
		t.Fatalf("期望 k1 和 k3 被禁用，实际是 %+v", provider.Keys)
	}

	if err := cfg.ApplyKeyAction("openai", "enable", []string{"k1"}); err != nil {
		t.Fatalf("批量启用失败: %v", err)
	}

	provider, _ = cfg.Provider("openai")
	if provider.Keys[0].DisabledUntil != 0 || provider.Keys[0].ConsecutiveFails != 0 {
		t.Fatalf("期望 k1 被启用并清空失败计数，实际是 %+v", provider.Keys[0])
	}
	if provider.Keys[2].DisabledUntil == 0 {
		t.Fatalf("期望 k3 仍保持禁用，实际是 %+v", provider.Keys[2])
	}

	if err := cfg.ApplyKeyAction("openai", "delete", []string{"k2", "k3"}); err != nil {
		t.Fatalf("批量删除失败: %v", err)
	}

	provider, _ = cfg.Provider("openai")
	if len(provider.Keys) != 1 || provider.Keys[0].Value != "k1" {
		t.Fatalf("期望最终只剩 k1，实际是 %+v", provider.Keys)
	}
}

func TestProviderReturnsDetachedKeySlice(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "k1", DisabledUntil: 10, ConsecutiveFails: 2},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望读取到提供商")
	}
	provider.Keys[0].DisabledUntil = 999
	provider.Keys[0].ConsecutiveFails = 999

	reloaded, _ := cfg.Provider("openai")
	if reloaded == nil {
		t.Fatal("期望再次读取到提供商")
	}
	if reloaded.Keys[0].DisabledUntil != 10 || reloaded.Keys[0].ConsecutiveFails != 2 {
		t.Fatalf("期望 Provider 返回值与内部状态隔离，实际是 %+v", reloaded.Keys[0])
	}
}

func TestProvidersReturnsDetachedKeySlices(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "gemini",
		Type: config.Gemini,
		Keys: []config.Key{
			{Value: "g1", DisabledUntil: 30, ConsecutiveFails: 1},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	providers := cfg.Providers()
	if len(providers) != 1 {
		t.Fatalf("期望 providers 长度为 1，实际是 %d", len(providers))
	}
	providers[0].Keys[0].DisabledUntil = 777
	providers[0].Keys[0].ConsecutiveFails = 777

	reloaded, _ := cfg.Provider("gemini")
	if reloaded == nil {
		t.Fatal("期望再次读取到 provider")
	}
	if reloaded.Keys[0].DisabledUntil != 30 || reloaded.Keys[0].ConsecutiveFails != 1 {
		t.Fatalf("期望 Providers 返回值与内部状态隔离，实际是 %+v", reloaded.Keys[0])
	}
}
