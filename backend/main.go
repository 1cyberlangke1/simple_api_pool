package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"

	"simple-api-pool/applog"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/store"
)

func main() {
	if v := os.Getenv("GOMEMLIMIT"); v == "" {
		debug.SetMemoryLimit(32 << 20) // 32 MiB
	}
	applog.InitFromEnv()

	store := store.New("data")
	cfg := config.New(store)
	statsMgr := stats.NewManager(store)
	defer statsMgr.Stop()
	kr := keyring.New(cfg)
	cacheStore := cache.NewStore("data/cache")
	defer cacheStore.Close()

	proxyHandler := handler.NewProxyHandler(cfg, statsMgr, kr, cacheStore, 50)
	adminHandler := handler.NewAdminHandler(cfg, statsMgr, cacheStore)
	statusHandler := handler.NewStatusHandler(cfg, statsMgr)
	frontendRoot := resolveFrontendRoot()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/api/status/stats", statusHandler)
	mux.Handle("/api/status/overview", statusHandler)
	mux.Handle("/api/admin/", adminHandler)
	mux.Handle("/api/admin", adminHandler)

	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" || path == "/status" || path == "/admin" {
			serveFrontendIndex(w, r, frontendRoot)
			return
		}
		if path == "/favicon.svg" {
			serveFrontendAsset(w, r, frontendRoot, "favicon.svg")
			return
		}
		if path == "/favicon.ico" {
			http.Redirect(w, r, "/favicon.svg", http.StatusMovedPermanently)
			return
		}
		proxyHandler.ServeHTTP(w, r)
	}))

	addr := config.ListenAddr()
	muxWithLogs := securityHeadersMiddleware(applog.LoggingMiddleware(mux))
	log.Printf("simple-api-pool listening on %s", addr)
	if err := http.ListenAndServe(addr, muxWithLogs); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func resolveFrontendRoot() string {
	candidates := []string{"frontend", filepath.Join("..", "frontend")}
	for _, candidate := range candidates {
		indexPath := filepath.Join(candidate, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			return candidate
		}
	}
	return ""
}

func serveFrontendIndex(w http.ResponseWriter, r *http.Request, frontendRoot string) {
	if frontendRoot == "" {
		http.Error(w, `{"error":"前端资源不存在"}`, http.StatusServiceUnavailable)
		return
	}
	http.ServeFile(w, r, filepath.Join(frontendRoot, "index.html"))
}

func serveFrontendAsset(w http.ResponseWriter, r *http.Request, frontendRoot, assetName string) {
	if frontendRoot == "" {
		http.Error(w, `{"error":"前端资源不存在"}`, http.StatusServiceUnavailable)
		return
	}
	http.ServeFile(w, r, filepath.Join(frontendRoot, assetName))
}
