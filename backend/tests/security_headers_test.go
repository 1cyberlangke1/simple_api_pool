package tests

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"simple-api-pool/middleware"
)

func TestApplySecurityHeadersSetsAdditionalSecurityPolicies(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	handler := middleware.ApplySecurityHeaders(next, "")
	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("期望设置 Cross-Origin-Opener-Policy=same-origin，实际是 %q", got)
	}
	if got := rec.Header().Get("Cross-Origin-Resource-Policy"); got != "same-origin" {
		t.Fatalf("期望设置 Cross-Origin-Resource-Policy=same-origin，实际是 %q", got)
	}
	if got := rec.Header().Get("Permissions-Policy"); got == "" {
		t.Fatal("期望设置 Permissions-Policy")
	}
}
