package adminapi

import (
	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/domain"
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

type AdminGroupEntrySnapshot struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
	Weight   int    `json:"weight"`
	Priority int    `json:"priority"`
}

type AdminGroupCollectionSnapshot struct {
	Name     string                    `json:"name"`
	Strategy string                    `json:"strategy"`
	Entries  []AdminGroupEntrySnapshot `json:"entries"`
}

type AdminGroupSnapshot struct {
	Name            string                         `json:"name"`
	Type            config.ProviderType            `json:"type"`
	CacheEnabled    bool                           `json:"cache_enabled"`
	CacheMaxEntries int                            `json:"cache_max_entries"`
	Collections     []AdminGroupCollectionSnapshot `json:"collections"`
}

func buildAdminProviderSnapshots(providers []config.Provider) []AdminProviderSnapshot {
	snapshots := make([]AdminProviderSnapshot, 0, len(providers))
	for _, provider := range providers {
		snapshots = append(snapshots, buildAdminProviderSnapshot(provider))
	}
	return snapshots
}

func buildAdminGroupSnapshots(groups []config.Group) []AdminGroupSnapshot {
	snapshots := make([]AdminGroupSnapshot, 0, len(groups))
	for _, group := range groups {
		snapshots = append(snapshots, buildAdminGroupSnapshot(group))
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

func buildAdminGroupSnapshot(group config.Group) AdminGroupSnapshot {
	collectionSnapshots := make([]AdminGroupCollectionSnapshot, 0, len(group.Collections))
	for _, collection := range group.Collections {
		entrySnapshots := make([]AdminGroupEntrySnapshot, 0, len(collection.Entries))
		for _, entry := range collection.Entries {
			entrySnapshots = append(entrySnapshots, AdminGroupEntrySnapshot{
				Provider: entry.Provider,
				Model:    entry.Model,
				BaseURL:  entry.BaseURL,
				Weight:   entry.Weight,
				Priority: entry.Priority,
			})
		}
		collectionSnapshots = append(collectionSnapshots, AdminGroupCollectionSnapshot{
			Name:     collection.Name,
			Strategy: collection.Strategy,
			Entries:  entrySnapshots,
		})
	}

	return AdminGroupSnapshot{
		Name:            group.Name,
		Type:            group.Type,
		CacheEnabled:    group.CacheEnabled,
		CacheMaxEntries: group.CacheMaxEntries,
		Collections:     collectionSnapshots,
	}
}

func buildAdminKeySnapshot(key config.Key) AdminKeySnapshot {
	return AdminKeySnapshot{
		Ref:              domain.BuildSecretRef(key.Value),
		Value:            applog.MaskSecret(key.Value),
		DisabledUntil:    key.DisabledUntil,
		ConsecutiveFails: key.ConsecutiveFails,
	}
}
