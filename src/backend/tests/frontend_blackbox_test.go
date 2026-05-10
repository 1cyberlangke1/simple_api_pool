package tests

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

var frontendGeneratedAssetPaths = []string{
	"/assets/app.js",
	"/assets/styles.css",
}

func TestStatusAndAdminPagesServeSingleBundleFrontend(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("读取测试文件路径失败")
	}
	frontendRoot := frontendRootFromRepoRoot(filepath.Join(filepath.Dir(thisFile), "..", ".."))
	indexPath := filepath.Join(frontendRoot, "index.html")
	appBundlePath := filepath.Join(frontendRoot, "assets", "app.js")
	stylesPath := filepath.Join(frontendRoot, "assets", "styles.css")
	faviconPath := filepath.Join(frontendRoot, "favicon.svg")

	indexHTMLBytes, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("读取前端首页失败: %v", err)
	}
	appBundleBytes, err := os.ReadFile(appBundlePath)
	if err != nil {
		t.Fatalf("读取前端 bundle 失败: %v", err)
	}
	stylesCSSBytes, err := os.ReadFile(stylesPath)
	if err != nil {
		t.Fatalf("读取前端样式失败: %v", err)
	}
	faviconSVG, err := os.ReadFile(faviconPath)
	if err != nil {
		t.Fatalf("读取 favicon 失败: %v", err)
	}

	indexHTML := string(indexHTMLBytes)
	appBundle := string(appBundleBytes)
	stylesCSS := string(stylesCSSBytes)

	for _, unexpectedAsset := range []string{
		"/assets/core.js",
		"/assets/boot.js",
		"/assets/state.js",
		"/assets/views/status_view.js",
		"/assets/features/providers/provider_events.js",
	} {
		if strings.Contains(indexHTML, unexpectedAsset) {
			t.Fatalf("期望首页不再引用旧多脚本资源 %q", unexpectedAsset)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/", "/status", "/admin":
			http.ServeFile(w, r, indexPath)
		case "/assets/app.js":
			http.ServeFile(w, r, appBundlePath)
		case "/assets/styles.css":
			http.ServeFile(w, r, stylesPath)
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

		mustContain(t, body, `<div id="app-root"></div>`)
		mustContain(t, body, `rel="icon" type="image/svg+xml" href="/favicon.svg"`)
		mustContain(t, body, `rel="stylesheet" href="/assets/styles.css?v=`)
		mustContain(t, body, `<script src="/assets/app.js?v=`)

		if strings.Contains(body, "__APP_VERSION__") || strings.Contains(body, "__APP_REVISION__") || strings.Contains(body, "__APP_BUILD_TIME__") || strings.Contains(body, "__ASSET_VERSION__") {
			t.Fatalf("期望页面 %s 的构建占位符已全部注入", path)
		}
		if strings.Contains(body, "<style>") || strings.Contains(body, "<script>") {
			t.Fatalf("期望页面 %s 不内联整块样式或脚本", path)
		}
	}

	assetVersion := extractSingleFrontendAssetVersion(t, indexHTML)
	if assetVersion == "" {
		t.Fatal("期望前端入口页带统一静态资源版本号")
	}

	if len(appBundleBytes) == 0 {
		t.Fatal("期望前端 bundle 非空")
	}
	if len(stylesCSSBytes) == 0 {
		t.Fatal("期望前端样式非空")
	}
	if !strings.Contains(string(faviconSVG), `<svg`) {
		t.Fatal("期望 favicon 为可渲染 SVG")
	}

	for _, requiredPath := range []string{
		"/api/status/bootstrap",
		"/api/status/stream",
		"/api/admin/bootstrap",
		"/api/admin/stream",
		"/api/admin/login",
		"/api/admin/logout",
		"/api/admin/config",
		"/api/admin/providers/",
		"same-origin",
		"stats_delta",
		"log_append",
		"providers_changed",
		"global_config_changed",
		"resync_required",
		"disable_until",
		"parseImportedKeys",
		"hidePanelLogs",
	} {
		if !strings.Contains(appBundle, requiredPath) {
			t.Fatalf("期望前端 bundle 保留能力标记 %q", requiredPath)
		}
	}
	for _, forbiddenRuntimeReference := range []string{
		"process.env.NODE_ENV",
		"process.env.",
	} {
		if strings.Contains(appBundle, forbiddenRuntimeReference) {
			t.Fatalf("期望浏览器 bundle 不残留 Node 运行时引用 %q", forbiddenRuntimeReference)
		}
	}

	for _, requiredStyle := range []string{
		".app-shell",
		".status-grid",
		".provider-layout",
		".log-modal",
	} {
		if !strings.Contains(stylesCSS, requiredStyle) {
			t.Fatalf("期望前端样式包含 %q", requiredStyle)
		}
	}
}

func TestFrontendBuildManifestMatchesSingleBundleLayout(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	manifestPath := filepath.Join(frontendRoot, "assets", "build-manifest.json")
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("读取前端构建清单失败: %v", err)
	}

	var manifest struct {
		FrontendRoot string   `json:"frontend_root"`
		SourceDir    string   `json:"source_dir"`
		Assets       []string `json:"assets"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("解析前端构建清单失败: %v", err)
	}

	expectedRoot := filepath.ToSlash(frontendRelativeRootFromRepoRoot(repoRoot))
	if manifest.FrontendRoot != expectedRoot {
		t.Fatalf("期望 frontend_root 为 %q，实际是 %q", expectedRoot, manifest.FrontendRoot)
	}
	if manifest.SourceDir != expectedRoot+"/src" {
		t.Fatalf("期望 source_dir 为 %q，实际是 %q", expectedRoot+"/src", manifest.SourceDir)
	}

	for _, assetPath := range frontendGeneratedAssetPaths {
		if !sliceContains(manifest.Assets, assetPath) {
			t.Fatalf("期望构建清单包含 %q，实际是 %+v", assetPath, manifest.Assets)
		}
		assetDiskPath := filepath.Join(frontendRoot, strings.TrimPrefix(filepath.FromSlash(assetPath), string(filepath.Separator)))
		if _, err := os.Stat(assetDiskPath); err != nil {
			t.Fatalf("期望构建清单中的资源存在于磁盘 %q: %v", assetPath, err)
		}
	}

	if len(manifest.Assets) != len(frontendGeneratedAssetPaths) {
		t.Fatalf("期望构建清单仅包含单 bundle 契约资源，实际为 %+v", manifest.Assets)
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

func extractSingleFrontendAssetVersion(t *testing.T, indexHTML string) string {
	t.Helper()
	pattern := regexp.MustCompile(`(?:href|src)="[^"]+\?v=([^"]+)"`)
	matches := pattern.FindAllStringSubmatch(indexHTML, -1)
	if len(matches) == 0 {
		t.Fatal("期望前端入口页为静态资源附带版本号")
	}
	version := matches[0][1]
	for _, match := range matches[1:] {
		if match[1] != version {
			t.Fatalf("期望同一份前端入口页中的静态资源版本号保持一致，实际发现 %q 和 %q", version, match[1])
		}
	}
	return version
}
