package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"
	"time"

	"simple-api-pool/applog"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/handler"
	"simple-api-pool/keyring"
	"simple-api-pool/middleware"
	"simple-api-pool/stats"
	"simple-api-pool/store"
	"simple-api-pool/webui"
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
	frontendRoot := webui.ResolveRoot()
	contentSecurityPolicyProvider, err := webui.NewContentSecurityPolicyProvider(frontendRoot)
	if err != nil {
		log.Fatalf("build content security policy failed: %v", err)
	}

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
			webui.ServeIndex(w, r, frontendRoot)
			return
		}
		if path == "/favicon.svg" {
			webui.ServeAsset(w, r, frontendRoot, "favicon.svg")
			return
		}
		if path == "/favicon.ico" {
			http.Redirect(w, r, "/favicon.svg", http.StatusMovedPermanently)
			return
		}
		proxyHandler.ServeHTTP(w, r)
	}))

	addr := config.ListenAddr()
	muxWithLogs := middleware.ApplySecurityHeaders(applog.LoggingMiddleware(mux), contentSecurityPolicyProvider.Policy)
	server := &http.Server{
		Addr:    addr,
		Handler: muxWithLogs,
	}
	shutdownCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	go func() {
		<-shutdownCtx.Done()
		stopSignals()
		drainCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(drainCtx); err != nil {
			log.Printf("server shutdown error: %v", err)
		}
	}()

	log.Printf("simple-api-pool listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
