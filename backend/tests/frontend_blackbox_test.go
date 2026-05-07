package tests

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestStatusAndAdminPagesAreAccessibleAndContainFrontendEntrypoints(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("读取测试文件路径失败")
	}
	indexPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "frontend", "index.html")
	indexHTML, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("读取前端首页失败: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/", "/status", "/admin":
			http.ServeFile(w, r, indexPath)
		default:
			http.NotFound(w, r)
		}
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	for _, path := range []string{"/status", "/admin"} {
		resp, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatalf("请求 %s 失败: %v", path, err)
		}

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("请求 %s 期望状态码 %d，实际是 %d", path, http.StatusOK, resp.StatusCode)
		}
		if got := resp.Header.Get("Content-Type"); !strings.Contains(got, "text/html") {
			t.Fatalf("请求 %s 期望返回 HTML，实际 Content-Type 是 %q", path, got)
		}

		bodyBytes, err := ioReadAllAndClose(resp)
		if err != nil {
			t.Fatalf("读取 %s 响应失败: %v", path, err)
		}
		body := string(bodyBytes)

		mustContain(t, body, `<button id="nav-admin"`)
		mustContain(t, body, `id="login-form"`)
		mustContain(t, body, `id="admin-workspace"`)
		mustContain(t, body, `id="provider-list"`)
		mustContain(t, body, `id="recent-log-list"`)
		mustContain(t, body, `const API_BASE = "/api"`)
		mustContain(t, body, `request("/status/overview")`)
		mustContain(t, body, `request("/admin/login"`)
		mustContain(t, body, `request("/admin/overview", {}, true)`)
		mustContain(t, body, `localStorage.getItem(STORAGE_KEY)`)
		mustContain(t, body, `provider.tagAvailableKeys`)
		mustContain(t, body, `data-action="clear-cache"`)
		mustContain(t, body, `/admin/providers/${encodeURIComponent(provider)}/cache`)
		mustContain(t, body, `id="status-view" class="grid content-grid single-column-grid"`)
		mustContain(t, body, `id="admin-view" class="grid admin-dashboard-grid hidden"`)
	}

	if !strings.Contains(string(indexHTML), `refs.navStatus.addEventListener("click", () => goTo("/status"))`) {
		t.Fatal("期望管理页保留跳转到状态页的前端交互")
	}
	if !strings.Contains(string(indexHTML), `const STATUS_POLL_INTERVAL_MS =`) {
		t.Fatal("期望前端定义状态轮询间隔")
	}
	if !strings.Contains(string(indexHTML), `function startOverviewPolling()`) {
		t.Fatal("期望前端具备总览轮询逻辑")
	}
	if !strings.Contains(string(indexHTML), `await loadStatusOverview();`) || !strings.Contains(string(indexHTML), `await loadAdminOverview();`) {
		t.Fatal("期望前端使用总览接口刷新状态和管理数据")
	}
	if strings.Contains(string(indexHTML), `status.legendTitle`) || strings.Contains(string(indexHTML), `legend.successError`) || strings.Contains(string(indexHTML), `status.nextTitle`) {
		t.Fatal("期望前端移除状态页指标说明和下一步文案")
	}
}

func ioReadAllAndClose(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func mustContain(t *testing.T, body, needle string) {
	t.Helper()
	if !strings.Contains(body, needle) {
		t.Fatalf("期望页面内容包含 %q", needle)
	}
}
