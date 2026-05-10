package tests

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"
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
	relativeRoot := frontendRelativeRootFromRepoRoot(repoRoot)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	fixtureRoot := newFrontendBuildFixtureRoot(t, frontendRoot)
	copyTree(t, filepath.Join(frontendRootFromRepoRoot(repoRoot), "src"), filepath.Join(fixtureRoot, relativeRoot, "src"))
	copyFile(t, filepath.Join(frontendRoot, "build.mjs"), filepath.Join(fixtureRoot, relativeRoot, "build.mjs"))
	copyFile(t, filepath.Join(frontendRoot, "package.json"), filepath.Join(fixtureRoot, relativeRoot, "package.json"))
	copyFile(t, filepath.Join(frontendRoot, "package-lock.json"), filepath.Join(fixtureRoot, relativeRoot, "package-lock.json"))
	copyTree(t, filepath.Join(repoRoot, "scripts"), filepath.Join(fixtureRoot, "scripts"))
	return fixtureRoot
}

func newFrontendBuildFixtureRoot(t *testing.T, frontendRoot string) string {
	t.Helper()

	installMarkerPath := filepath.Join(frontendRoot, "node_modules", "vite", "package.json")
	if _, err := os.Stat(installMarkerPath); err == nil {
		fixtureParent := filepath.Join(frontendRoot, "node_modules", ".frontend-build-fixtures")
		if err := os.MkdirAll(fixtureParent, 0700); err == nil {
			fixtureRoot, err := os.MkdirTemp(fixtureParent, "build-*")
			if err == nil {
				t.Cleanup(func() {
					_ = os.RemoveAll(fixtureRoot)
				})
				return fixtureRoot
			}
		}
	}

	return t.TempDir()
}

func runFrontendBuildAndReadAssetVersion(t *testing.T, fixtureRoot string, version string, revision string, buildTime string) string {
	t.Helper()
	seedGeneratedFrontendAssets(t, fixtureRoot, "console.log('ok');", "body{color:#111;}")
	command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot, "-skip-bundle")
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

func reuseFrontendBuildOutputs(t *testing.T, repoRoot string, fixtureRoot string) bool {
	t.Helper()

	if repositoryBuildOutputsAreFresh(t, repoRoot) {
		copyFrontendBuildOutputs(t, frontendRootFromRepoRoot(repoRoot), frontendRootFromRepoRoot(fixtureRoot))
		persistFrontendBuildOutputsToCache(t, repoRoot, fixtureRoot)
		return true
	}

	cacheKey, err := computeFrontendBuildCacheKey(repoRoot)
	if err != nil {
		t.Fatalf("计算前端构建缓存键失败: %v", err)
	}

	cacheRoot := filepath.Join(repoRoot, "local-logs", "frontend-build-cache", cacheKey)
	cacheFrontendRoot := filepath.Join(cacheRoot, frontendRelativeRootFromRepoRoot(repoRoot))
	if !frontendBuildOutputsExist(cacheFrontendRoot) {
		return false
	}

	copyFrontendBuildOutputs(t, cacheFrontendRoot, frontendRootFromRepoRoot(fixtureRoot))
	return true
}

func persistFrontendBuildOutputsToCache(t *testing.T, repoRoot string, fixtureRoot string) {
	t.Helper()

	cacheKey, err := computeFrontendBuildCacheKey(repoRoot)
	if err != nil {
		t.Logf("跳过前端构建缓存写入，计算缓存键失败: %v", err)
		return
	}

	cacheRoot := filepath.Join(repoRoot, "local-logs", "frontend-build-cache", cacheKey)
	cacheFrontendRoot := filepath.Join(cacheRoot, frontendRelativeRootFromRepoRoot(repoRoot))
	if err := os.MkdirAll(cacheFrontendRoot, 0700); err != nil {
		t.Logf("跳过前端构建缓存写入，创建缓存目录失败: %v", err)
		return
	}

	copyFrontendBuildOutputs(t, frontendRootFromRepoRoot(fixtureRoot), cacheFrontendRoot)
}

func repositoryBuildOutputsAreFresh(t *testing.T, repoRoot string) bool {
	t.Helper()

	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	if !frontendBuildOutputsExist(frontendRoot) {
		return false
	}

	inputFiles, err := frontendBuildInputFiles(repoRoot)
	if err != nil {
		t.Fatalf("收集前端构建输入失败: %v", err)
	}

	var latestInputTime time.Time
	for _, inputFile := range inputFiles {
		info, err := os.Stat(inputFile)
		if err != nil {
			t.Fatalf("读取前端构建输入状态失败: %v", err)
		}
		if info.ModTime().After(latestInputTime) {
			latestInputTime = info.ModTime()
		}
	}

	var earliestOutputTime time.Time
	for index, relativePath := range frontendBuildOutputFiles() {
		info, err := os.Stat(filepath.Join(frontendRoot, relativePath))
		if err != nil {
			t.Fatalf("读取前端构建产物状态失败: %v", err)
		}
		if index == 0 || info.ModTime().Before(earliestOutputTime) {
			earliestOutputTime = info.ModTime()
		}
	}

	return !earliestOutputTime.Before(latestInputTime)
}

func frontendBuildOutputsExist(frontendRoot string) bool {
	for _, relativePath := range frontendBuildOutputFiles() {
		if _, err := os.Stat(filepath.Join(frontendRoot, relativePath)); err != nil {
			return false
		}
	}
	return true
}

func copyFrontendBuildOutputs(t *testing.T, sourceFrontendRoot string, targetFrontendRoot string) {
	t.Helper()

	for _, relativePath := range frontendBuildOutputFiles() {
		copyFile(t, filepath.Join(sourceFrontendRoot, relativePath), filepath.Join(targetFrontendRoot, relativePath))
	}
}

func frontendBuildOutputFiles() []string {
	return []string{
		"index.html",
		filepath.Join("assets", "app.js"),
		filepath.Join("assets", "styles.css"),
		filepath.Join("assets", "build-manifest.json"),
	}
}

func computeFrontendBuildCacheKey(repoRoot string) (string, error) {
	inputFiles, err := frontendBuildInputFiles(repoRoot)
	if err != nil {
		return "", err
	}

	sort.Strings(inputFiles)
	hash := sha256.New()
	for _, inputFile := range inputFiles {
		relativePath, err := filepath.Rel(repoRoot, inputFile)
		if err != nil {
			return "", err
		}
		hash.Write([]byte(filepath.ToSlash(relativePath)))
		hash.Write([]byte{0})

		content, err := os.ReadFile(inputFile)
		if err != nil {
			return "", err
		}
		hash.Write(content)
		hash.Write([]byte{0})
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

func frontendBuildInputFiles(repoRoot string) ([]string, error) {
	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	inputFiles := []string{
		filepath.Join(repoRoot, "scripts", "build_frontend.go"),
		filepath.Join(frontendRoot, "build.mjs"),
		filepath.Join(frontendRoot, "package.json"),
		filepath.Join(frontendRoot, "package-lock.json"),
	}

	sourceRoot := filepath.Join(frontendRoot, "src")
	err := filepath.Walk(sourceRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		inputFiles = append(inputFiles, path)
		return nil
	})
	if err != nil {
		return nil, err
	}

	return inputFiles, nil
}

func seedGeneratedFrontendAssets(t *testing.T, fixtureRoot string, appBundle string, styleBundle string) {
	t.Helper()

	frontendRoot := frontendRootFromRepoRoot(fixtureRoot)
	assetsDir := filepath.Join(frontendRoot, "assets")
	if err := os.MkdirAll(assetsDir, 0700); err != nil {
		t.Fatalf("创建前端资源目录失败: %v", err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "app.js"), []byte(appBundle), 0600); err != nil {
		t.Fatalf("写入前端脚本资源失败: %v", err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "styles.css"), []byte(styleBundle), 0600); err != nil {
		t.Fatalf("写入前端样式资源失败: %v", err)
	}
}
