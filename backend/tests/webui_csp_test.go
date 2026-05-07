package tests

import (
	"crypto/sha256"
	"encoding/base64"
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
}

func sha256Base64(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.StdEncoding.EncodeToString(sum[:])
}
