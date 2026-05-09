package tests

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"simple-api-pool/app"
)

func TestNewHTTPServerAppliesTimeoutDefaults(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	server := app.NewHTTPServer(":18080", handler)
	if server == nil {
		t.Fatal("期望返回 HTTP Server")
	}
	if server.Addr != ":18080" {
		t.Fatalf("期望监听地址为 :18080，实际是 %q", server.Addr)
	}
	if server.Handler == nil {
		t.Fatal("期望保留传入的 Handler")
	}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	server.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("期望保留传入 Handler 的行为，实际状态码是 %d", rec.Code)
	}
	if server.ReadTimeout != 30*time.Second {
		t.Fatalf("期望 ReadTimeout 为 30s，实际是 %s", server.ReadTimeout)
	}
	if server.WriteTimeout != 300*time.Second {
		t.Fatalf("期望 WriteTimeout 为 300s，实际是 %s", server.WriteTimeout)
	}
	if server.IdleTimeout != 60*time.Second {
		t.Fatalf("期望 IdleTimeout 为 60s，实际是 %s", server.IdleTimeout)
	}
}

func TestShutdownHTTPServerFallsBackToCloseOnShutdownError(t *testing.T) {
	shutdownErr := errors.New("shutdown failed")

	server := &fakeServerLifecycle{
		shutdownErr: shutdownErr,
	}
	err := app.ShutdownHTTPServer(server, 5*time.Millisecond)
	if !errors.Is(err, shutdownErr) {
		t.Fatalf("期望返回 shutdown 错误，实际是 %v", err)
	}
	if server.shutdownCalls != 1 {
		t.Fatalf("期望调用 Shutdown 1 次，实际是 %d", server.shutdownCalls)
	}
	if server.closeCalls != 1 {
		t.Fatalf("期望 Shutdown 失败后调用 Close 1 次，实际是 %d", server.closeCalls)
	}
}

func TestShutdownHTTPServerDoesNotCloseAfterCleanShutdown(t *testing.T) {
	server := &fakeServerLifecycle{}
	if err := app.ShutdownHTTPServer(server, 5*time.Millisecond); err != nil {
		t.Fatalf("期望正常关闭不报错，实际是 %v", err)
	}
	if server.shutdownCalls != 1 {
		t.Fatalf("期望调用 Shutdown 1 次，实际是 %d", server.shutdownCalls)
	}
	if server.closeCalls != 0 {
		t.Fatalf("期望正常 Shutdown 后不再调用 Close，实际是 %d", server.closeCalls)
	}
}

type fakeServerLifecycle struct {
	shutdownCalls int
	closeCalls    int
	shutdownErr   error
	closeErr      error
}

func (server *fakeServerLifecycle) Shutdown(ctx context.Context) error {
	server.shutdownCalls++
	return server.shutdownErr
}

func (server *fakeServerLifecycle) Close() error {
	server.closeCalls++
	return server.closeErr
}
