package handler

import (
	"net/http"

	"simple-api-pool/config"
	"simple-api-pool/stats"
)

type StatusHandler struct {
	cfg   *config.Config
	stats *stats.Manager
}

type StatusSnapshot struct {
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

func NewStatusHandler(cfg *config.Config, sm *stats.Manager) *StatusHandler {
	return &StatusHandler{cfg: cfg, stats: sm}
}

func (sh *StatusHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/status/overview" {
		writeOverviewResponse(w, r, newStatusOverviewResponse(sh.cfg, sh.stats))
		return
	}

	writeJSONResponse(w, http.StatusOK, collectProviderStatusSnapshots(sh.cfg, sh.stats))
}
