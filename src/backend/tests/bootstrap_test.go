package tests

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/app"
)

func TestBootstrapRuntimeFallsBackWhenCSPProviderCreationFails(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	runtimeInstance, err := app.NewRuntime(app.Options{
		DataDir:      t.TempDir(),
		FrontendRoot: frontendRootFromRepoRoot(repoRoot),
		NewCSPProvider: func(string) (app.ContentSecurityPolicyProvider, error) {
			return nil, errors.New("boom")
		},
	})
	if err != nil {
		t.Fatalf("创建运行时失败: %v", err)
	}
	t.Cleanup(func() {
		_ = runtimeInstance.Close()
	})

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	runtimeInstance.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("健康检查期望状态码 %d，实际是 %d", http.StatusOK, rec.Code)
	}
	if got := rec.Header().Get("Content-Security-Policy"); got == "" {
		t.Fatal("期望即使 CSP provider 初始化失败，也仍返回默认 Content-Security-Policy")
	}
	if !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Fatalf("期望健康检查返回 ok，实际是 %q", rec.Body.String())
	}
}

func TestBootstrapRuntimeServesFrontendEntrypoints(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	runtimeInstance, err := app.NewRuntime(app.Options{
		DataDir:      t.TempDir(),
		FrontendRoot: frontendRootFromRepoRoot(repoRoot),
	})
	if err != nil {
		t.Fatalf("创建运行时失败: %v", err)
	}
	t.Cleanup(func() {
		_ = runtimeInstance.Close()
	})

	for _, path := range []string{"/status", "/admin"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()

		runtimeInstance.Handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("%s 期望状态码 %d，实际是 %d", path, http.StatusOK, rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, `id="build-version"`) {
			t.Fatalf("期望 %s 返回前端入口页，实际响应缺少构建版本区域", path)
		}
	}
}
