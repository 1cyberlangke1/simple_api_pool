package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/dustin/go-humanize"

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
	applyProcessMemoryLimit()
	applog.InitFromEnv()

	store := store.New("data")
	cfg := config.New(store)
	cfg.ApplyEnvOverrides()
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
		log.Printf("build content security policy failed, fallback to default policy: %v", err)
		contentSecurityPolicyProvider = nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
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
		if path == "/favicon.ico" {
			http.Redirect(w, r, "/favicon.svg", http.StatusMovedPermanently)
			return
		}
		if webui.ServeAssetByRequestPath(w, r, frontendRoot, path) {
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

func applyProcessMemoryLimit() {
	const defaultMemoryLimit = int64(32 << 20)

	rawValue := strings.TrimSpace(os.Getenv("GOMEMLIMIT"))
	if rawValue == "" {
		debug.SetMemoryLimit(defaultMemoryLimit)
		return
	}

	if bytesValue, ok := parseMemoryLimitBytes(rawValue); ok {
		debug.SetMemoryLimit(bytesValue)
		return
	}

	log.Printf("invalid GOMEMLIMIT=%q, fallback to 32MiB", rawValue)
	debug.SetMemoryLimit(defaultMemoryLimit)
}

func parseMemoryLimitBytes(rawValue string) (int64, bool) {
	if rawValue == "" {
		return 0, false
	}

	if numericValue, err := strconv.ParseInt(rawValue, 10, 64); err == nil && numericValue > 0 {
		return numericValue, true
	}

	bytesValue, err := humanize.ParseBytes(rawValue)
	if err != nil || bytesValue == 0 || bytesValue > uint64(^uint(0)>>1) {
		return 0, false
	}
	return int64(bytesValue), true
}
