package adminapi

import (
	"simple-api-pool/config"
	"simple-api-pool/service"
	"simple-api-pool/stats"
	"simple-api-pool/statusapi"
)

type GlobalConfigSnapshot struct {
	AdminKeyConfigured     bool `json:"admin_key_configured"`
	TokenEstimationEnabled bool `json:"token_estimation_enabled"`
	ClientKeyCount         int  `json:"client_key_count"`
}

type AdminOverviewResponse struct {
	Health        statusapi.ServiceHealthSnapshot `json:"health"`
	GlobalConfig  GlobalConfigSnapshot            `json:"global_config"`
	Providers     []AdminProviderSnapshot         `json:"providers"`
	Groups        []AdminGroupSnapshot            `json:"groups"`
	ProviderStats map[string]statusapi.Snapshot   `json:"provider_stats"`
}

func newAdminOverviewResponse(cfg *config.Config, statsManager *stats.Manager) AdminOverviewResponse {
	overview := service.NewOverviewService(cfg, statsManager).AdminOverview()
	return AdminOverviewResponse{
		Health: statusapi.ServiceHealthSnapshot{Status: overview.Health.Status},
		GlobalConfig: GlobalConfigSnapshot{
			AdminKeyConfigured:     overview.GlobalConfig.AdminKeyConfigured,
			TokenEstimationEnabled: overview.GlobalConfig.TokenEstimationEnabled,
			ClientKeyCount:         overview.GlobalConfig.ClientKeyCount,
		},
		Providers:     buildAdminProviderSnapshots(cfg.Providers()),
		Groups:        buildAdminGroupSnapshots(cfg.Groups()),
		ProviderStats: overview.ProviderStats,
	}
}
