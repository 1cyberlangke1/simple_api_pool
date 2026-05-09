package app

import (
	"context"
	"errors"
	"net/http"
	"time"
)

const (
	defaultServerReadTimeout  = 30 * time.Second
	defaultServerWriteTimeout = 300 * time.Second
	defaultServerIdleTimeout  = 60 * time.Second
)

type serverLifecycle interface {
	Shutdown(context.Context) error
	Close() error
}

func NewHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  defaultServerReadTimeout,
		WriteTimeout: defaultServerWriteTimeout,
		IdleTimeout:  defaultServerIdleTimeout,
	}
}

func ShutdownHTTPServer(server serverLifecycle, timeout time.Duration) error {
	if server == nil {
		return nil
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return errors.Join(err, server.Close())
	}
	return nil
}
