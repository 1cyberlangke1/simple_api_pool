package tests

import (
	"errors"
	"os"
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

	cfg.UpdateGlobalConfig("admin", true, []string{"c1", "c2"})
	global := cfg.GlobalConfig()
	if global.AdminKey != "admin" || !global.TokenEstimationEnabled {
		t.Fatalf("期望全局配置被保存，实际是 %+v", global)
	}
	if len(global.Providers) != 0 {
		t.Fatalf("期望 GlobalConfig 不直接暴露 Providers，实际是 %+v", global.Providers)
	}

	cfg.UpdateKeyState("openai", "k2", 12345, 3)
	provider, idx := cfg.Provider("openai")
	if provider == nil || idx != 0 {
		t.Fatalf("期望能读到 openai 提供商，实际 provider=%+v idx=%d", provider, idx)
	}
	if provider.Keys[1].DisabledUntil != 12345 || provider.Keys[1].ConsecutiveFails != 3 {
		t.Fatalf("期望密钥状态被更新，实际是 %+v", provider.Keys[1])
	}

	cfg.DeleteProvider("openai")
	deleted, idx := cfg.Provider("openai")
	if deleted != nil || idx != -1 {
		t.Fatalf("期望删除提供商后查不到，实际 provider=%+v idx=%d", deleted, idx)
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
