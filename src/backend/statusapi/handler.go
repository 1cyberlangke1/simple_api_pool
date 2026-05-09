package statusapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"simple-api-pool/config"
	"simple-api-pool/httpapi"
	"simple-api-pool/service"
	"simple-api-pool/stats"
)

type Handler struct {
	cfg    *config.Config
	stats  *stats.Manager
	router chi.Router
}

type Snapshot = service.ProviderStatusSnapshot

func NewHandler(cfg *config.Config, sm *stats.Manager) *Handler {
	handler := &Handler{cfg: cfg, stats: sm}
	handler.router = handler.newRouter()
	return handler
}

func (sh *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	sh.router.ServeHTTP(w, r)
}

func (sh *Handler) newRouter() chi.Router {
	router := chi.NewRouter()
	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteErrorResponse(w, http.StatusNotFound, "接口不存在")
	})
	router.Get("/api/status/overview", func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteOverviewResponse(w, r, newStatusOverviewResponse(sh.cfg, sh.stats))
	})
	router.Get("/api/status/stats", func(w http.ResponseWriter, r *http.Request) {
		httpapi.WriteJSONResponse(w, http.StatusOK, CollectProviderStatusSnapshots(sh.cfg, sh.stats))
	})
	return router
}
