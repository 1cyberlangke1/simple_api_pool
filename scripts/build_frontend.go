package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
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
	skipBundle := flag.Bool("skip-bundle", false, "reuse existing generated assets instead of invoking frontend bundler")
	flag.Parse()

	frontendLayout, err := resolveFrontendLayout(*rootDir)
	must(err)

	buildMetadata := loadBuildMetadata(*rootDir)
	must(os.MkdirAll(frontendLayout.OutputDir, 0700))
	must(removeStaleGeneratedAssets(frontendLayout.OutputDir, expectedGeneratedAssets()))
	if !*skipBundle {
		must(ensureFrontendDependencies(frontendLayout.RootDir))
		must(bundleFrontend(frontendLayout.RootDir, buildMetadata))
	}
	must(writeBuildManifest(frontendLayout, buildMetadata))

	templateHTML, err := os.ReadFile(filepath.Join(frontendLayout.SourceDir, "index.template.html"))
	must(err)
	templateHTML = replaceBuildTokens(templateHTML, buildMetadata)

	appBundlePath := filepath.Join(frontendLayout.OutputDir, "app.js")
	appBundle, err := os.ReadFile(appBundlePath)
	must(err)

	styleBundlePath := filepath.Join(frontendLayout.OutputDir, "styles.css")
	styleBundle, err := os.ReadFile(styleBundlePath)
	must(err)

	generatedAssets := map[string]struct{}{
		"/assets/app.js":     {},
		"/assets/styles.css": {},
	}

	must(validateNoBuildPlaceholders(filepath.ToSlash(filepath.Join(frontendLayout.RelativeRoot, "index.html")), templateHTML))
	must(validateNoBuildPlaceholders(filepath.ToSlash(filepath.Join(frontendLayout.RelativeRoot, "assets", "app.js")), appBundle))
	must(validateNoBuildPlaceholders(filepath.ToSlash(filepath.Join(frontendLayout.RelativeRoot, "assets", "styles.css")), styleBundle))
	must(validateNoBrowserRuntimeLeak(filepath.ToSlash(filepath.Join(frontendLayout.RelativeRoot, "assets", "app.js")), appBundle))
	must(validateAssetReferences(templateHTML, generatedAssets))
	must(os.WriteFile(filepath.Join(frontendLayout.RootDir, "index.html"), templateHTML, 0600))
}

func must(err error) {
	if err != nil {
		panic(err)
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
	return map[string]struct{}{
		"app.js":              {},
		"styles.css":          {},
		"build-manifest.json": {},
	}
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
	assets := []string{
		"/assets/app.js",
		"/assets/styles.css",
	}
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

func validateNoBrowserRuntimeLeak(label string, content []byte) error {
	for _, forbiddenReference := range []string{
		"process.env.NODE_ENV",
		"process.env.",
	} {
		if strings.Contains(string(content), forbiddenReference) {
			return errors.New(label + " contains browser-incompatible runtime reference " + forbiddenReference)
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

func ensureFrontendDependencies(frontendRoot string) error {
	if resolveInstalledDependencyRoot(frontendRoot) != "" {
		return nil
	}
	return runFrontendCommand(frontendRoot, "npm", []string{"ci", "--no-fund", "--no-audit"}, nil)
}

func resolveInstalledDependencyRoot(frontendRoot string) string {
	if hasUsableInstalledDependencies(frontendRoot) {
		return frontendRoot
	}

	for candidateRoot := filepath.Dir(frontendRoot); candidateRoot != filepath.Dir(candidateRoot); candidateRoot = filepath.Dir(candidateRoot) {
		if !dependencyFilesMatch(frontendRoot, candidateRoot) {
			continue
		}
		if hasUsableInstalledDependencies(candidateRoot) {
			return candidateRoot
		}
	}

	return ""
}

func hasUsableInstalledDependencies(frontendRoot string) bool {
	installMarkerPath := filepath.Join(frontendRoot, "node_modules", "vite", "package.json")
	if !fileExists(installMarkerPath) {
		return false
	}

	installInfo, err := os.Stat(installMarkerPath)
	if err != nil {
		return false
	}
	for _, dependencyFile := range []string{
		filepath.Join(frontendRoot, "package.json"),
		filepath.Join(frontendRoot, "package-lock.json"),
	} {
		info, err := os.Stat(dependencyFile)
		if err != nil {
			return false
		}
		if info.ModTime().After(installInfo.ModTime()) {
			return false
		}
	}
	return true
}

func dependencyFilesMatch(frontendRoot string, candidateRoot string) bool {
	for _, relativePath := range []string{"package.json", "package-lock.json"} {
		frontendBytes, err := os.ReadFile(filepath.Join(frontendRoot, relativePath))
		if err != nil {
			return false
		}
		candidateBytes, err := os.ReadFile(filepath.Join(candidateRoot, relativePath))
		if err != nil {
			return false
		}
		if !bytes.Equal(frontendBytes, candidateBytes) {
			return false
		}
	}
	return true
}

func bundleFrontend(frontendRoot string, metadata buildMetadata) error {
	env := map[string]string{
		"APP_VERSION":    metadata.version,
		"APP_REVISION":   metadata.revision,
		"APP_BUILD_TIME": metadata.buildTime,
	}
	return runFrontendCommand(frontendRoot, "node", []string{"build.mjs"}, env)
}

func runFrontendCommand(frontendRoot string, binary string, args []string, envVars map[string]string) error {
	command := exec.Command(binary, args...)
	command.Dir = frontendRoot
	command.Env = os.Environ()
	for key, value := range envVars {
		command.Env = append(command.Env, key+"="+value)
	}
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s %s failed: %w\n%s", binary, strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}
