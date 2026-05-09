package config

import "simple-api-pool/domain"

func normalizeProviderForPersistence(provider Provider) (Provider, error) {
	normalizedSettings, err := domain.NormalizeProviderSettings(domain.ProviderSettings{
		Name:            provider.Name,
		ProviderType:    string(provider.Type),
		BaseURL:         provider.BaseURL,
		KeyStrategy:     provider.KeyStrategy,
		FailThreshold:   provider.FailThreshold,
		MinDisableSecs:  provider.MinDisableSecs,
		MaxDisableSecs:  provider.MaxDisableSecs,
		CacheMaxEntries: provider.CacheMaxEntries,
	})
	if err != nil {
		return Provider{}, err
	}
	provider.BaseURL = normalizedSettings.BaseURL
	provider.KeyStrategy = normalizedSettings.KeyStrategy
	provider.FailThreshold = normalizedSettings.FailThreshold
	provider.MinDisableSecs = normalizedSettings.MinDisableSecs
	provider.MaxDisableSecs = normalizedSettings.MaxDisableSecs
	provider.CacheMaxEntries = normalizedSettings.CacheMaxEntries
	if provider.Keys == nil {
		provider.Keys = make([]Key, 0)
	}
	return provider, nil
}
