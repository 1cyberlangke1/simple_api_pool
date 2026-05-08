package tests

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"simple-api-pool/webui"
)

func TestBuildContentSecurityPolicyUsesExactInlineBlockBytes(t *testing.T) {
	tempDir := t.TempDir()
	indexHTML := `<!DOCTYPE html>
<html>
<head>
  <style>
body { color: red; }
  </style>
</head>
<body>
  <script>
console.log("hello");
  </script>
</body>
</html>
`
	indexPath := filepath.Join(tempDir, "index.html")
	if err := os.WriteFile(indexPath, []byte(indexHTML), 0600); err != nil {
		t.Fatalf("写入测试首页失败: %v", err)
	}

	csp, err := webui.BuildContentSecurityPolicy(tempDir)
	if err != nil {
		t.Fatalf("构建 CSP 失败: %v", err)
	}

	exactScriptBody := "\nconsole.log(\"hello\");\n  "
	trimmedScriptBody := strings.TrimSpace(exactScriptBody)
	exactStyleBody := "\nbody { color: red; }\n  "
	trimmedStyleBody := strings.TrimSpace(exactStyleBody)

	exactScriptHash := sha256Base64(exactScriptBody)
	trimmedScriptHash := sha256Base64(trimmedScriptBody)
	exactStyleHash := sha256Base64(exactStyleBody)
	trimmedStyleHash := sha256Base64(trimmedStyleBody)

	mustContain(t, csp, "'sha256-"+exactScriptHash+"'")
	mustContain(t, csp, "'sha256-"+exactStyleHash+"'")
	if strings.Contains(csp, "'sha256-"+trimmedScriptHash+"'") {
		t.Fatal("期望脚本 hash 按原始内联内容计算，不能使用裁剪后的内容")
	}
	if strings.Contains(csp, "'sha256-"+trimmedStyleHash+"'") {
		t.Fatal("期望样式 hash 按原始内联内容计算，不能使用裁剪后的内容")
	}
	mustContain(t, csp, "script-src 'self' https://static.cloudflareinsights.com")
	mustContain(t, csp, "connect-src 'self' https://cloudflareinsights.com")
}

func TestServeAssetRejectsPathTraversal(t *testing.T) {
	frontendRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(frontendRoot, "favicon.svg"), []byte(`<svg></svg>`), 0600); err != nil {
		t.Fatalf("写入测试资源失败: %v", err)
	}
	if err := os.WriteFile(filepath.Join(t.TempDir(), "secret.txt"), []byte("secret"), 0600); err != nil {
		t.Fatalf("写入旁路文件失败: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/favicon.svg", nil)
	rec := httptest.NewRecorder()
	webui.ServeAsset(rec, req, frontendRoot, filepath.Join("..", "secret.txt"))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("目录逃逸请求期望状态码 %d，实际是 %d，响应体: %s", http.StatusNotFound, rec.Code, rec.Body.String())
	}
}

func TestServeAssetSetsImmutableCacheControl(t *testing.T) {
	frontendRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(frontendRoot, "favicon.svg"), []byte(`<svg></svg>`), 0600); err != nil {
		t.Fatalf("写入测试资源失败: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/favicon.svg", nil)
	rec := httptest.NewRecorder()
	webui.ServeAsset(rec, req, frontendRoot, "favicon.svg")

	if rec.Code != http.StatusOK {
		t.Fatalf("请求静态资源期望状态码 %d，实际是 %d，响应体: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("静态资源期望设置长期缓存头，实际是 %q", got)
	}
}

func sha256Base64(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.StdEncoding.EncodeToString(sum[:])
}
