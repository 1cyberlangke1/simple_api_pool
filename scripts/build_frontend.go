package main

import (
	"flag"
	"os"
	"path/filepath"
)

func main() {
	rootDir := flag.String("root", ".", "repository root")
	flag.Parse()

	sourceDir := filepath.Join(*rootDir, "frontend", "src")
	templateHTML, err := os.ReadFile(filepath.Join(sourceDir, "index.template.html"))
	must(err)

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
