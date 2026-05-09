package tests

import (
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/store"
)

func TestUpdateProviderSettingsAppliesSameDefaultsAsSaveProvider(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "k1"}},
	}); err != nil {
		t.Fatalf("保存初始提供商失败: %v", err)
	}

	if err := cfg.UpdateProviderSettings(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("更新提供商设置失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if provider.BaseURL != config.DefaultBaseURL(config.OpenAIChat) {
		t.Fatalf("期望更新设置时也补默认 BaseURL，实际是 %q", provider.BaseURL)
	}
	if provider.KeyStrategy != "round_robin" {
		t.Fatalf("期望更新设置时也补默认策略，实际是 %q", provider.KeyStrategy)
	}
	if provider.FailThreshold != 3 || provider.MinDisableSecs != 30 || provider.MaxDisableSecs != 43200 {
		t.Fatalf("期望更新设置时沿用默认失败配置，实际是 %+v", provider)
	}
	if len(provider.Keys) != 1 || provider.Keys[0].Value != "k1" {
		t.Fatalf("期望更新设置时保留已有密钥，实际是 %+v", provider.Keys)
	}
}
