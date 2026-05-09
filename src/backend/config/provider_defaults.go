package config

import "os"

func normalizeProviderForPersistence(provider Provider) (Provider, error) {
	if ReservedNames[provider.Name] {
		return Provider{}, os.ErrInvalid
	}
	if provider.BaseURL == "" {
		provider.BaseURL = DefaultBaseURL(provider.Type)
	}

	normalizedBaseURL, err := normalizeProviderBaseURL(provider.BaseURL)
	if err != nil {
		return Provider{}, err
	}
	provider.BaseURL = normalizedBaseURL

	applyProviderDefaults(&provider)
	return provider, nil
}

func applyProviderDefaults(provider *Provider) {
	if provider == nil {
		return
	}
	if provider.KeyStrategy == "" {
		provider.KeyStrategy = "round_robin"
	}
	if provider.FailThreshold == 0 {
		provider.FailThreshold = 3
	}
	if provider.MinDisableSecs == 0 {
		provider.MinDisableSecs = 30
	}
	if provider.MaxDisableSecs == 0 {
		provider.MaxDisableSecs = 43200
	}
	if provider.CacheMaxEntries == 0 {
		provider.CacheMaxEntries = 1000
	}
	if provider.Keys == nil {
		provider.Keys = make([]Key, 0)
	}
}
