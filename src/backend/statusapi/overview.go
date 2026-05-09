package statusapi

import (
	"time"

	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type ServiceHealthSnapshot struct {
	Status string `json:"status"`
}

type StatusOverviewResponse struct {
	Health        ServiceHealthSnapshot `json:"health"`
	ProviderStats map[string]Snapshot   `json:"provider_stats"`
}

func newStatusOverviewResponse(cfg *config.Config, statsManager *stats.Manager) StatusOverviewResponse {
	return StatusOverviewResponse{
		Health:        newServiceHealthSnapshot(),
		ProviderStats: CollectProviderStatusSnapshots(cfg, statsManager),
	}
}

func newServiceHealthSnapshot() ServiceHealthSnapshot {
	return ServiceHealthSnapshot{Status: "ok"}
}

func CollectProviderStatusSnapshots(cfg *config.Config, statsManager *stats.Manager) map[string]Snapshot {
	providerStats := make(map[string]Snapshot)
	for providerName, statSnapshot := range statsManager.Snapshot() {
		providerStats[providerName] = Snapshot{
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
