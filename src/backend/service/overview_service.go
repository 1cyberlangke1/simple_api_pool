package service

import (
	"time"

	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type HealthSnapshot struct {
	Status string `json:"status"`
}

type ProviderStatusSnapshot struct {
	SuccessCount  int64            `json:"success_count"`
	ErrorCount    int64            `json:"error_count"`
	InputTokens   int64            `json:"input_tokens"`
	OutputTokens  int64            `json:"output_tokens"`
	CacheTokens   int64            `json:"cache_tokens"`
	CacheHits     int64            `json:"cache_hits"`
	ErrorTypes    map[string]int64 `json:"error_types,omitempty"`
	AvailableKeys int64            `json:"available_keys"`
	TotalKeys     int64            `json:"total_keys"`
}

type GlobalConfigSnapshot struct {
	AdminKeyConfigured     bool `json:"admin_key_configured"`
	TokenEstimationEnabled bool `json:"token_estimation_enabled"`
	ClientKeyCount         int  `json:"client_key_count"`
}

type StatusOverview struct {
	Health        HealthSnapshot                    `json:"health"`
	ProviderTypes map[string]string                 `json:"provider_types"`
	ProviderStats map[string]ProviderStatusSnapshot `json:"provider_stats"`
}

type AdminOverview struct {
	Health        HealthSnapshot                    `json:"health"`
	GlobalConfig  GlobalConfigSnapshot              `json:"global_config"`
	ProviderStats map[string]ProviderStatusSnapshot `json:"provider_stats"`
}

type OverviewService struct {
	cfg   *config.Config
	stats *stats.Manager
}

func NewOverviewService(cfg *config.Config, statsManager *stats.Manager) *OverviewService {
	return &OverviewService{
		cfg:   cfg,
		stats: statsManager,
	}
}

func (service *OverviewService) StatusOverview() StatusOverview {
	return StatusOverview{
		Health:        HealthSnapshot{Status: "ok"},
		ProviderTypes: service.ProviderTypeSnapshots(),
		ProviderStats: service.ProviderStatusSnapshots(),
	}
}

func (service *OverviewService) AdminOverview() AdminOverview {
	globalConfig := service.cfg.AdminSettings()
	return AdminOverview{
		Health: HealthSnapshot{Status: "ok"},
		GlobalConfig: GlobalConfigSnapshot{
			AdminKeyConfigured:     globalConfig.AdminKey != "",
			TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
			ClientKeyCount:         len(globalConfig.ClientKeys),
		},
		ProviderStats: service.ProviderStatusSnapshots(),
	}
}

func (service *OverviewService) ProviderStatusSnapshots() map[string]ProviderStatusSnapshot {
	providerStats := make(map[string]ProviderStatusSnapshot)
	for providerName, statSnapshot := range service.stats.Snapshot() {
		providerStats[providerName] = ProviderStatusSnapshot{
			SuccessCount: statSnapshot.SuccessCount,
			ErrorCount:   statSnapshot.ErrorCount,
			InputTokens:  statSnapshot.InputTokens,
			OutputTokens: statSnapshot.OutputTokens,
			CacheTokens:  statSnapshot.CacheTokens,
			CacheHits:    statSnapshot.CacheHits,
			ErrorTypes:   statSnapshot.ErrorTypes,
		}
	}

	now := time.Now().Unix()
	for _, provider := range service.cfg.Providers() {
		entry := providerStats[provider.Name]
		entry.TotalKeys = int64(len(provider.Keys))
		for _, key := range provider.Keys {
			if key.DisabledUntil > now {
				continue
			}
			entry.AvailableKeys++
		}
		providerStats[provider.Name] = entry
	}

	return providerStats
}

func (service *OverviewService) ProviderStatusSnapshot(providerName string) (ProviderStatusSnapshot, bool) {
	providerStats := service.ProviderStatusSnapshots()
	snapshot, exists := providerStats[providerName]
	return snapshot, exists
}

func (service *OverviewService) ProviderTypeSnapshots() map[string]string {
	providerTypes := make(map[string]string)
	for _, provider := range service.cfg.Providers() {
		providerTypes[provider.Name] = string(provider.Type)
	}
	return providerTypes
}
