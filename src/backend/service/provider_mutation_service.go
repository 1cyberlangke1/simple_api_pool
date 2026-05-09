package service

import (
	"errors"
	"os"

	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/domain"
	"simple-api-pool/stats"
)

var ErrCacheServiceUnavailable = errors.New("cache service unavailable")

type ProviderMutationService struct {
	cfg   *config.Config
	stats *stats.Manager
	cache *cache.Store
}

func NewProviderMutationService(cfg *config.Config, statsManager *stats.Manager, cacheStore *cache.Store) *ProviderMutationService {
	return &ProviderMutationService{
		cfg:   cfg,
		stats: statsManager,
		cache: cacheStore,
	}
}

func (service *ProviderMutationService) Providers() []config.Provider {
	return service.cfg.Providers()
}

func (service *ProviderMutationService) Provider(providerName string) (*config.Provider, error) {
	provider, _ := service.cfg.Provider(providerName)
	if provider == nil {
		return nil, os.ErrNotExist
	}
	return provider, nil
}

func (service *ProviderMutationService) SaveProvider(provider config.Provider) (config.Provider, bool, error) {
	existingProvider, _ := service.cfg.Provider(provider.Name)
	created := existingProvider == nil
	if err := service.cfg.UpdateProviderSettings(provider); err != nil {
		return config.Provider{}, false, err
	}

	savedProvider, _ := service.cfg.Provider(provider.Name)
	if savedProvider == nil {
		return config.Provider{}, created, os.ErrNotExist
	}
	return *savedProvider, created, nil
}

func (service *ProviderMutationService) AddKeys(providerName string, keys []string) (*config.Provider, error) {
	if err := service.cfg.AddKeys(providerName, keys); err != nil {
		return nil, err
	}
	return service.Provider(providerName)
}

func (service *ProviderMutationService) DeleteKey(providerName, identifier string) error {
	keyValue := service.ResolveKeyIdentifier(providerName, identifier)
	if keyValue == "" {
		return os.ErrNotExist
	}
	return service.cfg.DeleteKey(providerName, keyValue)
}

func (service *ProviderMutationService) ClearProviderCache(providerName string) error {
	if provider, _ := service.cfg.Provider(providerName); provider == nil {
		return os.ErrNotExist
	}
	if service.cache == nil {
		return ErrCacheServiceUnavailable
	}
	return service.cache.ClearProvider(providerName)
}

func (service *ProviderMutationService) DeleteProvider(providerName string) error {
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
	return nil
}

func (service *ProviderMutationService) ResolveKeyIdentifiers(providerName string, identifiers []string) []string {
	provider, _ := service.cfg.Provider(providerName)
	if provider == nil {
		return identifiers
	}
	return domain.ResolveKeyIdentifiers(extractKeyValues(provider.Keys), identifiers)
}

func (service *ProviderMutationService) ResolveKeyIdentifier(providerName, identifier string) string {
	provider, _ := service.cfg.Provider(providerName)
	if provider == nil {
		return ""
	}
	return domain.ResolveKeyIdentifier(extractKeyValues(provider.Keys), identifier)
}

func extractKeyValues(keys []config.Key) []string {
	values := make([]string, 0, len(keys))
	for _, key := range keys {
		values = append(values, key.Value)
	}
	return values
}
