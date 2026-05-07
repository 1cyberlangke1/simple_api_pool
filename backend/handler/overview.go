package handler

import (
	"time"

	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/stats"
)

const adminRecentLogLimit = 80

type ServiceHealthSnapshot struct {
	Status string `json:"status"`
}

type StatusOverviewResponse struct {
	Health        ServiceHealthSnapshot     `json:"health"`
	ProviderStats map[string]StatusSnapshot `json:"provider_stats"`
}

type GlobalConfigSnapshot struct {
	AdminKeyConfigured     bool `json:"admin_key_configured"`
	TokenEstimationEnabled bool `json:"token_estimation_enabled"`
	ClientKeyCount         int  `json:"client_key_count"`
}

type AdminOverviewResponse struct {
	Health        ServiceHealthSnapshot     `json:"health"`
	GlobalConfig  GlobalConfigSnapshot      `json:"global_config"`
	Providers     []AdminProviderSnapshot   `json:"providers"`
	ProviderStats map[string]StatusSnapshot `json:"provider_stats"`
	RecentLogs    []applog.Entry            `json:"recent_logs"`
}

func newStatusOverviewResponse(cfg *config.Config, statsManager *stats.Manager) StatusOverviewResponse {
	return StatusOverviewResponse{
		Health:        newServiceHealthSnapshot(),
		ProviderStats: collectProviderStatusSnapshots(cfg, statsManager),
	}
}

func newAdminOverviewResponse(cfg *config.Config, statsManager *stats.Manager) AdminOverviewResponse {
	globalConfig := cfg.GlobalConfig()
	return AdminOverviewResponse{
		Health: newServiceHealthSnapshot(),
		GlobalConfig: GlobalConfigSnapshot{
			AdminKeyConfigured:     globalConfig.AdminKey != "",
			TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
			ClientKeyCount:         len(globalConfig.ClientKeys),
		},
		Providers:     buildAdminProviderSnapshots(cfg.Providers()),
		ProviderStats: collectProviderStatusSnapshots(cfg, statsManager),
		RecentLogs:    applog.RecentEntries(adminRecentLogLimit),
	}
}

func newServiceHealthSnapshot() ServiceHealthSnapshot {
	return ServiceHealthSnapshot{Status: "ok"}
}

func collectProviderStatusSnapshots(cfg *config.Config, statsManager *stats.Manager) map[string]StatusSnapshot {
	providerStats := make(map[string]StatusSnapshot)
	for providerName, statSnapshot := range statsManager.Snapshot() {
		providerStats[providerName] = StatusSnapshot{
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
	for _, provider := range cfg.Providers() {
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
