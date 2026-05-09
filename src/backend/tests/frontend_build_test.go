package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFrontendBuildChangesAssetVersionWhenBuildTimeChanges(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)

	firstBuildRoot := prepareFrontendBuildFixture(t, repoRoot)
	secondBuildRoot := prepareFrontendBuildFixture(t, repoRoot)

	firstVersion := runFrontendBuildAndReadAssetVersion(t, firstBuildRoot, "v-test", "abc1234", "2026-05-08T13:00:00Z")
	secondVersion := runFrontendBuildAndReadAssetVersion(t, secondBuildRoot, "v-test", "abc1234", "2026-05-08T13:00:01Z")

	if firstVersion == secondVersion {
		t.Fatalf("期望不同构建时间产生不同静态资源版本号，避免浏览器继续命中旧缓存；当前两次都是 %q", firstVersion)
	}
}

func repoRootFromTestFile(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("读取测试文件路径失败")
	}
	currentDir := filepath.Dir(thisFile)
	for {
		if _, err := os.Stat(filepath.Join(currentDir, "scripts", "build_frontend.go")); err == nil {
			return currentDir
		}
		parentDir := filepath.Dir(currentDir)
		if parentDir == currentDir {
			t.Fatal("未找到仓库根目录")
		}
		currentDir = parentDir
	}
}

func frontendRootFromRepoRoot(repoRoot string) string {
	candidates := []string{
		filepath.Join(repoRoot, "src", "frontend"),
		filepath.Join(repoRoot, "frontend"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "src", "index.template.html")); err == nil {
			return candidate
		}
	}
	return candidates[len(candidates)-1]
}

func frontendRelativeRootFromRepoRoot(repoRoot string) string {
	candidates := []string{
		filepath.Join("src", "frontend"),
		"frontend",
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(repoRoot, candidate, "src", "index.template.html")); err == nil {
			return candidate
		}
	}
	return candidates[len(candidates)-1]
}

func backendRootFromRepoRoot(repoRoot string) string {
	candidates := []string{
		filepath.Join(repoRoot, "src", "backend"),
		filepath.Join(repoRoot, "backend"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "go.mod")); err == nil {
			return candidate
		}
	}
	return candidates[len(candidates)-1]
}

func prepareFrontendBuildFixture(t *testing.T, repoRoot string) string {
	t.Helper()
	fixtureRoot := t.TempDir()
	relativeRoot := frontendRelativeRootFromRepoRoot(repoRoot)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	copyTree(t, filepath.Join(frontendRootFromRepoRoot(repoRoot), "src"), filepath.Join(fixtureRoot, relativeRoot, "src"))
	copyFile(t, filepath.Join(frontendRoot, "build.mjs"), filepath.Join(fixtureRoot, relativeRoot, "build.mjs"))
	copyFile(t, filepath.Join(frontendRoot, "package.json"), filepath.Join(fixtureRoot, relativeRoot, "package.json"))
	copyFile(t, filepath.Join(frontendRoot, "package-lock.json"), filepath.Join(fixtureRoot, relativeRoot, "package-lock.json"))
	copyTree(t, filepath.Join(repoRoot, "scripts"), filepath.Join(fixtureRoot, "scripts"))
	return fixtureRoot
}

func runFrontendBuildAndReadAssetVersion(t *testing.T, fixtureRoot string, version string, revision string, buildTime string) string {
	t.Helper()
	command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot)
	command.Env = append(os.Environ(),
		"APP_VERSION="+version,
		"APP_REVISION="+revision,
		"APP_BUILD_TIME="+buildTime,
	)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("运行前端构建失败: %v\n%s", err, string(output))
	}

	indexHTMLBytes, err := os.ReadFile(filepath.Join(frontendRootFromRepoRoot(fixtureRoot), "index.html"))
	if err != nil {
		t.Fatalf("读取构建后的前端入口页失败: %v", err)
	}
	return extractSingleFrontendAssetVersion(t, string(indexHTMLBytes))
}

func copyTree(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()
	walkErr := filepath.Walk(sourceRoot, func(sourcePath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(sourceRoot, sourcePath)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(targetRoot, relativePath)
		if info.IsDir() {
			return os.MkdirAll(targetPath, 0700)
		}
		content, err := os.ReadFile(sourcePath)
		if err != nil {
			return err
		}
		return os.WriteFile(targetPath, content, 0600)
	})
	if walkErr != nil {
		t.Fatalf("复制测试夹具失败: %v", walkErr)
	}
}

func copyFile(t *testing.T, sourcePath string, targetPath string) {
	t.Helper()
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("读取文件 %s 失败: %v", sourcePath, err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0700); err != nil {
		t.Fatalf("创建目录 %s 失败: %v", filepath.Dir(targetPath), err)
	}
	if err := os.WriteFile(targetPath, content, 0600); err != nil {
		t.Fatalf("写入文件 %s 失败: %v", targetPath, err)
	}
}
