package adminapi

import (
	"errors"
	"os"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/stats"
)

var ErrCacheServiceUnavailable = errors.New("cache service unavailable")

type ProviderService struct {
	cfg   *config.Config
	stats *stats.Manager
	cache *cache.Store
}

func NewProviderService(cfg *config.Config, statsManager *stats.Manager, cacheStore *cache.Store) *ProviderService {
	return &ProviderService{
		cfg:   cfg,
		stats: statsManager,
		cache: cacheStore,
	}
}

func (service *ProviderService) ListSnapshots() []AdminProviderSnapshot {
	return buildAdminProviderSnapshots(service.cfg.Providers())
}

func (service *ProviderService) SaveProvider(provider config.Provider) (AdminProviderSnapshot, bool, error) {
	existingProvider, _ := service.cfg.Provider(provider.Name)
	created := existingProvider == nil
	if err := service.cfg.UpdateProviderSettings(provider); err != nil {
		return AdminProviderSnapshot{}, false, err
	}

	savedProvider, _ := service.cfg.Provider(provider.Name)
	if savedProvider == nil {
		return AdminProviderSnapshot{}, created, os.ErrNotExist
	}
	logAdminAudit("provider_save",
		"provider", savedProvider.Name,
		"provider_type", savedProvider.Type,
		"created", created,
		"cache_enabled", savedProvider.CacheEnabled,
		"cache_max_entries", savedProvider.CacheMaxEntries,
		"key_strategy", savedProvider.KeyStrategy,
	)
	return buildAdminProviderSnapshot(*savedProvider), created, nil
}

func (service *ProviderService) GetSnapshot(providerName string) (AdminProviderSnapshot, error) {
	provider, _ := service.cfg.Provider(providerName)
	if provider == nil {
		return AdminProviderSnapshot{}, os.ErrNotExist
	}
	return buildAdminProviderSnapshot(*provider), nil
}

func (service *ProviderService) GetKeySnapshots(providerName string) ([]AdminKeySnapshot, error) {
	providerSnapshot, err := service.GetSnapshot(providerName)
	if err != nil {
		return nil, err
	}
	return providerSnapshot.Keys, nil
}

func (service *ProviderService) AddKeys(providerName string, keys []string) ([]AdminKeySnapshot, error) {
	if err := service.cfg.AddKeys(providerName, keys); err != nil {
		return nil, err
	}
	logAdminAudit("provider_keys_import",
		"provider", providerName,
		"key_count", len(keys),
	)
	return service.GetKeySnapshots(providerName)
}

func (service *ProviderService) DeleteKey(providerName string, identifier string) error {
	keyValue := service.ResolveKeyIdentifier(providerName, identifier)
	if keyValue == "" {
		return os.ErrNotExist
	}
	return service.cfg.DeleteKey(providerName, keyValue)
}

func (service *ProviderService) ClearProviderCache(providerName string) error {
	if provider, _ := service.cfg.Provider(providerName); provider == nil {
		return os.ErrNotExist
	}
	if service.cache == nil {
		return ErrCacheServiceUnavailable
	}
	if err := service.cache.ClearProvider(providerName); err != nil {
		return err
	}
	logAdminAudit("provider_cache_clear", "provider", providerName)
	return nil
}

func (service *ProviderService) DeleteProvider(providerName string) error {
	if provider, _ := service.cfg.Provider(providerName); provider == nil {
		return os.ErrNotExist
	}
	if service.cache != nil {
		if err := service.cache.ClearProvider(providerName); err != nil {
			return err
		}
	}
	if err := service.cfg.DeleteProvider(providerName); err != nil {
		return err
	}
	if service.stats != nil {
		service.stats.RemoveProvider(providerName)
	}
	logAdminAudit("provider_delete", "provider", providerName)
	return nil
}

func (service *ProviderService) ResolveKeyIdentifiers(providerName string, identifiers []string) []string {
	provider, _ := service.cfg.Provider(providerName)
	if provider == nil {
		return identifiers
	}

	resolvedValues := make([]string, 0, len(identifiers))
	seenValues := make(map[string]struct{}, len(identifiers))
	for _, identifier := range identifiers {
		resolvedValue := service.ResolveKeyIdentifier(providerName, identifier)
		if resolvedValue == "" {
			continue
		}
		if _, exists := seenValues[resolvedValue]; exists {
			continue
		}
		seenValues[resolvedValue] = struct{}{}
		resolvedValues = append(resolvedValues, resolvedValue)
	}
	return resolvedValues
}

func (service *ProviderService) ResolveKeyIdentifier(providerName string, identifier string) string {
	provider, _ := service.cfg.Provider(providerName)
	if provider == nil {
		return ""
	}
	for _, key := range provider.Keys {
		if key.Value == identifier || buildSecretRef(key.Value) == identifier {
			return key.Value
		}
	}
	return ""
}
