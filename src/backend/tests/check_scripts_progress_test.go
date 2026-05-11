package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCheckScriptsExposeProgressStages(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	testCases := []struct {
		name     string
		relative string
		fragments []string
	}{
		{
			name:     "powershell",
			relative: filepath.Join("scripts", "check.ps1"),
			fragments: []string{
				"阶段: 后端包测试（非 tests 包）",
				"阶段: 集成测试包 ./tests",
				"阶段: race 集成测试包 ./tests",
				"go list ./...",
				"go test -v -count=1 ./tests",
				"go test -race -v -count=1 ./tests",
			},
		},
		{
			name:     "shell",
			relative: filepath.Join("scripts", "check.sh"),
			fragments: []string{
				"阶段: 后端包测试（非 tests 包）",
				"阶段: 集成测试包 ./tests",
				"阶段: race 集成测试包 ./tests",
				"go list ./...",
				"go test -v -count=1 ./tests",
				"go test -race -v -count=1 ./tests",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			scriptPath := filepath.Join(repoRoot, tc.relative)
			scriptBody, err := os.ReadFile(scriptPath)
			if err != nil {
				t.Fatalf("读取脚本失败: %v", err)
			}

			content := string(scriptBody)
			for _, fragment := range tc.fragments {
				if !strings.Contains(content, fragment) {
					t.Fatalf("期望脚本 %s 包含进度片段 %q", tc.relative, fragment)
				}
			}
		})
	}
}

func TestShellCheckScriptBatchesSlowFrontendBuildTests(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	scriptPath := filepath.Join(repoRoot, "scripts", "check.sh")
	scriptBody, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatalf("读取脚本失败: %v", err)
	}

	content := string(scriptBody)
	for _, fragment := range []string{
		`SLOW_FRONTEND_BUILD_PATTERN='^(TestFrontendBuildFailsWhenTemplateReferencesMissingGeneratedAsset|TestFrontendBuildFailsWhenGeneratedOutputRetainsBuildPlaceholder|TestFrontendBuildWritesManifestWithDetectedLayoutAndAssets|TestFrontendBuildRemovesStaleGeneratedAssets|TestFrontendBuildChangesAssetVersionWhenBuildTimeChanges)$'`,
		`阶段: 慢前端构建集成测试（合并批次）`,
		`go test -timeout "$GO_TEST_TIMEOUT" -v -count=1 -run "$SLOW_FRONTEND_BUILD_PATTERN" ./tests`,
		`go test -timeout "$GO_RACE_TIMEOUT" -race -v -count=1 -skip "$SLOW_FRONTEND_BUILD_PATTERN" ./tests`,
	} {
		if !strings.Contains(content, fragment) {
			t.Fatalf("期望 shell 检查脚本包含慢前端测试批处理片段 %q", fragment)
		}
	}
}
