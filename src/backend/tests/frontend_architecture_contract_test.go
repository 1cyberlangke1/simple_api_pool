package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFrontendPackageIncludesRefactorDependencies(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)
	packageJSONPath := filepath.Join(frontendRoot, "package.json")
	packageJSONBytes, err := os.ReadFile(packageJSONPath)
	if err != nil {
		t.Fatalf("读取前端 package.json 失败: %v", err)
	}

	var pkg struct {
		Dependencies map[string]string `json:"dependencies"`
	}
	if err := json.Unmarshal(packageJSONBytes, &pkg); err != nil {
		t.Fatalf("解析前端 package.json 失败: %v", err)
	}

	for _, dependencyName := range []string{
		"@preact/signals",
		"wouter-preact",
		"valibot",
	} {
		if _, ok := pkg.Dependencies[dependencyName]; !ok {
			t.Fatalf("期望前端依赖包含 %q，用于完成计划中的状态、路由和表单重构", dependencyName)
		}
	}
}

func TestFrontendSourceUsesRefactorModules(t *testing.T) {
	repoRoot := repoRootFromTestFile(t)
	frontendRoot := frontendRootFromRepoRoot(repoRoot)

	requiredSourceFiles := []string{
		filepath.Join(frontendRoot, "src", "routes", "app_router.js"),
		filepath.Join(frontendRoot, "src", "routes", "admin_route_controller.js"),
		filepath.Join(frontendRoot, "src", "routes", "status_route_controller.js"),
		filepath.Join(frontendRoot, "src", "routes", "admin_polling.js"),
		filepath.Join(frontendRoot, "src", "routes", "admin_actions.js"),
		filepath.Join(frontendRoot, "src", "routes", "app_effects.js"),
		filepath.Join(frontendRoot, "src", "routes", "route_state.js"),
		filepath.Join(frontendRoot, "src", "stores", "app_store.js"),
		filepath.Join(frontendRoot, "src", "stores", "admin_store.js"),
		filepath.Join(frontendRoot, "src", "stores", "status_store.js"),
		filepath.Join(frontendRoot, "src", "services", "admin_service.js"),
		filepath.Join(frontendRoot, "src", "services", "status_service.js"),
		filepath.Join(frontendRoot, "src", "forms", "provider_form.js"),
		filepath.Join(frontendRoot, "src", "forms", "global_config_form.js"),
		filepath.Join(frontendRoot, "src", "views", "admin", "admin_shell.js"),
		filepath.Join(frontendRoot, "src", "views", "admin", "provider_sidebar.js"),
		filepath.Join(frontendRoot, "src", "views", "admin", "provider_editor.js"),
		filepath.Join(frontendRoot, "src", "views", "admin", "key_workspace.js"),
		filepath.Join(frontendRoot, "src", "views", "admin", "logs_modal.js"),
		filepath.Join(frontendRoot, "src", "views", "admin_page.js"),
		filepath.Join(frontendRoot, "src", "views", "status_page.js"),
		filepath.Join(frontendRoot, "src", "styles", "tokens.css"),
		filepath.Join(frontendRoot, "src", "styles", "layout.css"),
		filepath.Join(frontendRoot, "src", "styles", "status.css"),
		filepath.Join(frontendRoot, "src", "styles", "admin.css"),
		filepath.Join(frontendRoot, "src", "styles", "forms.css"),
		filepath.Join(frontendRoot, "src", "styles", "logs.css"),
	}

	for _, sourceFilePath := range requiredSourceFiles {
		if _, err := os.Stat(sourceFilePath); err != nil {
			t.Fatalf("期望前端重构源码文件存在 %q: %v", filepath.ToSlash(sourceFilePath), err)
		}
	}

	appEntryPath := filepath.Join(frontendRoot, "src", "app.js")
	appEntryBytes, err := os.ReadFile(appEntryPath)
	if err != nil {
		t.Fatalf("读取前端入口文件失败: %v", err)
	}
	appEntry := string(appEntryBytes)

	for _, requiredImport := range []string{
		"@preact/signals",
		"wouter-preact",
		"./routes/app_router.js",
		"./stores/app_store.js",
	} {
		if !strings.Contains(appEntry, requiredImport) {
			t.Fatalf("期望前端入口引用 %q，以保证模块化结构真正接入入口", requiredImport)
		}
	}

	routerEntryPath := filepath.Join(frontendRoot, "src", "routes", "app_router.js")
	routerEntryBytes, err := os.ReadFile(routerEntryPath)
	if err != nil {
		t.Fatalf("读取前端路由入口失败: %v", err)
	}
	routerEntry := string(routerEntryBytes)
	for _, requiredImport := range []string{
		"./admin_route_controller.js",
		"./status_route_controller.js",
		"./app_effects.js",
		"./route_state.js",
	} {
		if !strings.Contains(routerEntry, requiredImport) {
			t.Fatalf("期望前端路由入口引用 %q，以保证页面装配由路由模块负责", requiredImport)
		}
	}
	for _, forbiddenImport := range []string{
		"../services/admin_service.js",
		"../services/status_service.js",
	} {
		if strings.Contains(routerEntry, forbiddenImport) {
			t.Fatalf("期望前端路由入口不再直接依赖 %q，而是通过 route controller 协调", forbiddenImport)
		}
	}
}
