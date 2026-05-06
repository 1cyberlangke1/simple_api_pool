package tests

import (
	"errors"
	"os"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/store"
)

func TestSaveProviderAppliesDefaultValues(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))

	err := cfg.SaveProvider(config.Provider{
		Name: "openai",
		Type: config.OpenAIChat,
	})
	if err != nil {
		t.Fatalf("保存提供商失败: %v", err)
	}

	provider, _ := cfg.Provider("openai")
	if provider == nil {
		t.Fatal("期望提供商被保存")
	}
	if provider.BaseURL != config.DefaultBaseURL(config.OpenAIChat) {
		t.Fatalf("期望自动填充默认 BaseURL，实际是 %q", provider.BaseURL)
	}
	if provider.KeyStrategy != "round_robin" {
		t.Fatalf("期望默认轮询策略，实际是 %q", provider.KeyStrategy)
	}
	if provider.FailThreshold != 3 || provider.MinDisableSecs != 30 || provider.MaxDisableSecs != 3600 {
		t.Fatalf("期望默认失败配置生效，实际是 %+v", provider)
	}
}

func TestReservedNamesCannotBeProviderNames(t *testing.T) {
	cfg := config.New(store.New(t.TempDir()))

	err := cfg.SaveProvider(config.Provider{Name: "admin", Type: config.OpenAIChat})
	if !errors.Is(err, os.ErrInvalid) {
		t.Fatalf("期望返回 os.ErrInvalid，实际是 %v", err)
	}
}

func TestDefaultListenAddrIsNot8080(t *testing.T) {
	t.Setenv("PORT", "")

	got := config.ListenAddr()

	if got != ":18080" {
		t.Fatalf("期望默认监听地址为 :18080，实际是 %q", got)
	}
}

func TestPortEnvOverridesDefaultListenAddr(t *testing.T) {
	t.Setenv("PORT", "19090")

	got := config.ListenAddr()

	if got != ":19090" {
		t.Fatalf("期望监听地址为 :19090，实际是 %q", got)
	}
}
