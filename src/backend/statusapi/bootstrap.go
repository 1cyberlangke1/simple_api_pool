package statusapi

import (
	"net/http"

	"simple-api-pool/httpapi"
	"simple-api-pool/realtime"
)

type BootstrapResponse struct {
	Version       uint64                `json:"version"`
	StreamCursor  uint64                `json:"stream_cursor"`
	Health        ServiceHealthSnapshot `json:"health"`
	ProviderTypes map[string]string     `json:"provider_types"`
	ProviderStats map[string]Snapshot   `json:"provider_stats"`
}

func (sh *Handler) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	overview := newStatusOverviewResponse(sh.cfg, sh.stats)
	cursor := realtime.LatestID()
	httpapi.WriteJSONResponse(w, http.StatusOK, BootstrapResponse{
		Version:       cursor,
		StreamCursor:  cursor,
		Health:        ServiceHealthSnapshot{Status: overview.Health.Status},
		ProviderTypes: overview.ProviderTypes,
		ProviderStats: overview.ProviderStats,
	})
}
