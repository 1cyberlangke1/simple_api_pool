package handler

import (
	"encoding/json"
	"net/http"

	"simple-api-pool/stats"
)

type StatusHandler struct {
	stats *stats.Manager
}

func NewStatusHandler(sm *stats.Manager) *StatusHandler {
	return &StatusHandler{stats: sm}
}

func (sh *StatusHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sh.stats.Snapshot())
}
