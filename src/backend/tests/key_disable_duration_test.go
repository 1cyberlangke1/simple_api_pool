package tests

import (
	"testing"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/store"
)

func TestApplyStructuredKeyActionSupportsTimedAndPermanentDisable(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{
			{Value: "k1"},
			{Value: "k2"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	disableDeadline := time.Now().Add(15 * time.Minute).Unix()
	if err := cfg.ApplyStructuredKeyAction("openai", config.KeyActionRequest{
		Action:        config.KeyActionDisableUntil,
		Keys:          []string{"k1"},
		DisabledUntil: disableDeadline,
	}); err != nil {
		t.Fatalf("定时禁用失败: %v", err)
	}

	if err := cfg.ApplyStructuredKeyAction("openai", config.KeyActionRequest{
		Action: config.KeyActionDisableForever,
		Keys:   []string{"k2"},
	}); err != nil {
		t.Fatalf("永久禁用失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if provider.Keys[0].DisabledUntil != disableDeadline {
		t.Fatalf("期望 k1 被禁用到指定时间，实际是 %d", provider.Keys[0].DisabledUntil)
	}
	if provider.Keys[1].DisabledUntil != config.KeyPermanentlyDisabled {
		t.Fatalf("期望 k2 被永久禁用，实际是 %d", provider.Keys[1].DisabledUntil)
	}

	if err := cfg.ApplyStructuredKeyAction("openai", config.KeyActionRequest{
		Action: config.KeyActionEnable,
		Keys:   []string{"k1"},
	}); err != nil {
		t.Fatalf("重新启用失败: %v", err)
	}

	provider, _ = cfg.Provider("openai")
	if provider.Keys[0].DisabledUntil != 0 || provider.Keys[0].ConsecutiveFails != 0 {
		t.Fatalf("期望启用后清空 k1 的禁用和失败状态，实际是 %+v", provider.Keys[0])
	}
	if provider.Keys[1].DisabledUntil != config.KeyPermanentlyDisabled {
		t.Fatalf("期望永久禁用的 k2 不受影响，实际是 %+v", provider.Keys[1])
	}
}
