package adminapi

import (
	"net/http"

	"simple-api-pool/applog"
	"simple-api-pool/httpapi"
	"simple-api-pool/realtime"
	"simple-api-pool/statusapi"
)

const adminBootstrapRecentLogLimit = 50

type BootstrapResponse struct {
	Version       uint64                          `json:"version"`
	StreamCursor  uint64                          `json:"stream_cursor"`
	Health        statusapi.ServiceHealthSnapshot `json:"health"`
	GlobalConfig  GlobalConfigDetailSnapshot      `json:"global_config"`
	Providers     []AdminProviderSnapshot         `json:"providers"`
	ProviderStats map[string]statusapi.Snapshot   `json:"provider_stats"`
	RecentLogs    []applog.Entry                  `json:"recent_logs"`
}

func (ah *Handler) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	overview := newAdminOverviewResponse(ah.cfg, ah.stats)
	cursor := realtime.LatestID()
	httpapi.WriteJSONResponse(w, http.StatusOK, BootstrapResponse{
		Version:       cursor,
		StreamCursor:  cursor,
		Health:        overview.Health,
		GlobalConfig:  ah.configSvc.Snapshot(),
		Providers:     ah.providerSvc.ListSnapshots(),
		ProviderStats: overview.ProviderStats,
		RecentLogs:    applog.RecentEntries(adminBootstrapRecentLogLimit),
	})
}
