package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestFrontendBuildReinstallsDependenciesWhenInstalledModulesAreNotLoadableOnCurrentPlatform(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	fixtureRoot := prepareFrontendBuildFixture(t, repoRoot)
	frontendRoot := frontendRootFromRepoRoot(fixtureRoot)

	installMarkerPath := filepath.Join(frontendRoot, "node_modules", "vite", "package.json")
	if err := os.MkdirAll(filepath.Dir(installMarkerPath), 0700); err != nil {
		t.Fatalf("创建前端依赖标记目录失败: %v", err)
	}
	if err := os.WriteFile(installMarkerPath, []byte("{}\n"), 0600); err != nil {
		t.Fatalf("写入前端依赖标记失败: %v", err)
	}
	staleDependencyTime := time.Now().Add(2 * time.Minute)
	if err := os.Chtimes(installMarkerPath, staleDependencyTime, staleDependencyTime); err != nil {
		t.Fatalf("调整前端依赖标记时间失败: %v", err)
	}

	fakeBinDir := filepath.Join(fixtureRoot, "fake-bin")
	if err := os.MkdirAll(fakeBinDir, 0700); err != nil {
		t.Fatalf("创建伪造命令目录失败: %v", err)
	}

	npmInstallMarkerName := "npm-ci-ran.txt"
	npmInstallMarkerPath := filepath.Join(frontendRoot, npmInstallMarkerName)
	writeFakeNodeBinary(t, fakeBinDir)
	writeFakeNpmBinary(t, fakeBinDir, npmInstallMarkerName)

	command := exec.Command("go", "run", filepath.Join(fixtureRoot, "scripts", "build_frontend.go"), "-root", fixtureRoot)
	command.Env = append(os.Environ(),
		"PATH="+prependToPath(fakeBinDir),
		"APP_VERSION=v-test",
		"APP_REVISION=abc1234",
		"APP_BUILD_TIME=2026-05-11T02:03:04Z",
	)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("运行前端构建失败: %v\n%s", err, string(output))
	}

	if _, err := os.Stat(npmInstallMarkerPath); err != nil {
		t.Fatalf("期望依赖探测失败后重新执行 npm ci，实际未执行: %v\n%s", err, string(output))
	}
	if _, err := os.Stat(filepath.Join(frontendRoot, "assets", "app.js")); err != nil {
		t.Fatalf("期望前端脚本资源已生成: %v", err)
	}
	if _, err := os.Stat(filepath.Join(frontendRoot, "assets", "styles.css")); err != nil {
		t.Fatalf("期望前端样式资源已生成: %v", err)
	}
}

func writeFakeNodeBinary(t *testing.T, binDir string) {
	t.Helper()

	var scriptName string
	var scriptBody string
	if runtime.GOOS == "windows" {
		scriptName = "node.cmd"
		scriptBody = "@echo off\r\n" +
			"if \"%~1\"==\"-e\" exit /b 1\r\n" +
			"if \"%~1\"==\"build.mjs\" (\r\n" +
			"  if not exist assets mkdir assets\r\n" +
			"  > assets\\app.js echo console.log('ok');\r\n" +
			"  > assets\\styles.css echo body{color:#111;}\r\n" +
			"  exit /b 0\r\n" +
			")\r\n" +
			"echo unexpected node args %* 1>&2\r\n" +
			"exit /b 1\r\n"
	} else {
		scriptName = "node"
		scriptBody = "#!/usr/bin/env sh\n" +
			"set -eu\n" +
			"if [ \"$1\" = \"-e\" ]; then\n" +
			"  exit 1\n" +
			"fi\n" +
			"if [ \"$1\" = \"build.mjs\" ]; then\n" +
			"  mkdir -p assets\n" +
			"  printf \"console.log('ok');\\n\" > assets/app.js\n" +
			"  printf \"body{color:#111;}\\n\" > assets/styles.css\n" +
			"  exit 0\n" +
			"fi\n" +
			"echo \"unexpected node args: $*\" >&2\n" +
			"exit 1\n"
	}

	writeExecutableFile(t, filepath.Join(binDir, scriptName), scriptBody)
}

func writeFakeNpmBinary(t *testing.T, binDir string, installMarkerName string) {
	t.Helper()

	var scriptName string
	var scriptBody string
	if runtime.GOOS == "windows" {
		scriptName = "npm.cmd"
		scriptBody = "@echo off\r\n" +
			"if \"%~1\"==\"ci\" (\r\n" +
			"  if not exist node_modules\\vite mkdir node_modules\\vite\r\n" +
			"  > node_modules\\vite\\package.json echo {}\r\n" +
			"  > \"" + installMarkerName + "\" echo ran\r\n" +
			"  exit /b 0\r\n" +
			")\r\n" +
			"echo unexpected npm args %* 1>&2\r\n" +
			"exit /b 1\r\n"
	} else {
		scriptName = "npm"
		scriptBody = "#!/usr/bin/env sh\n" +
			"set -eu\n" +
			"if [ \"$1\" = \"ci\" ]; then\n" +
			"  mkdir -p node_modules/vite\n" +
			"  printf '{}\\n' > node_modules/vite/package.json\n" +
			"  printf 'ran\\n' > \"" + installMarkerName + "\"\n" +
			"  exit 0\n" +
			"fi\n" +
			"echo \"unexpected npm args: $*\" >&2\n" +
			"exit 1\n"
	}

	writeExecutableFile(t, filepath.Join(binDir, scriptName), scriptBody)
}

func writeExecutableFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0700); err != nil {
		t.Fatalf("写入可执行测试文件 %s 失败: %v", path, err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(path, 0700); err != nil {
			t.Fatalf("设置可执行权限失败: %v", err)
		}
	}
}

func prependToPath(path string) string {
	currentPath := os.Getenv("PATH")
	if currentPath == "" {
		return path
	}
	return path + string(os.PathListSeparator) + currentPath
}
