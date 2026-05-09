package tests

import (
	"testing"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/store"
)

func TestFillStrategySkipsDisabledKeys(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name:        "openai",
		Type:        config.OpenAIChat,
		KeyStrategy: "fill",
		Keys: []config.Key{
			{Value: "disabled", DisabledUntil: time.Now().Add(time.Hour).Unix()},
			{Value: "active"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	kr := keyring.New(cfg)
	got, err := kr.GetKey("openai")
	if err != nil {
		t.Fatalf("获取密钥失败: %v", err)
	}
	if got != "active" {
		t.Fatalf("期望拿到 active，实际是 %q", got)
	}
}

func TestKeyIsDisabledAfterFailureThreshold(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name:           "claude",
		Type:           config.Claude,
		FailThreshold:  2,
		MinDisableSecs: 10,
		MaxDisableSecs: 30,
		Keys: []config.Key{
			{Value: "k1"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	kr := keyring.New(cfg)
	kr.RecordFailure("claude", "k1")

	provider, _ := cfg.Provider("claude")
	if provider.Keys[0].ConsecutiveFails != 1 {
		t.Fatalf("期望失败次数为 1，实际是 %d", provider.Keys[0].ConsecutiveFails)
	}
	if provider.Keys[0].DisabledUntil != 0 {
		t.Fatalf("第一次失败后不应该禁用，实际 disabled_until=%d", provider.Keys[0].DisabledUntil)
	}

	before := time.Now().Unix()
	kr.RecordFailure("claude", "k1")
	after := time.Now().Unix()

	provider, _ = cfg.Provider("claude")
	if provider.Keys[0].ConsecutiveFails != 2 {
		t.Fatalf("期望失败次数为 2，实际是 %d", provider.Keys[0].ConsecutiveFails)
	}
	if provider.Keys[0].DisabledUntil < before+10 || provider.Keys[0].DisabledUntil > after+30 {
		t.Fatalf("期望禁用时间在 %d 到 %d 之间，实际是 %d", before+10, after+30, provider.Keys[0].DisabledUntil)
	}
}
