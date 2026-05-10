package app

import (
	"log"
	"net/http"
	"path/filepath"

	"github.com/go-chi/chi/v5"

	"simple-api-pool/adminapi"
	"simple-api-pool/applog"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/httpapi"
	"simple-api-pool/keyring"
	"simple-api-pool/middleware"
	"simple-api-pool/proxyapi"
	"simple-api-pool/stats"
	"simple-api-pool/statusapi"
	"simple-api-pool/store"
	"simple-api-pool/webui"
)

type ContentSecurityPolicyProvider interface {
	Policy() string
}

type Options struct {
	DataDir          string
	FrontendRoot     string
	ProxyConcurrency int
	NewCSPProvider   func(frontendRoot string) (ContentSecurityPolicyProvider, error)
}

type Runtime struct {
	Handler    http.Handler
	statsMgr   *stats.Manager
	cacheStore *cache.Store
}

func NewRuntime(opts Options) (*Runtime, error) {
	dataDir := opts.DataDir
	if dataDir == "" {
		dataDir = "data"
	}
	frontendRoot := opts.FrontendRoot
	if frontendRoot == "" {
		frontendRoot = webui.ResolveRoot()
	}
	proxyConcurrency := opts.ProxyConcurrency
	if proxyConcurrency <= 0 {
		proxyConcurrency = config.ProxyConcurrency()
	}

	stateStore := store.New(dataDir)
	if err := stateStore.Err(); err != nil {
		return nil, err
	}
	cfg := config.New(stateStore)
	if err := cfg.Err(); err != nil {
		return nil, err
	}
	cfg.ApplyEnvOverrides()
	statsMgr := stats.NewManager(stateStore)
	cacheStore := cache.NewStore(filepath.Join(dataDir, "cache"))
	if err := cacheStore.Err(); err != nil {
		statsMgr.Stop()
		return nil, err
	}
	kr := keyring.New(cfg)

	proxyHandler := proxyapi.NewProxyHandler(cfg, statsMgr, kr, cacheStore, proxyConcurrency)
	adminHandler := adminapi.NewHandler(cfg, statsMgr, cacheStore)
	statusHandler := statusapi.NewHandler(cfg, statsMgr)
	rootHandler := newRootHandler(frontendRoot, proxyHandler, adminHandler, statusHandler)

	cspProvider, err := newCSPProvider(opts, frontendRoot)
	if err != nil {
		log.Printf("build content security policy failed, fallback to default policy: %v", err)
		cspProvider = nil
	}

	return &Runtime{
		Handler:    httpapi.CompressionMiddleware(middleware.ApplySecurityHeaders(applog.LoggingMiddleware(rootHandler), policyFunc(cspProvider))),
		statsMgr:   statsMgr,
		cacheStore: cacheStore,
	}, nil
}

func (r *Runtime) Close() error {
	if r == nil {
		return nil
	}
	if r.statsMgr != nil {
		r.statsMgr.Stop()
	}
	if r.cacheStore != nil {
		return r.cacheStore.Close()
	}
	return nil
}

func newCSPProvider(opts Options, frontendRoot string) (ContentSecurityPolicyProvider, error) {
	if opts.NewCSPProvider != nil {
		return opts.NewCSPProvider(frontendRoot)
	}
	return webui.NewContentSecurityPolicyProvider(frontendRoot)
}

func policyFunc(provider ContentSecurityPolicyProvider) func() string {
	if provider == nil {
		return nil
	}
	return provider.Policy
}

func newRootHandler(frontendRoot string, proxyHandler http.Handler, adminHandler http.Handler, statusHandler http.Handler) http.Handler {
	router := chi.NewRouter()
	router.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	router.Handle("/api/status/*", statusHandler)
	router.Handle("/api/admin/*", adminHandler)
	router.Handle("/api/admin", adminHandler)
	router.Handle("/api/status/overview", statusHandler)
	router.Handle("/api/status/stats", statusHandler)

	router.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" || path == "/status" || path == "/admin" {
			webui.ServeIndex(w, r, frontendRoot)
			return
		}
		if path == "/favicon.ico" {
			http.Redirect(w, r, "/favicon.svg", http.StatusTemporaryRedirect)
			return
		}
		if webui.ServeAssetByRequestPath(w, r, frontendRoot, path) {
			return
		}
		proxyHandler.ServeHTTP(w, r)
	}))

	return router
}
