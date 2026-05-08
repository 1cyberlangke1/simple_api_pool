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

var frontendScriptAssetPaths = []string{
	"/assets/core.js",
	"/assets/state.js",
	"/assets/i18n.js",
	"/assets/app.js",
	"/assets/views/status_view.js",
	"/assets/views/logs_view.js",
	"/assets/views/provider_view.js",
	"/assets/api.js",
	"/assets/actions/polling_actions.js",
	"/assets/boot.js",
}

func TestStatusAndAdminPagesAreAccessibleAndContainFrontendEntrypoints(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("读取测试文件路径失败")
	}
	frontendRoot := filepath.Join(filepath.Dir(thisFile), "..", "..", "frontend")
	indexPath := filepath.Join(frontendRoot, "index.html")
	stylesPath := filepath.Join(frontendRoot, "assets", "styles.css")
	faviconPath := filepath.Join(frontendRoot, "favicon.svg")
	indexHTML, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("读取前端首页失败: %v", err)
	}
	stylesCSS, err := os.ReadFile(stylesPath)
	if err != nil {
		t.Fatalf("读取前端样式失败: %v", err)
	}
	faviconSVG, err := os.ReadFile(faviconPath)
	if err != nil {
		t.Fatalf("读取 favicon 失败: %v", err)
	}
	scriptContents := make(map[string]string, len(frontendScriptAssetPaths))
	allScripts := make([]string, 0, len(frontendScriptAssetPaths))
	for _, assetPath := range frontendScriptAssetPaths {
		if !strings.HasPrefix(assetPath, "/assets/") {
			t.Fatalf("非法脚本路径: %s", assetPath)
		}
		scriptPath := filepath.Join(frontendRoot, strings.TrimPrefix(filepath.FromSlash(assetPath), string(filepath.Separator)))
		scriptBody, readErr := os.ReadFile(scriptPath)
		if readErr != nil {
			t.Fatalf("读取前端脚本 %s 失败: %v", assetPath, readErr)
		}
		scriptContents[assetPath] = string(scriptBody)
		allScripts = append(allScripts, string(scriptBody))
	}
	scriptBundle := strings.Join(allScripts, "\n\n")
	apiJS := scriptContents["/assets/api.js"]

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/", "/status", "/admin":
			http.ServeFile(w, r, indexPath)
		case "/assets/styles.css":
			http.ServeFile(w, r, stylesPath)
		case "/favicon.svg":
			http.ServeFile(w, r, faviconPath)
		default:
			if strings.HasPrefix(r.URL.Path, "/assets/") {
				http.ServeFile(w, r, filepath.Join(frontendRoot, strings.TrimPrefix(filepath.FromSlash(r.URL.Path), string(filepath.Separator))))
				return
			}
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
		mustContain(t, body, `rel="stylesheet" href="/assets/styles.css"`)
		for _, assetPath := range frontendScriptAssetPaths {
			mustContain(t, body, `<script src="`+assetPath+`" defer></script>`)
		}
		mustContain(t, body, `class="list provider-catalog"`)
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

	if !strings.Contains(string(indexHTML), `rel="shortcut icon" href="/favicon.svg"`) {
		t.Fatal("期望前端声明浏览器图标")
	}
	if !strings.Contains(string(faviconSVG), `<svg`) || !strings.Contains(string(faviconSVG), `linearGradient`) {
		t.Fatal("期望 favicon 使用可渲染的 SVG 图形")
	}
	if !strings.Contains(scriptBundle, `const STATUS_POLL_INTERVAL_MS =`) {
		t.Fatal("期望前端定义状态轮询间隔")
	}
	if !strings.Contains(scriptBundle, `overviewEtags`) {
		t.Fatal("期望前端维护总览 ETag 状态")
	}
	if !strings.Contains(scriptBundle, `function startOverviewPolling()`) {
		t.Fatal("期望前端具备总览轮询逻辑")
	}
	if !strings.Contains(scriptBundle, `function requestOverview(`) {
		t.Fatal("期望前端具备总览协商缓存请求逻辑")
	}
	if !strings.Contains(scriptBundle, `const API_BASE = "/api"`) {
		t.Fatal("期望前端脚本包含 API_BASE 常量")
	}
	if !strings.Contains(scriptBundle, `__APP_VERSION__`) || !strings.Contains(scriptBundle, `__APP_REVISION__`) || !strings.Contains(scriptBundle, `__APP_BUILD_TIME__`) {
		t.Fatal("期望前端脚本保留构建元信息占位符")
	}
	if !strings.Contains(scriptBundle, `request("/admin/login"`) {
		t.Fatal("期望前端脚本包含管理员登录请求")
	}
	if !strings.Contains(scriptBundle, `requestOverview("/admin/overview", "admin")`) {
		t.Fatal("期望前端脚本包含管理总览请求")
	}
	if !strings.Contains(scriptBundle, `requestOverview("/status/overview", "status")`) {
		t.Fatal("期望前端脚本包含状态总览请求")
	}
	if !strings.Contains(scriptBundle, `If-None-Match`) {
		t.Fatal("期望前端脚本使用协商缓存")
	}
	if !strings.Contains(scriptBundle, `provider.tagAvailableKeys`) {
		t.Fatal("期望前端脚本保留可用密钥统计文案")
	}
	if !strings.Contains(scriptBundle, `/admin/providers/${encodeURIComponent(provider)}/cache`) {
		t.Fatal("期望前端脚本保留清空缓存请求")
	}
	if !strings.Contains(scriptBundle, `data-action="clear-cache"`) {
		t.Fatal("期望前端脚本保留清空缓存按钮渲染")
	}
	if strings.Contains(scriptBundle, `localStorage.getItem(STORAGE_KEY)`) {
		t.Fatal("期望前端不再把管理员密钥持久化到本地存储")
	}
	if strings.Contains(string(indexHTML), `<style>`) || strings.Contains(string(indexHTML), `<script>`) {
		t.Fatal("期望前端入口页不再内联整块样式和脚本")
	}
	if strings.Contains(string(indexHTML), `fonts.googleapis.com`) || strings.Contains(string(stylesCSS), `fonts.googleapis.com`) {
		t.Fatal("期望前端不依赖外部字体 CDN")
	}
	if strings.Contains(scriptBundle, `Authorization`) || strings.Contains(scriptBundle, `Bearer`) {
		t.Fatal("期望前端不再通过 Authorization 头长期携带管理员密钥")
	}
	if strings.Contains(scriptBundle, `innerHTML = t(el.getAttribute("data-i18n-html"))`) {
		t.Fatal("期望前端不再把翻译文本直接写入 innerHTML")
	}
	if strings.Contains(scriptBundle, `.replaceAll(`) {
		t.Fatal("期望前端避免依赖 replaceAll，兼容旧浏览器")
	}
	if strings.Contains(scriptBundle, `?.`) {
		t.Fatal("期望前端避免依赖可选链语法，兼容旧浏览器")
	}
	if strings.Contains(scriptBundle, `??`) {
		t.Fatal("期望前端避免依赖空值合并语法，兼容旧浏览器")
	}
	if !strings.Contains(scriptBundle, `credentials: "same-origin"`) {
		t.Fatal("期望前端通过同源 Cookie 维持管理员会话")
	}
	if !strings.Contains(scriptBundle, `await request("/admin/logout", { method: "POST" });`) {
		t.Fatal("期望前端支持管理员主动登出")
	}
	if !strings.Contains(scriptBundle, `function renderBuildVersion(`) {
		t.Fatal("期望前端具备构建版本展示逻辑")
	}
	if !strings.Contains(scriptBundle, `function setLogModalOpen(`) {
		t.Fatal("期望前端具备日志弹窗控制逻辑")
	}
	if !strings.Contains(scriptBundle, `function isPanelRequestLog(`) {
		t.Fatal("期望前端具备面板请求过滤逻辑")
	}
	if !strings.Contains(scriptBundle, `path === "/favicon.ico"`) {
		t.Fatal("期望前端过滤 favicon 请求日志")
	}
	if !strings.Contains(scriptBundle, `state.hidePanelLogs = refs.hidePanelLogsToggle.checked`) {
		t.Fatal("期望前端支持切换隐藏面板日志")
	}
	if !strings.Contains(string(stylesCSS), `terminal-log-entry`) {
		t.Fatal("期望前端使用终端风格日志样式")
	}
	if !strings.Contains(scriptBundle, `function renderProviderPager(`) {
		t.Fatal("期望前端具备提供商分页渲染逻辑")
	}
	if !strings.Contains(scriptBundle, `function filterProviderKeys(`) {
		t.Fatal("期望前端具备密钥搜索过滤逻辑")
	}
	if !strings.Contains(scriptBundle, `function renderProviderKeysSection(`) {
		t.Fatal("期望前端具备独立的密钥区域渲染逻辑")
	}
	if !strings.Contains(string(stylesCSS), `.content-grid.single-column-grid`) {
		t.Fatal("期望状态页单列布局在宽屏下保持满宽展示")
	}
	if !strings.Contains(string(stylesCSS), `.admin-sidebar`) {
		t.Fatal("期望管理页保留侧栏样式")
	}
	if !strings.Contains(string(stylesCSS), `.provider-toolbar-grid`) || !strings.Contains(string(stylesCSS), `justify-content: flex-start`) {
		t.Fatal("期望管理页工具条在宽屏下给主编辑区留出更多横向空间")
	}
	if !strings.Contains(scriptBundle, `function updateProviderKeysInState(`) {
		t.Fatal("期望前端支持本地更新提供商密钥状态，减少整页重载")
	}
	if !strings.Contains(scriptBundle, `function syncGlobalConfigDraft(`) {
		t.Fatal("期望前端具备全局配置草稿同步逻辑")
	}
	if !strings.Contains(scriptBundle, `function syncProviderDraft(`) {
		t.Fatal("期望前端具备提供商表单草稿同步逻辑")
	}
	if !strings.Contains(scriptBundle, `draftProvider.max_disable_secs !== undefined ? draftProvider.max_disable_secs : Number(provider.max_disable_secs || 43200)`) {
		t.Fatal("期望前端使用 43200 作为最大禁用时长默认值")
	}
	if !strings.Contains(apiJS, `function applyBulkKeyAction(`) {
		t.Fatal("期望前端具备批量 Key 操作逻辑")
	}
	if !strings.Contains(string(stylesCSS), `provider-single-panel`) {
		t.Fatal("期望前端使用单提供商聚焦布局")
	}
	if !strings.Contains(string(stylesCSS), `provider-compact-fields`) {
		t.Fatal("期望前端收紧提供商配置布局")
	}
	if !strings.Contains(scriptBundle, `function parseImportedKeysInput(`) {
		t.Fatal("期望前端在提交前先解析导入密钥")
	}
	if !strings.Contains(scriptBundle, `window.confirm`) {
		t.Fatal("期望前端补上危险操作确认")
	}
	if !strings.Contains(scriptBundle, `window.addEventListener("error"`) {
		t.Fatal("期望前端注册全局运行时异常处理")
	}
	if !strings.Contains(scriptBundle, `window.addEventListener("unhandledrejection"`) {
		t.Fatal("期望前端注册未处理 Promise 异常处理")
	}
	if !strings.Contains(scriptBundle, `refs.logModal.addEventListener("keydown"`) {
		t.Fatal("期望只在日志弹窗内处理 Escape 关闭")
	}
	if !strings.Contains(scriptBundle, `const actionHandlers = {`) {
		t.Fatal("期望使用 action 映射表处理面板按钮")
	}
	bulkActionStart := strings.Index(apiJS, `async function applyBulkKeyAction(`)
	if bulkActionStart == -1 {
		t.Fatal("期望前端具备批量 Key 操作逻辑")
	}
	bulkActionBody := apiJS[bulkActionStart:]
	if strings.Contains(bulkActionBody, `await loadAdminOverview();`) {
		t.Fatal("期望批量 Key 操作优先更新前端本地状态，而不是每次整页重载")
	}
	if !strings.Contains(scriptBundle, `await loadStatusOverview();`) || !strings.Contains(scriptBundle, `await loadAdminOverview();`) {
		t.Fatal("期望前端使用总览接口刷新状态和管理数据")
	}
	if strings.Contains(scriptBundle, `status.legendTitle`) || strings.Contains(scriptBundle, `legend.successError`) || strings.Contains(scriptBundle, `status.nextTitle`) {
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
