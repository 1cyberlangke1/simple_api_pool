package adminapi

import (
	"simple-api-pool/cache"
	"simple-api-pool/config"
	svc "simple-api-pool/service"
	"simple-api-pool/stats"
)

var ErrCacheServiceUnavailable = svc.ErrCacheServiceUnavailable

type ProviderService struct {
	service *svc.ProviderMutationService
}

func NewProviderService(cfg *config.Config, statsManager *stats.Manager, cacheStore *cache.Store) *ProviderService {
	return &ProviderService{
		service: svc.NewProviderMutationService(cfg, statsManager, cacheStore),
	}
}

func (service *ProviderService) ListSnapshots() []AdminProviderSnapshot {
	return buildAdminProviderSnapshots(service.service.Providers())
}

func (service *ProviderService) SaveProvider(provider config.Provider) (AdminProviderSnapshot, bool, error) {
	savedProvider, created, err := service.service.SaveProvider(provider)
	if err != nil {
		return AdminProviderSnapshot{}, false, err
	}
	logAdminAudit("provider_save",
		"provider", savedProvider.Name,
		"provider_type", savedProvider.Type,
		"created", created,
		"cache_enabled", savedProvider.CacheEnabled,
		"cache_max_entries", savedProvider.CacheMaxEntries,
		"key_strategy", savedProvider.KeyStrategy,
	)
	return buildAdminProviderSnapshot(savedProvider), created, nil
}

func (service *ProviderService) GetSnapshot(providerName string) (AdminProviderSnapshot, error) {
	provider, err := service.service.Provider(providerName)
	if err != nil {
		return AdminProviderSnapshot{}, err
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
	if _, err := service.service.AddKeys(providerName, keys); err != nil {
		return nil, err
	}
	logAdminAudit("provider_keys_import",
		"provider", providerName,
		"key_count", len(keys),
	)
	return service.GetKeySnapshots(providerName)
}

func (service *ProviderService) DeleteKey(providerName string, identifier string) error {
	return service.service.DeleteKey(providerName, identifier)
}

func (service *ProviderService) GetKeyValue(providerName string, identifier string) (string, error) {
	return service.service.GetKeyValue(providerName, identifier)
}

func (service *ProviderService) UpdateKeyValue(providerName string, identifier string, nextValue string) error {
	if err := service.service.UpdateKeyValue(providerName, identifier, nextValue); err != nil {
		return err
	}
	logAdminAudit("provider_key_update",
		"provider", providerName,
		"key_ref", identifier,
	)
	return nil
}

func (service *ProviderService) ClearProviderCache(providerName string) error {
	if err := service.service.ClearProviderCache(providerName); err != nil {
		return err
	}
	logAdminAudit("provider_cache_clear", "provider", providerName)
	return nil
}

func (service *ProviderService) DeleteProvider(providerName string) error {
	if err := service.service.DeleteProvider(providerName); err != nil {
		return err
	}
	logAdminAudit("provider_delete", "provider", providerName)
	return nil
}

func (service *ProviderService) ResolveKeyIdentifiers(providerName string, identifiers []string) []string {
	return service.service.ResolveKeyIdentifiers(providerName, identifiers)
}

func (service *ProviderService) ResolveKeyIdentifier(providerName string, identifier string) string {
	return service.service.ResolveKeyIdentifier(providerName, identifier)
}
