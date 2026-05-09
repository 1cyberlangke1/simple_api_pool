package tests

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestFrontendDisableDurationBlackbox(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("读取测试文件路径失败")
	}
	frontendRoot := frontendRootFromRepoRoot(filepath.Join(filepath.Dir(thisFile), "..", ".."))
	indexHTMLBytes, err := os.ReadFile(filepath.Join(frontendRoot, "index.html"))
	if err != nil {
		t.Fatalf("读取前端首页失败: %v", err)
	}

	assetPaths := []string{
		"/assets/features/providers/disable_duration_model.js",
		"/assets/features/providers/provider_actions.js",
		"/assets/features/providers/provider_renderer.js",
		"/assets/features/providers/key_panel_view.js",
		"/assets/features/providers/config_panel_view.js",
		"/assets/features/providers/provider_form_state.js",
		"/assets/features/providers/provider_events.js",
	}
	indexHTML := string(indexHTMLBytes)
	var scriptBundle strings.Builder
	for _, assetPath := range assetPaths {
		assetDiskPath := filepath.Join(frontendRoot, strings.TrimPrefix(filepath.FromSlash(assetPath), string(filepath.Separator)))
		assetBody, readErr := os.ReadFile(assetDiskPath)
		if readErr != nil {
			t.Fatalf("读取前端特性脚本 %s 失败: %v", assetPath, readErr)
		}
		scriptBundle.Write(assetBody)
		scriptBundle.WriteString("\n")
		mustContain(t, indexHTML, `<script src="`+assetPath+`?v=`)
	}

	combinedScripts := scriptBundle.String()
	if !strings.Contains(combinedScripts, `disable_until`) {
		t.Fatal("期望前端特性脚本包含定时禁用动作")
	}
	if !strings.Contains(combinedScripts, `state.bulkKeyActionModeByProvider[providerName] = "disable_until";`) {
		t.Fatal("期望前端默认按时长禁用，而不是默认永久禁用")
	}
	if !strings.Contains(combinedScripts, `bulk-disable-seconds`) {
		t.Fatal("期望前端渲染定时禁用秒数输入")
	}
	if !strings.Contains(combinedScripts, `bulk-disable-mode`) {
		t.Fatal("期望前端渲染批量禁用模式选择器")
	}
	if !strings.Contains(combinedScripts, `getBulkDisableBounds(providerName)`) {
		t.Fatal("期望前端按当前提供商的禁用范围约束时长输入")
	}
	if !strings.Contains(combinedScripts, `admin.bulkDisableRange`) {
		t.Fatal("期望前端展示当前禁用时长可选范围")
	}
}
