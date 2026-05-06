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
		mustContain(t, body, `id="status-to-admin"`)
		mustContain(t, body, `id="login-form"`)
		mustContain(t, body, `id="admin-workspace"`)
		mustContain(t, body, `id="provider-list"`)
		mustContain(t, body, `const API_BASE = "/api"`)
		mustContain(t, body, `request("/status/stats")`)
		mustContain(t, body, `request("/admin/login"`)
		mustContain(t, body, `localStorage.getItem(STORAGE_KEY)`)
		mustContain(t, body, `provider.tagAvailableKeys`)
	}

	if !strings.Contains(string(indexHTML), `refs.statusToAdmin.addEventListener("click", () => goTo("/admin"))`) {
		t.Fatal("期望状态页保留跳转到管理页的前端交互")
	}
	if !strings.Contains(string(indexHTML), `refs.navStatus.addEventListener("click", () => goTo("/status"))`) {
		t.Fatal("期望管理页保留跳转到状态页的前端交互")
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
