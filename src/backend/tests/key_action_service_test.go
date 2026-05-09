package tests

import (
	"testing"
	"time"

	"simple-api-pool/adminapi"
	"simple-api-pool/config"
)

func TestKeyActionServiceSupportsTimedDisable(t *testing.T) {
	cfg := newTestConfig(t)
	if err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
		Keys: []config.Key{{Value: "k1"}},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	service := adminapi.NewKeyActionService(cfg)
	deadline := time.Now().Add(30 * time.Minute).Unix()
	if err := service.Apply("openai", adminapi.KeyActionInput{
		Action:        "disable_until",
		Keys:          []string{"k1"},
		DisabledUntil: deadline,
	}); err != nil {
		t.Fatalf("执行定时禁用失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商存在")
	}
	if provider.Keys[0].DisabledUntil != deadline {
		t.Fatalf("期望 key 被禁用到指定时间，实际是 %d", provider.Keys[0].DisabledUntil)
	}
}
