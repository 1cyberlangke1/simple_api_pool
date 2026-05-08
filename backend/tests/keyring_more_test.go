package tests

import (
	"errors"
	"testing"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/store"
)

func TestRoundRobinSwitchesBetweenAvailableKeys(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name:        "openai",
		Type:        config.OpenAIChat,
		KeyStrategy: "round_robin",
		Keys: []config.Key{
			{Value: "k1"},
			{Value: "k2"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	kr := keyring.New(cfg)
	first, _ := kr.GetKey("openai")
	second, _ := kr.GetKey("openai")
	third, _ := kr.GetKey("openai")

	if first != "k1" || second != "k2" || third != "k1" {
		t.Fatalf("期望轮询顺序为 k1 -> k2 -> k1，实际是 %q -> %q -> %q", first, second, third)
	}
}

func TestGetKeyReturnsEmptyForMissingProviderOrUnavailableKeys(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	kr := keyring.New(cfg)

	got, err := kr.GetKey("missing")
	if !errors.Is(err, keyring.ErrProviderNotFound) {
		t.Fatalf("读取不存在提供商时期望返回 ErrProviderNotFound，实际是 %v", err)
	}
	if got != "" {
		t.Fatalf("期望不存在提供商返回空字符串，实际是 %q", got)
	}

	if err := cfg.SaveProvider(config.Provider{
		Name: "empty",
		Type: config.OpenAIChat,
	}); err != nil {
		t.Fatalf("保存空密钥提供商失败: %v", err)
	}
	got, err = kr.GetKey("empty")
	if !errors.Is(err, keyring.ErrNoKeysConfigured) {
		t.Fatalf("未配置密钥时期望返回 ErrNoKeysConfigured，实际是 %v", err)
	}
	if got != "" {
		t.Fatalf("期望未配置密钥时返回空字符串，实际是 %q", got)
	}

	if err := cfg.SaveProvider(config.Provider{
		Name: "claude",
		Type: config.Claude,
		Keys: []config.Key{
			{Value: "disabled", DisabledUntil: time.Now().Add(time.Hour).Unix()},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	got, err = kr.GetKey("claude")
	if !errors.Is(err, keyring.ErrAllKeysExhausted) {
		t.Fatalf("没有可用密钥时期望返回 ErrAllKeysExhausted，实际是 %v", err)
	}
	if got != "" {
		t.Fatalf("期望没有可用密钥时返回空字符串，实际是 %q", got)
	}
}

func TestRecordSuccessResetsFailureCountAndDisabledUntil(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name: "gemini",
		Type: config.Gemini,
		Keys: []config.Key{
			{Value: "k1", DisabledUntil: 99999, ConsecutiveFails: 4},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	kr := keyring.New(cfg)
	kr.RecordSuccess("gemini", "k1")

	provider, _ := cfg.Provider("gemini")
	if provider.Keys[0].DisabledUntil != 0 || provider.Keys[0].ConsecutiveFails != 0 {
		t.Fatalf("期望成功后清空失败状态，实际是 %+v", provider.Keys[0])
	}
}

func TestFailureBackoffGrowsExponentiallyAndRespectsMaxDuration(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))
	if err := cfg.SaveProvider(config.Provider{
		Name:           "responses",
		Type:           config.OpenAIResponses,
		FailThreshold:  1,
		MinDisableSecs: 5,
		MaxDisableSecs: 9,
		Keys: []config.Key{
			{Value: "k1"},
		},
	}); err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	kr := keyring.New(cfg)
	kr.RecordFailure("responses", "k1")
	firstProvider, _ := cfg.Provider("responses")
	firstDelay := firstProvider.Keys[0].DisabledUntil - time.Now().Unix()
	if firstDelay < 5 || firstDelay > 9 {
		t.Fatalf("期望第一次禁用时长在 5 到 9 之间，实际是 %d", firstDelay)
	}

	time.Sleep(1100 * time.Millisecond)
	kr.RecordFailure("responses", "k1")
	secondProvider, _ := cfg.Provider("responses")
	secondDelay := secondProvider.Keys[0].DisabledUntil - time.Now().Unix()
	if secondDelay < 8 || secondDelay > 9 {
		t.Fatalf("期望第二次禁用时长被限制在接近 9 秒，实际是 %d", secondDelay)
	}
}
