package main

import (
	"encoding/json"
	"errors"
	"flag"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
)

func main() {
	rootDir := flag.String("root", ".", "repository root")
	flag.Parse()

	frontendLayout, err := resolveFrontendLayout(*rootDir)
	must(err)
	sourceDir := frontendLayout.SourceDir
	outputDir := frontendLayout.OutputDir
	buildMetadata := loadBuildMetadata(*rootDir)
	templateHTML, err := os.ReadFile(filepath.Join(sourceDir, "index.template.html"))
	must(err)
	templateHTML = replaceBuildTokens(templateHTML, buildMetadata)

	styleCSS, err := os.ReadFile(filepath.Join(sourceDir, "styles.css"))
	must(err)
	assetPaths := make(map[string]struct{}, len(frontendScriptPaths())+1)
	must(os.MkdirAll(outputDir, 0700))
	expectedAssets := expectedGeneratedAssets()
	must(removeStaleGeneratedAssets(outputDir, expectedAssets))
	for _, scriptPath := range frontendScriptPaths() {
		scriptBody, readErr := os.ReadFile(filepath.Join(sourceDir, scriptPath))
		must(readErr)
		scriptBody = replaceBuildTokens(scriptBody, buildMetadata)
		outputPath := filepath.Join(outputDir, scriptPath)
		must(os.MkdirAll(filepath.Dir(outputPath), 0700))
		must(os.WriteFile(outputPath, scriptBody, 0600))
		recordGeneratedAsset(assetPaths, scriptPath)
	}
	must(os.WriteFile(filepath.Join(outputDir, "styles.css"), styleCSS, 0600))
	recordGeneratedAsset(assetPaths, "styles.css")
	must(writeBuildManifest(frontendLayout, buildMetadata))

	outputPath := filepath.Join(frontendLayout.RootDir, "index.html")
	must(validateNoBuildPlaceholders(filepath.ToSlash(filepath.Join(frontendLayout.RelativeRoot, "index.html")), templateHTML))
	must(validateNoBuildPlaceholders(filepath.ToSlash(filepath.Join(frontendLayout.RelativeRoot, "assets", "styles.css")), styleCSS))
	must(validateAssetReferences(templateHTML, assetPaths))
	must(os.WriteFile(outputPath, templateHTML, 0600))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func frontendScriptPaths() []string {
	return []string{
		"core.js",
		filepath.Join("store", "app_store.js"),
		filepath.Join("store", "provider_store.js"),
		filepath.Join("store", "ui_store.js"),
		"state.js",
		"i18n.js",
		"app.js",
		filepath.Join("services", "status_service.js"),
		filepath.Join("services", "admin_service.js"),
		filepath.Join("features", "providers", "disable_duration_model.js"),
		filepath.Join("features", "providers", "provider_actions.js"),
		filepath.Join("features", "providers", "provider_renderer.js"),
		filepath.Join("features", "providers", "key_panel_view.js"),
		filepath.Join("features", "providers", "config_panel_view.js"),
		filepath.Join("features", "providers", "provider_form_state.js"),
		filepath.Join("features", "providers", "provider_events.js"),
		filepath.Join("views", "status_view.js"),
		filepath.Join("views", "logs_view.js"),
		filepath.Join("views", "provider_view.js"),
		"api.js",
		filepath.Join("actions", "polling_actions.js"),
		"boot.js",
	}
}

type buildMetadata struct {
	version      string
	revision     string
	buildTime    string
	assetVersion string
}

type frontendLayout struct {
	RootDir      string
	SourceDir    string
	OutputDir    string
	RelativeRoot string
}

type buildManifest struct {
	Version      string   `json:"version"`
	Revision     string   `json:"revision"`
	BuildTime    string   `json:"build_time"`
	AssetVersion string   `json:"asset_version"`
	FrontendRoot string   `json:"frontend_root"`
	SourceDir    string   `json:"source_dir"`
	Assets       []string `json:"assets"`
}

func resolveFrontendLayout(rootDir string) (frontendLayout, error) {
	candidates := []string{
		filepath.Join("src", "frontend"),
		"frontend",
	}
	for _, relativeRoot := range candidates {
		rootPath := filepath.Join(rootDir, relativeRoot)
		sourceDir := filepath.Join(rootPath, "src")
		if fileExists(filepath.Join(sourceDir, "index.template.html")) {
			return frontendLayout{
				RootDir:      rootPath,
				SourceDir:    sourceDir,
				OutputDir:    filepath.Join(rootPath, "assets"),
				RelativeRoot: filepath.ToSlash(relativeRoot),
			}, nil
		}
	}
	return frontendLayout{}, errors.New("frontend source tree not found")
}

func expectedGeneratedAssets() map[string]struct{} {
	expected := make(map[string]struct{}, len(frontendScriptPaths())+2)
	for _, scriptPath := range frontendScriptPaths() {
		expected[filepath.ToSlash(scriptPath)] = struct{}{}
	}
	expected["styles.css"] = struct{}{}
	expected["build-manifest.json"] = struct{}{}
	return expected
}

func removeStaleGeneratedAssets(outputDir string, expectedAssets map[string]struct{}) error {
	return filepath.Walk(outputDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		relativePath, err := filepath.Rel(outputDir, path)
		if err != nil {
			return err
		}
		normalizedRelativePath := filepath.ToSlash(relativePath)
		if _, ok := expectedAssets[normalizedRelativePath]; ok {
			return nil
		}
		return os.Remove(path)
	})
}

func writeBuildManifest(layout frontendLayout, metadata buildMetadata) error {
	assets := make([]string, 0, len(frontendScriptPaths())+2)
	for _, scriptPath := range frontendScriptPaths() {
		assets = append(assets, "/"+filepath.ToSlash(filepath.Join("assets", scriptPath)))
	}
	assets = append(assets, "/assets/styles.css")
	sort.Strings(assets)
	manifestBytes, err := json.MarshalIndent(buildManifest{
		Version:      metadata.version,
		Revision:     metadata.revision,
		BuildTime:    metadata.buildTime,
		AssetVersion: metadata.assetVersion,
		FrontendRoot: layout.RelativeRoot,
		SourceDir:    filepath.ToSlash(filepath.Join(layout.RelativeRoot, "src")),
		Assets:       assets,
	}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(layout.OutputDir, "build-manifest.json"), append(manifestBytes, '\n'), 0600)
}

func loadBuildMetadata(rootDir string) buildMetadata {
	version := firstNonEmpty(strings.TrimSpace(os.Getenv("APP_VERSION")), gitOutput(rootDir, "describe", "--tags", "--always", "--dirty"), "dev")
	revision := firstNonEmpty(strings.TrimSpace(os.Getenv("APP_REVISION")), gitOutput(rootDir, "rev-parse", "--short", "HEAD"), "local")
	buildTime := firstNonEmpty(strings.TrimSpace(os.Getenv("APP_BUILD_TIME")), time.Now().UTC().Format(time.RFC3339), "unknown")
	return buildMetadata{
		version:      version,
		revision:     revision,
		buildTime:    buildTime,
		assetVersion: buildScopedAssetVersion(revision, buildTime),
	}
}

func replaceBuildTokens(content []byte, metadata buildMetadata) []byte {
	replacer := strings.NewReplacer(
		"__APP_VERSION__", metadata.version,
		"__APP_REVISION__", metadata.revision,
		"__APP_BUILD_TIME__", metadata.buildTime,
		"__ASSET_VERSION__", metadata.assetVersion,
		"dev / local / unknown", metadata.version+" / "+metadata.revision+" / "+metadata.buildTime,
	)
	return []byte(replacer.Replace(string(content)))
}

func validateNoBuildPlaceholders(label string, content []byte) error {
	knownPlaceholders := []string{
		"__APP_VERSION__",
		"__APP_REVISION__",
		"__APP_BUILD_TIME__",
		"__ASSET_VERSION__",
	}
	for _, placeholder := range knownPlaceholders {
		if strings.Contains(string(content), placeholder) {
			return errors.New(label + " contains unresolved placeholder " + placeholder)
		}
	}
	return nil
}

func validateAssetReferences(indexHTML []byte, generatedAssets map[string]struct{}) error {
	assetReferencePattern := regexp.MustCompile(`(?:href|src)="(/assets/[^"?]+)(?:\?v=[^"]*)?"`)
	matches := assetReferencePattern.FindAllSubmatch(indexHTML, -1)
	var missingAssets []string
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		assetPath := string(match[1])
		if _, ok := generatedAssets[assetPath]; ok {
			continue
		}
		missingAssets = append(missingAssets, assetPath)
	}
	if len(missingAssets) == 0 {
		return nil
	}
	sort.Strings(missingAssets)
	return errors.New("frontend index references missing generated assets: " + strings.Join(missingAssets, ", "))
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func recordGeneratedAsset(assetPaths map[string]struct{}, relativePath string) {
	assetPath := "/" + filepath.ToSlash(filepath.Join("assets", relativePath))
	assetPaths[assetPath] = struct{}{}
}

func buildScopedAssetVersion(revision string, buildTime string) string {
	rawValue := firstNonEmpty(revision, "local") + "-" + firstNonEmpty(buildTime, "unknown")
	var builder strings.Builder
	lastWasDash := false
	for _, char := range rawValue {
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			builder.WriteRune(char)
			lastWasDash = false
			continue
		}
		if lastWasDash {
			continue
		}
		builder.WriteByte('-')
		lastWasDash = true
	}
	return strings.Trim(builder.String(), "-")
}

func gitOutput(rootDir string, args ...string) string {
	command := exec.Command("git", append([]string{"-C", rootDir}, args...)...)
	output, err := command.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
