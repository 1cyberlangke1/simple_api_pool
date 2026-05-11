package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFrontendPackageUsesViteReactStack(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	packageJSONPath := filepath.Join(frontendRoot, "package.json")
	packageJSONBytes, err := os.ReadFile(packageJSONPath)
	if err != nil {
		t.Fatalf("读取前端 package.json 失败: %v", err)
	}

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(packageJSONBytes, &pkg); err != nil {
		t.Fatalf("解析前端 package.json 失败: %v", err)
	}

	requiredDependencies := []string{
		"react",
		"react-dom",
		"react-router-dom",
		"framer-motion",
		"lucide-react",
		"zustand",
		"clsx",
		"tailwind-merge",
		"class-variance-authority",
		"@lobehub/icons",
		"valibot",
		"@radix-ui/react-dialog",
		"@radix-ui/react-select",
		"@radix-ui/react-slot",
		"@radix-ui/react-switch",
		"@radix-ui/react-tabs",
	}
	for _, dependencyName := range requiredDependencies {
		if _, ok := pkg.Dependencies[dependencyName]; !ok {
			t.Fatalf("期望前端依赖包含 %q，用于支撑 React/Vite 重构后的界面和交互", dependencyName)
		}
	}

	requiredDevDependencies := []string{
		"vite",
		"@vitejs/plugin-react",
		"tailwindcss",
		"@tailwindcss/vite",
		"typescript",
		"vitest",
		"jsdom",
	}
	for _, dependencyName := range requiredDevDependencies {
		if _, ok := pkg.DevDependencies[dependencyName]; !ok {
			t.Fatalf("期望前端开发依赖包含 %q，用于支撑新的构建与测试链路", dependencyName)
		}
	}

	for _, unexpectedDependency := range []string{
		"preact",
		"@preact/signals",
		"wouter-preact",
		"htm",
		"esbuild-wasm",
	} {
		if _, ok := pkg.Dependencies[unexpectedDependency]; ok {
			t.Fatalf("期望前端运行时依赖不再包含旧栈依赖 %q", unexpectedDependency)
		}
		if _, ok := pkg.DevDependencies[unexpectedDependency]; ok {
			t.Fatalf("期望前端开发依赖不再包含旧栈依赖 %q", unexpectedDependency)
		}
	}
}

func TestFrontendSourceUsesReactEntryAndPages(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)

	requiredSourceFiles := []string{
		filepath.Join(frontendRoot, "src", "main.tsx"),
		filepath.Join(frontendRoot, "src", "App.tsx"),
		filepath.Join(frontendRoot, "src", "styles.css"),
		filepath.Join(frontendRoot, "src", "components", "layout", "AppLayout.tsx"),
		filepath.Join(frontendRoot, "src", "pages", "StatusPage.tsx"),
		filepath.Join(frontendRoot, "src", "pages", "AdminPage.tsx"),
		filepath.Join(frontendRoot, "src", "store", "appStore.ts"),
		filepath.Join(frontendRoot, "src", "hooks", "useStatusOverview.ts"),
		filepath.Join(frontendRoot, "src", "hooks", "useAdminOverview.ts"),
		filepath.Join(frontendRoot, "src", "lib", "admin.ts"),
		filepath.Join(frontendRoot, "src", "lib", "status.ts"),
	}
	for _, sourceFilePath := range requiredSourceFiles {
		if _, err := os.Stat(sourceFilePath); err != nil {
			t.Fatalf("期望前端重构源码文件存在 %q: %v", filepath.ToSlash(sourceFilePath), err)
		}
	}

	mainEntryBytes, err := os.ReadFile(filepath.Join(frontendRoot, "src", "main.tsx"))
	if err != nil {
		t.Fatalf("读取 main.tsx 失败: %v", err)
	}
	mainEntry := string(mainEntryBytes)
	for _, requiredSnippet := range []string{
		`createRoot`,
		`@/App.tsx`,
		`@/styles.css`,
	} {
		if !strings.Contains(mainEntry, requiredSnippet) {
			t.Fatalf("期望 main.tsx 包含 %q，以保证 React 入口和样式入口明确接入", requiredSnippet)
		}
	}

	appShellBytes, err := os.ReadFile(filepath.Join(frontendRoot, "src", "App.tsx"))
	if err != nil {
		t.Fatalf("读取 App.tsx 失败: %v", err)
	}
	appShell := string(appShellBytes)
	for _, requiredSnippet := range []string{
		`BrowserRouter`,
		`<StatusPage />`,
		`<AdminPage />`,
		`syncThemeWithAutoMode`,
	} {
		if !strings.Contains(appShell, requiredSnippet) {
			t.Fatalf("期望 App.tsx 包含 %q，以保证路由和主题同步逻辑真正接入", requiredSnippet)
		}
	}

	buildScriptBytes, err := os.ReadFile(filepath.Join(frontendRoot, "build.mjs"))
	if err != nil {
		t.Fatalf("读取 build.mjs 失败: %v", err)
	}
	buildScript := string(buildScriptBytes)
	for _, requiredSnippet := range []string{
		`@vitejs/plugin-react`,
		`@tailwindcss/vite`,
		`src/main.tsx`,
		`return "app.js";`,
		`return "styles.css";`,
		`process.env.NODE_ENV`,
	} {
		if !strings.Contains(buildScript, requiredSnippet) {
			t.Fatalf("期望 build.mjs 包含 %q，以保证构建继续产出单 bundle 契约", requiredSnippet)
		}
	}
}
