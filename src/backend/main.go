// simple-api-pool starts the backend runtime and HTTP server.
package main

import (
	"context"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/dustin/go-humanize"

	"simple-api-pool/app"
	"simple-api-pool/applog"
	"simple-api-pool/config"
)

func main() {
	applog.InitFromEnv()
	applyProcessMemoryLimit()

	runtimeInstance, err := app.NewRuntime(app.Options{})
	if err != nil {
		log.Fatalf("bootstrap runtime failed: %v", err)
	}
	defer runtimeInstance.Close()

	addr := config.ListenAddr()
	server := app.NewHTTPServer(addr, runtimeInstance.Handler)
	shutdownCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	go func() {
		<-shutdownCtx.Done()
		if err := app.ShutdownHTTPServer(server, 10*time.Second); err != nil {
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
	if err != nil || bytesValue == 0 || bytesValue > math.MaxInt64 {
		return 0, false
	}
	return int64(bytesValue), true
}
