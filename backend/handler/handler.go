package handler

import (
	"encoding/json"
	"net/http"

	"simple-api-pool/pool"
)

type Handler struct {
	pool *pool.Pool
}

func Register(mux *http.ServeMux, p *pool.Pool) {
	h := &Handler{pool: p}
	mux.HandleFunc("/api/health", h.Health)
	mux.HandleFunc("/api/pool", h.HandlePool)
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *Handler) HandlePool(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		json.NewEncoder(w).Encode(h.pool.List())
	case http.MethodPost:
		var api pool.API
		if err := json.NewDecoder(r.Body).Decode(&api); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		h.pool.Add(api)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(api)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
