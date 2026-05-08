package adminapi

import (
	"simple-api-pool/applog"
	"simple-api-pool/config"
	"simple-api-pool/stats"
	"simple-api-pool/statusapi"
)

const adminRecentLogLimit = 80

type GlobalConfigSnapshot struct {
	AdminKeyConfigured     bool `json:"admin_key_configured"`
	TokenEstimationEnabled bool `json:"token_estimation_enabled"`
	ClientKeyCount         int  `json:"client_key_count"`
}

type AdminOverviewResponse struct {
	Health        statusapi.ServiceHealthSnapshot `json:"health"`
	GlobalConfig  GlobalConfigSnapshot            `json:"global_config"`
	Providers     []AdminProviderSnapshot         `json:"providers"`
	ProviderStats map[string]statusapi.Snapshot   `json:"provider_stats"`
	RecentLogs    []applog.Entry                  `json:"recent_logs"`
}

func newAdminOverviewResponse(cfg *config.Config, statsManager *stats.Manager) AdminOverviewResponse {
	globalConfig := cfg.AdminSettings()
	return AdminOverviewResponse{
		Health: statusapi.ServiceHealthSnapshot{Status: "ok"},
		GlobalConfig: GlobalConfigSnapshot{
			AdminKeyConfigured:     globalConfig.AdminKey != "",
			TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
			ClientKeyCount:         len(globalConfig.ClientKeys),
		},
		Providers:     buildAdminProviderSnapshots(cfg.Providers()),
		ProviderStats: statusapi.CollectProviderStatusSnapshots(cfg, statsManager),
		RecentLogs:    applog.RecentEntries(adminRecentLogLimit),
	}
}
