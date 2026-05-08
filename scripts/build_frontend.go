package main

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	rootDir := flag.String("root", ".", "repository root")
	flag.Parse()

	sourceDir := filepath.Join(*rootDir, "frontend", "src")
	templateHTML, err := os.ReadFile(filepath.Join(sourceDir, "index.template.html"))
	must(err)

	styleCSS, err := os.ReadFile(filepath.Join(sourceDir, "styles.css"))
	must(err)
	coreJS, err := os.ReadFile(filepath.Join(sourceDir, "core.js"))
	must(err)
	i18nJS, err := os.ReadFile(filepath.Join(sourceDir, "i18n.js"))
	must(err)
	appJS, err := os.ReadFile(filepath.Join(sourceDir, "app.js"))
	must(err)

	outputDir := filepath.Join(*rootDir, "frontend", "assets")
	must(os.MkdirAll(outputDir, 0700))

	bundledJS := strings.Join([]string{
		strings.TrimSpace(string(coreJS)),
		strings.TrimSpace(string(i18nJS)),
		strings.TrimSpace(string(appJS)),
	}, "\n\n")
	must(os.WriteFile(filepath.Join(outputDir, "app.js"), []byte(bundledJS), 0600))
	must(os.WriteFile(filepath.Join(outputDir, "styles.css"), styleCSS, 0600))

	outputPath := filepath.Join(*rootDir, "frontend", "index.html")
	must(os.WriteFile(outputPath, templateHTML, 0600))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
