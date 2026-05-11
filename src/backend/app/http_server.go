package app

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"simple-api-pool/config"
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

func ValidatePlainHTTPConfiguration(cfg *config.Config) error {
	if cfg == nil || allowInsecureHTTP() {
		return nil
	}
	if strings.TrimSpace(cfg.AdminKey()) == "" && len(cfg.ClientKeys()) == 0 {
		return nil
	}
	return errors.New("已配置管理员密钥或客户端密钥，默认不允许明文 HTTP 启动；仅本地开发时可显式设置 ALLOW_INSECURE_HTTP=true")
}

func allowInsecureHTTP() bool {
	rawValue := strings.TrimSpace(os.Getenv("ALLOW_INSECURE_HTTP"))
	if rawValue == "" {
		return false
	}
	allowed, err := strconv.ParseBool(rawValue)
	if err != nil {
		return false
	}
	return allowed
}
