package tests

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
		if !strings.Contains(body, `id="app-root"`) || !strings.Contains(body, `/assets/app.js?v=`) {
			t.Fatalf("期望 %s 返回新的单 bundle 前端入口页", path)
		}
	}
}

func TestBootstrapRuntimeRejectsInvalidDataDir(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	baseDir := t.TempDir()
	blockingPath := filepath.Join(baseDir, "blocked")
	if err := os.WriteFile(blockingPath, []byte("blocked"), 0600); err != nil {
		t.Fatalf("创建阻塞文件失败: %v", err)
	}

	runtimeInstance, err := app.NewRuntime(app.Options{
		DataDir:      blockingPath,
		FrontendRoot: frontendRootFromRepoRoot(repoRoot),
	})
	if err == nil {
		if runtimeInstance != nil {
			_ = runtimeInstance.Close()
		}
		t.Fatal("期望无效 dataDir 在启动阶段直接返回错误")
	}
}

func TestBootstrapRuntimeRejectsInvalidConfigSnapshot(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "config.json"), []byte(`{invalid`), 0600); err != nil {
		t.Fatalf("写入损坏配置文件失败: %v", err)
	}

	runtimeInstance, err := app.NewRuntime(app.Options{
		DataDir:      dataDir,
		FrontendRoot: frontendRootFromRepoRoot(repoRoot),
	})
	if err == nil {
		if runtimeInstance != nil {
			_ = runtimeInstance.Close()
		}
		t.Fatal("期望损坏的 config.json 在启动阶段直接返回错误")
	}
}
