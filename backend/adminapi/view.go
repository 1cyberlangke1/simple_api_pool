package adminapi

import (
	"crypto/sha256"
	"encoding/hex"

	"simple-api-pool/config"
)

type AdminKeySnapshot struct {
	Ref              string `json:"ref"`
	Value            string `json:"value"`
	DisabledUntil    int64  `json:"disabled_until"`
	ConsecutiveFails int    `json:"consecutive_fails"`
}

type AdminProviderSnapshot struct {
	Name            string              `json:"name"`
	Type            config.ProviderType `json:"type"`
	BaseURL         string              `json:"base_url"`
	Keys            []AdminKeySnapshot  `json:"keys"`
	CacheEnabled    bool                `json:"cache_enabled"`
	CacheMaxEntries int                 `json:"cache_max_entries"`
	KeyStrategy     string              `json:"key_strategy"`
	FailThreshold   int                 `json:"fail_threshold"`
	MinDisableSecs  int                 `json:"min_disable_secs"`
	MaxDisableSecs  int                 `json:"max_disable_secs"`
}

func buildAdminProviderSnapshots(providers []config.Provider) []AdminProviderSnapshot {
	snapshots := make([]AdminProviderSnapshot, 0, len(providers))
	for _, provider := range providers {
		snapshots = append(snapshots, buildAdminProviderSnapshot(provider))
	}
	return snapshots
}

func buildAdminProviderSnapshot(provider config.Provider) AdminProviderSnapshot {
	keySnapshots := make([]AdminKeySnapshot, 0, len(provider.Keys))
	for _, key := range provider.Keys {
		keySnapshots = append(keySnapshots, buildAdminKeySnapshot(key))
	}

	return AdminProviderSnapshot{
		Name:            provider.Name,
		Type:            provider.Type,
		BaseURL:         provider.BaseURL,
		Keys:            keySnapshots,
		CacheEnabled:    provider.CacheEnabled,
		CacheMaxEntries: provider.CacheMaxEntries,
		KeyStrategy:     provider.KeyStrategy,
		FailThreshold:   provider.FailThreshold,
		MinDisableSecs:  provider.MinDisableSecs,
		MaxDisableSecs:  provider.MaxDisableSecs,
	}
}

func buildAdminKeySnapshot(key config.Key) AdminKeySnapshot {
	return AdminKeySnapshot{
		Ref:              buildSecretRef(key.Value),
		Value:            maskSecretValue(key.Value),
		DisabledUntil:    key.DisabledUntil,
		ConsecutiveFails: key.ConsecutiveFails,
	}
}

func buildSecretRef(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:8])
}

func maskSecretValue(secret string) string {
	if secret == "" {
		return ""
	}
	if len(secret) <= 4 {
		return "****"
	}
	return "****" + secret[len(secret)-4:]
}
