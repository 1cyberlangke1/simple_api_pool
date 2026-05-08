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
	faviconPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "frontend", "favicon.svg")
	indexHTML, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("读取前端首页失败: %v", err)
	}
	faviconSVG, err := os.ReadFile(faviconPath)
	if err != nil {
		t.Fatalf("读取 favicon 失败: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/", "/status", "/admin":
			http.ServeFile(w, r, indexPath)
		case "/favicon.svg":
			http.ServeFile(w, r, faviconPath)
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
		mustContain(t, body, `id="provider-page-prev"`)
		mustContain(t, body, `id="provider-page-next"`)
		mustContain(t, body, `id="provider-page-indicator"`)
		mustContain(t, body, `id="recent-log-list"`)
		mustContain(t, body, `id="open-log-modal"`)
		mustContain(t, body, `id="log-modal"`)
		mustContain(t, body, `id="hide-panel-logs"`)
		mustContain(t, body, `id="key-search"`)
		mustContain(t, body, `data-action="select-page-keys"`)
		mustContain(t, body, `data-action="invert-page-keys"`)
		mustContain(t, body, `data-action="enable-selected-keys"`)
		mustContain(t, body, `data-action="disable-selected-keys"`)
		mustContain(t, body, `data-action="delete-selected-keys"`)
		mustContain(t, body, `value="43200"`)
		mustContain(t, body, `id="build-version"`)
		mustContain(t, body, `id="build-version-value"`)
		mustContain(t, body, `rel="icon" type="image/svg+xml" href="/favicon.svg"`)
		mustContain(t, body, `class="list provider-catalog"`)
		mustContain(t, body, `const API_BASE = "/api"`)
		mustContain(t, body, `__APP_VERSION__`)
		mustContain(t, body, `__APP_REVISION__`)
		mustContain(t, body, `__APP_BUILD_TIME__`)
		mustContain(t, body, `request("/admin/login"`)
		mustContain(t, body, `requestOverview("/admin/overview", "admin", true)`)
		mustContain(t, body, `requestOverview("/status/overview", "status")`)
		mustContain(t, body, `If-None-Match`)
		mustContain(t, body, `provider.tagAvailableKeys`)
		mustContain(t, body, `data-action="clear-cache"`)
		mustContain(t, body, `/admin/providers/${encodeURIComponent(provider)}/cache`)
		mustContain(t, body, `id="status-view" class="grid content-grid single-column-grid"`)
		mustContain(t, body, `id="admin-view" class="grid admin-dashboard-grid hidden"`)
		mustContain(t, body, `id="global-admin-key" name="admin_key" type="password"`)
	}

	faviconResp, err := http.Get(server.URL + "/favicon.svg")
	if err != nil {
		t.Fatalf("请求 favicon 失败: %v", err)
	}
	if faviconResp.StatusCode != http.StatusOK {
		t.Fatalf("请求 favicon 期望状态码 %d，实际是 %d", http.StatusOK, faviconResp.StatusCode)
	}
	if got := faviconResp.Header.Get("Content-Type"); !strings.Contains(got, "image/svg+xml") && !strings.Contains(got, "text/xml") {
		t.Fatalf("请求 favicon 期望返回 SVG，实际 Content-Type 是 %q", got)
	}

	if !strings.Contains(string(indexHTML), `refs.navStatus.addEventListener("click", () => goTo("/status"))`) {
		t.Fatal("期望管理页保留跳转到状态页的前端交互")
	}
	if !strings.Contains(string(indexHTML), `rel="shortcut icon" href="/favicon.svg"`) {
		t.Fatal("期望前端声明浏览器图标")
	}
	if !strings.Contains(string(faviconSVG), `<svg`) || !strings.Contains(string(faviconSVG), `linearGradient`) {
		t.Fatal("期望 favicon 使用可渲染的 SVG 图形")
	}
	if !strings.Contains(string(indexHTML), `const STATUS_POLL_INTERVAL_MS =`) {
		t.Fatal("期望前端定义状态轮询间隔")
	}
	if !strings.Contains(string(indexHTML), `overviewEtags`) {
		t.Fatal("期望前端维护总览 ETag 状态")
	}
	if !strings.Contains(string(indexHTML), `function startOverviewPolling()`) {
		t.Fatal("期望前端具备总览轮询逻辑")
	}
	if !strings.Contains(string(indexHTML), `function requestOverview(`) {
		t.Fatal("期望前端具备总览协商缓存请求逻辑")
	}
	if strings.Contains(string(indexHTML), `localStorage.getItem(STORAGE_KEY)`) {
		t.Fatal("期望前端不再把管理员密钥持久化到本地存储")
	}
	if strings.Contains(string(indexHTML), `fonts.googleapis.com`) {
		t.Fatal("期望前端不依赖外部字体 CDN")
	}
	if strings.Contains(string(indexHTML), `Authorization`) || strings.Contains(string(indexHTML), `Bearer`) {
		t.Fatal("期望前端不再通过 Authorization 头长期携带管理员密钥")
	}
	if strings.Contains(string(indexHTML), `innerHTML = t(el.getAttribute("data-i18n-html"))`) {
		t.Fatal("期望前端不再把翻译文本直接写入 innerHTML")
	}
	if strings.Contains(string(indexHTML), `.replaceAll(`) {
		t.Fatal("期望前端避免依赖 replaceAll，兼容旧浏览器")
	}
	if strings.Contains(string(indexHTML), `?.`) {
		t.Fatal("期望前端避免依赖可选链语法，兼容旧浏览器")
	}
	if strings.Contains(string(indexHTML), `??`) {
		t.Fatal("期望前端避免依赖空值合并语法，兼容旧浏览器")
	}
	if !strings.Contains(string(indexHTML), `credentials: "same-origin"`) {
		t.Fatal("期望前端通过同源 Cookie 维持管理员会话")
	}
	if !strings.Contains(string(indexHTML), `await request("/admin/logout", { method: "POST" }, true);`) {
		t.Fatal("期望前端支持管理员主动登出")
	}
	if !strings.Contains(string(indexHTML), `function renderBuildVersion(`) {
		t.Fatal("期望前端具备构建版本展示逻辑")
	}
	if !strings.Contains(string(indexHTML), `function setLogModalOpen(`) {
		t.Fatal("期望前端具备日志弹窗控制逻辑")
	}
	if !strings.Contains(string(indexHTML), `function isPanelRequestLog(`) {
		t.Fatal("期望前端具备面板请求过滤逻辑")
	}
	if !strings.Contains(string(indexHTML), `path === "/favicon.ico"`) {
		t.Fatal("期望前端过滤 favicon 请求日志")
	}
	if !strings.Contains(string(indexHTML), `state.hidePanelLogs = refs.hidePanelLogsToggle.checked`) {
		t.Fatal("期望前端支持切换隐藏面板日志")
	}
	if !strings.Contains(string(indexHTML), `terminal-log-entry`) {
		t.Fatal("期望前端使用终端风格日志样式")
	}
	if !strings.Contains(string(indexHTML), `function renderProviderPager(`) {
		t.Fatal("期望前端具备提供商分页渲染逻辑")
	}
	if !strings.Contains(string(indexHTML), `function filterProviderKeys(`) {
		t.Fatal("期望前端具备密钥搜索过滤逻辑")
	}
	if !strings.Contains(string(indexHTML), `function renderProviderKeysSection(`) {
		t.Fatal("期望前端具备独立的密钥区域渲染逻辑")
	}
	if !strings.Contains(string(indexHTML), `.content-grid.single-column-grid`) {
		t.Fatal("期望状态页单列布局在宽屏下保持满宽展示")
	}
	if !strings.Contains(string(indexHTML), `function updateProviderKeysInState(`) {
		t.Fatal("期望前端支持本地更新提供商密钥状态，减少整页重载")
	}
	if !strings.Contains(string(indexHTML), `function syncGlobalConfigDraft(`) {
		t.Fatal("期望前端具备全局配置草稿同步逻辑")
	}
	if !strings.Contains(string(indexHTML), `function syncProviderDraft(`) {
		t.Fatal("期望前端具备提供商表单草稿同步逻辑")
	}
	if !strings.Contains(string(indexHTML), `draftProvider.max_disable_secs !== undefined ? draftProvider.max_disable_secs : Number(provider.max_disable_secs || 43200)`) {
		t.Fatal("期望前端使用 43200 作为最大禁用时长默认值")
	}
	if !strings.Contains(string(indexHTML), `function applyBulkKeyAction(`) {
		t.Fatal("期望前端具备批量 Key 操作逻辑")
	}
	if !strings.Contains(string(indexHTML), `provider-single-panel`) {
		t.Fatal("期望前端使用单提供商聚焦布局")
	}
	if !strings.Contains(string(indexHTML), `provider-compact-fields`) {
		t.Fatal("期望前端收紧提供商配置布局")
	}
	bulkActionStart := strings.Index(string(indexHTML), `async function applyBulkKeyAction(`)
	if bulkActionStart == -1 {
		t.Fatal("期望前端具备批量 Key 操作逻辑")
	}
	listenerSectionStart := strings.Index(string(indexHTML)[bulkActionStart:], `/* ---------- listeners ---------- */`)
	if listenerSectionStart == -1 {
		t.Fatal("期望前端保留监听器区段标记")
	}
	bulkActionBody := string(indexHTML)[bulkActionStart : bulkActionStart+listenerSectionStart]
	if strings.Contains(bulkActionBody, `await loadAdminOverview();`) {
		t.Fatal("期望批量 Key 操作优先更新前端本地状态，而不是每次整页重载")
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
