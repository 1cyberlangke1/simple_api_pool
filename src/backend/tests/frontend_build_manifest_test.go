package tests

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestFrontendBuildFailsWhenTemplateReferencesMissingGeneratedAsset(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	fixtureRoot := prepareFrontendBuildFixture(t, repoRoot)
	seedGeneratedFrontendAssets(t, fixtureRoot, "console.log('ok');", "body{color:#111;}")
	frontendRoot := frontendRootFromRepoRoot(fixtureRoot)

	templatePath := filepath.Join(frontendRoot, "src", "index.template.html")
	templateBody, err := os.ReadFile(templatePath)
	if err != nil {
		t.Fatalf("读取前端模板失败: %v", err)
	}
	templateBody = []byte(strings.Replace(
		string(templateBody),
		`<script src="/assets/app.js?v=__ASSET_VERSION__" defer></script>`,
		"<script src=\"/assets/app.js?v=__ASSET_VERSION__\" defer></script>\n  <script src=\"/assets/missing.js?v=__ASSET_VERSION__\" defer></script>",
		1,
	))
	if err := os.WriteFile(templatePath, templateBody, 0600); err != nil {
		t.Fatalf("写入前端模板失败: %v", err)
	}

	command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot, "-skip-bundle")
	command.Env = append(os.Environ(),
		"APP_VERSION=v-test",
		"APP_REVISION=abc1234",
		"APP_BUILD_TIME=2026-05-09T01:02:03Z",
	)
	output, err := command.CombinedOutput()
	if err == nil {
		t.Fatalf("期望构建在模板引用未生成资源时失败，实际成功。\n%s", string(output))
	}
}

func TestFrontendBuildFailsWhenGeneratedOutputRetainsBuildPlaceholder(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	fixtureRoot := prepareFrontendBuildFixture(t, repoRoot)
	seedGeneratedFrontendAssets(t, fixtureRoot, "console.log('ok');", ".placeholder-check{color:__APP_VERSION__;}")

	command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot, "-skip-bundle")
	command.Env = append(os.Environ(),
		"APP_VERSION=v-test",
		"APP_REVISION=abc1234",
		"APP_BUILD_TIME=2026-05-09T01:02:03Z",
	)
	output, err := command.CombinedOutput()
	if err == nil {
		t.Fatalf("期望构建在产物残留占位符时失败，实际成功。\n%s", string(output))
	}
}

func TestFrontendBuildWritesManifestWithDetectedLayoutAndAssets(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	fixtureRoot := prepareFrontendBuildFixture(t, repoRoot)
	if !reuseFrontendBuildOutputs(t, repoRoot, fixtureRoot) {
		command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot)
		command.Env = append(os.Environ(),
			"APP_VERSION=v-test",
			"APP_REVISION=abc1234",
			"APP_BUILD_TIME=2026-05-09T01:02:03Z",
		)
		output, err := command.CombinedOutput()
		if err != nil {
			t.Fatalf("运行前端构建失败: %v\n%s", err, string(output))
		}
		persistFrontendBuildOutputsToCache(t, repoRoot, fixtureRoot)
	}

	frontendRoot := frontendRootFromRepoRoot(fixtureRoot)
	manifestPath := filepath.Join(frontendRoot, "assets", "build-manifest.json")
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("读取构建清单失败: %v", err)
	}

	var manifest struct {
		FrontendRoot string   `json:"frontend_root"`
		SourceDir    string   `json:"source_dir"`
		Assets       []string `json:"assets"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("解析构建清单失败: %v", err)
	}

	expectedRoot := filepath.ToSlash(frontendRelativeRootFromRepoRoot(fixtureRoot))
	if manifest.FrontendRoot != expectedRoot {
		t.Fatalf("期望 frontend_root 为 %q，实际是 %q", expectedRoot, manifest.FrontendRoot)
	}
	if manifest.SourceDir != expectedRoot+"/src" {
		t.Fatalf("期望 source_dir 为 %q，实际是 %q", expectedRoot+"/src", manifest.SourceDir)
	}

	expectedAssets := []string{
		"/assets/app.js",
		"/assets/styles.css",
	}
	for _, assetPath := range expectedAssets {
		if !sliceContains(manifest.Assets, assetPath) {
			t.Fatalf("期望构建清单包含资源 %q，实际是 %+v", assetPath, manifest.Assets)
		}
		if _, err := os.Stat(filepath.Join(frontendRoot, strings.TrimPrefix(filepath.FromSlash(assetPath), string(filepath.Separator)))); err != nil {
			t.Fatalf("期望资源 %q 已生成到磁盘: %v", assetPath, err)
		}
	}

	if len(manifest.Assets) != len(expectedAssets) {
		t.Fatalf("期望构建清单仅包含单 bundle 契约资源，实际是 %+v", manifest.Assets)
	}
	if !sort.StringsAreSorted(manifest.Assets) {
		t.Fatalf("期望构建清单内资源按字典序排序，实际是 %+v", manifest.Assets)
	}
}

func TestFrontendBuildRemovesStaleGeneratedAssets(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	fixtureRoot := prepareFrontendBuildFixture(t, repoRoot)
	frontendRoot := frontendRootFromRepoRoot(fixtureRoot)
	seedGeneratedFrontendAssets(t, fixtureRoot, "console.log('ok');", "body{color:#111;}")
	staleAssetPath := filepath.Join(frontendRoot, "assets", "stale.js")
	if err := os.MkdirAll(filepath.Dir(staleAssetPath), 0700); err != nil {
		t.Fatalf("创建陈旧资源目录失败: %v", err)
	}
	if err := os.WriteFile(staleAssetPath, []byte("stale"), 0600); err != nil {
		t.Fatalf("写入陈旧资源失败: %v", err)
	}

	command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot, "-skip-bundle")
	command.Env = append(os.Environ(),
		"APP_VERSION=v-test",
		"APP_REVISION=abc1234",
		"APP_BUILD_TIME=2026-05-09T01:02:03Z",
	)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("运行前端构建失败: %v\n%s", err, string(output))
	}

	if _, err := os.Stat(staleAssetPath); !os.IsNotExist(err) {
		t.Fatalf("期望陈旧资源被清理，当前状态 err=%v", err)
	}
}

func sliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
