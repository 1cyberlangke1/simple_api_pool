package tests

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestFrontendDisableDurationCapabilitiesExistInBundle(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("读取测试文件路径失败")
	}
	frontendRoot := frontendRootFromRepoRoot(filepath.Join(filepath.Dir(thisFile), "..", ".."))
	indexHTMLBytes, err := os.ReadFile(filepath.Join(frontendRoot, "index.html"))
	if err != nil {
		t.Fatalf("读取前端首页失败: %v", err)
	}
	appBundleBytes, err := os.ReadFile(filepath.Join(frontendRoot, "assets", "app.js"))
	if err != nil {
		t.Fatalf("读取前端 bundle 失败: %v", err)
	}

	indexHTML := string(indexHTMLBytes)
	appBundle := string(appBundleBytes)

	mustContain(t, indexHTML, `<script src="/assets/app.js?v=`)

	for _, requiredMarker := range []string{
		"disable_until",
		"disable_forever",
		"bulk-disable-seconds",
		"bulk-disable-mode",
		"min_disable_secs",
		"max_disable_secs",
		"parseImportedKeys",
		"splitImportedKeys",
		"每行一个，或用半角逗号分隔",
	} {
		if !strings.Contains(appBundle, requiredMarker) {
			t.Fatalf("期望前端 bundle 保留定时禁用或批量导入能力标记 %q", requiredMarker)
		}
	}

	if strings.Contains(appBundle, `/\s+/`) {
		t.Fatal("期望前端导入 key 不再把空格当作分隔符")
	}
}
