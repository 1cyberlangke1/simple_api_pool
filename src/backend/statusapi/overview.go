package statusapi

import (
	"simple-api-pool/config"
	"simple-api-pool/service"
	"simple-api-pool/stats"
)

type ServiceHealthSnapshot = service.HealthSnapshot
type StatusOverviewResponse = service.StatusOverview

func newStatusOverviewResponse(cfg *config.Config, statsManager *stats.Manager) StatusOverviewResponse {
	return service.NewOverviewService(cfg, statsManager).StatusOverview()
}

func CollectProviderStatusSnapshots(cfg *config.Config, statsManager *stats.Manager) map[string]Snapshot {
	return service.NewOverviewService(cfg, statsManager).ProviderStatusSnapshots()
}
