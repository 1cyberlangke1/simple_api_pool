package tests

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"simple-api-pool/middleware"
	"simple-api-pool/webui"
)

func TestApplySecurityHeadersSetsAdditionalSecurityPolicies(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	handler := middleware.ApplySecurityHeaders(next, nil)
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
	if got := rec.Header().Get("Permissions-Policy"); got != "()" {
		t.Fatalf("期望 Permissions-Policy=()，实际是 %q", got)
	}
	if got := rec.Header().Get("Strict-Transport-Security"); got != "max-age=31536000; includeSubDomains" {
		t.Fatalf("期望设置 HSTS，实际是 %q", got)
	}
}

func TestApplySecurityHeadersOnlyMarksRealAdminPathsAsNoStore(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	handler := middleware.ApplySecurityHeaders(next, nil)

	adminReq := httptest.NewRequest(http.MethodGet, "/api/admin/overview", nil)
	adminRec := httptest.NewRecorder()
	handler.ServeHTTP(adminRec, adminReq)
	if got := adminRec.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("期望真实管理路径命中 no-store，实际是 %q", got)
	}

	fakeAdminReq := httptest.NewRequest(http.MethodGet, "/api/administration", nil)
	fakeAdminRec := httptest.NewRecorder()
	handler.ServeHTTP(fakeAdminRec, fakeAdminReq)
	if got := fakeAdminRec.Header().Get("Cache-Control"); got != "" {
		t.Fatalf("期望伪前缀路径不命中 no-store，实际是 %q", got)
	}
}

func TestContentSecurityPolicyProviderRefreshesAfterIndexChange(t *testing.T) {
	frontendRoot := t.TempDir()
	indexPath := filepath.Join(frontendRoot, "index.html")

	initialIndex := "<!doctype html><html><head><script>console.log('a')</script></head><body></body></html>"
	if err := os.WriteFile(indexPath, []byte(initialIndex), 0600); err != nil {
		t.Fatalf("写入初始 index.html 失败: %v", err)
	}

	provider, err := webui.NewContentSecurityPolicyProvider(frontendRoot)
	if err != nil {
		t.Fatalf("创建 CSP provider 失败: %v", err)
	}

	initialPolicy := provider.Policy()
	if !strings.Contains(initialPolicy, "sha256-") {
		t.Fatalf("期望初始 CSP 包含内联脚本 hash，实际是 %q", initialPolicy)
	}

	updatedIndex := "<!doctype html><html><head><script>console.log('updated script body')</script></head><body></body></html>"
	if err := os.WriteFile(indexPath, []byte(updatedIndex), 0600); err != nil {
		t.Fatalf("写入更新后的 index.html 失败: %v", err)
	}

	updatedPolicy := provider.Policy()
	if updatedPolicy == initialPolicy {
		t.Fatal("期望 index.html 变化后 CSP 随之刷新")
	}
}
