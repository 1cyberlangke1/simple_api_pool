package handler

import (
	"encoding/json"
	"net/http"
	"time"

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
	w.Header().Set("Content-Type", "application/json")
	payload := make(map[string]StatusSnapshot)
	for name, snap := range sh.stats.Snapshot() {
		payload[name] = StatusSnapshot{
			SuccessCount: snap.SuccessCount,
			ErrorCount:   snap.ErrorCount,
			InputTokens:  snap.InputTokens,
			OutputTokens: snap.OutputTokens,
			CacheTokens:  snap.CacheTokens,
			CacheHits:    snap.CacheHits,
			ErrorTypes:   snap.ErrorTypes,
		}
	}

	now := time.Now().Unix()
	for _, provider := range sh.cfg.Providers() {
		entry := payload[provider.Name]
		entry.TotalKeys = int64(len(provider.Keys))
		for _, key := range provider.Keys {
			if key.DisabledUntil > now {
				continue
			}
			entry.AvailableKeys++
		}
		payload[provider.Name] = entry
	}

	json.NewEncoder(w).Encode(payload)
}
