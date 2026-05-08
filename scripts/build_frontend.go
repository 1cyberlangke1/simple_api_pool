package main

import (
	"flag"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	rootDir := flag.String("root", ".", "repository root")
	flag.Parse()

	sourceDir := filepath.Join(*rootDir, "frontend", "src")
	buildMetadata := loadBuildMetadata(*rootDir)
	templateHTML, err := os.ReadFile(filepath.Join(sourceDir, "index.template.html"))
	must(err)
	templateHTML = replaceBuildTokens(templateHTML, buildMetadata)

	styleCSS, err := os.ReadFile(filepath.Join(sourceDir, "styles.css"))
	must(err)
	scriptPaths := []string{
		"core.js",
		"state.js",
		"i18n.js",
		"app.js",
		filepath.Join("views", "status_view.js"),
		filepath.Join("views", "logs_view.js"),
		filepath.Join("views", "provider_view.js"),
		"api.js",
		filepath.Join("actions", "polling_actions.js"),
		"boot.js",
	}
	for _, scriptPath := range scriptPaths {
		scriptBody, readErr := os.ReadFile(filepath.Join(sourceDir, scriptPath))
		must(readErr)
		scriptBody = replaceBuildTokens(scriptBody, buildMetadata)
		outputPath := filepath.Join(outputDirPath(*rootDir), scriptPath)
		must(os.MkdirAll(filepath.Dir(outputPath), 0700))
		must(os.WriteFile(outputPath, scriptBody, 0600))
	}

	outputDir := outputDirPath(*rootDir)
	must(os.MkdirAll(outputDir, 0700))
	must(os.WriteFile(filepath.Join(outputDir, "styles.css"), styleCSS, 0600))

	outputPath := filepath.Join(*rootDir, "frontend", "index.html")
	must(os.WriteFile(outputPath, templateHTML, 0600))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func outputDirPath(rootDir string) string {
	return filepath.Join(rootDir, "frontend", "assets")
}

type buildMetadata struct {
	version   string
	revision  string
	buildTime string
}

func loadBuildMetadata(rootDir string) buildMetadata {
	return buildMetadata{
		version:   firstNonEmpty(strings.TrimSpace(os.Getenv("APP_VERSION")), gitOutput(rootDir, "describe", "--tags", "--always", "--dirty"), "dev"),
		revision:  firstNonEmpty(strings.TrimSpace(os.Getenv("APP_REVISION")), gitOutput(rootDir, "rev-parse", "--short", "HEAD"), "local"),
		buildTime: firstNonEmpty(strings.TrimSpace(os.Getenv("APP_BUILD_TIME")), time.Now().UTC().Format(time.RFC3339), "unknown"),
	}
}

func replaceBuildTokens(content []byte, metadata buildMetadata) []byte {
	replacer := strings.NewReplacer(
		"__APP_VERSION__", metadata.version,
		"__APP_REVISION__", metadata.revision,
		"__APP_BUILD_TIME__", metadata.buildTime,
		"dev / local / unknown", metadata.version+" / "+metadata.revision+" / "+metadata.buildTime,
	)
	return []byte(replacer.Replace(string(content)))
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
