package tests

import (
	"testing"
	"time"

	"simple-api-pool/domain"
)

func TestNormalizeProviderSettingsAppliesDefaults(t *testing.T) {
	settings, err := domain.NormalizeProviderSettings(domain.ProviderSettings{
		Name:         "openai",
		ProviderType: "openai_chat",
	})
	if err != nil {
		t.Fatalf("规范化提供商设置失败: %v", err)
	}

	if settings.BaseURL != "https://api.openai.com" {
		t.Fatalf("期望默认 BaseURL 为 OpenAI 官方地址，实际是 %q", settings.BaseURL)
	}
	if settings.KeyStrategy != "round_robin" {
		t.Fatalf("期望默认 key 策略为 round_robin，实际是 %q", settings.KeyStrategy)
	}
	if settings.FailThreshold != 3 || settings.MinDisableSecs != 30 || settings.MaxDisableSecs != 43200 {
		t.Fatalf("期望默认失败策略为 3/30/43200，实际是 %+v", settings)
	}
	if settings.CacheMaxEntries != 1000 {
		t.Fatalf("期望默认缓存条目数为 1000，实际是 %d", settings.CacheMaxEntries)
	}
}

func TestNormalizeProviderSettingsRejectsReservedName(t *testing.T) {
	_, err := domain.NormalizeProviderSettings(domain.ProviderSettings{
		Name:         "admin",
		ProviderType: "openai_chat",
		BaseURL:      "https://api.openai.com",
	})
	if err == nil {
		t.Fatal("期望保留名称被拒绝")
	}
}

func TestNextFailureStateUsesExponentialBackoff(t *testing.T) {
	nowUnix := time.Now().Unix()

	first := domain.NextFailureState(nowUnix, 0, domain.DisablePolicy{
		FailThreshold:  2,
		MinDisableSecs: 10,
		MaxDisableSecs: 30,
	})
	if first.ConsecutiveFails != 1 || first.DisabledUntil != 0 {
		t.Fatalf("期望第一次失败仅累计次数，实际是 %+v", first)
	}

	second := domain.NextFailureState(nowUnix, 1, domain.DisablePolicy{
		FailThreshold:  2,
		MinDisableSecs: 10,
		MaxDisableSecs: 30,
	})
	if second.ConsecutiveFails != 2 {
		t.Fatalf("期望第二次失败累计到 2，实际是 %d", second.ConsecutiveFails)
	}
	if second.DisabledUntil != nowUnix+10 {
		t.Fatalf("期望第二次失败禁用 10 秒，实际是 %d", second.DisabledUntil-nowUnix)
	}

	third := domain.NextFailureState(nowUnix, 2, domain.DisablePolicy{
		FailThreshold:  2,
		MinDisableSecs: 10,
		MaxDisableSecs: 30,
	})
	if third.DisabledUntil != nowUnix+20 {
		t.Fatalf("期望第三次失败禁用 20 秒，实际是 %d", third.DisabledUntil-nowUnix)
	}

	fourth := domain.NextFailureState(nowUnix, 3, domain.DisablePolicy{
		FailThreshold:  2,
		MinDisableSecs: 10,
		MaxDisableSecs: 30,
	})
	if fourth.DisabledUntil != nowUnix+30 {
		t.Fatalf("期望第四次失败命中最大禁用 30 秒，实际是 %d", fourth.DisabledUntil-nowUnix)
	}
}
