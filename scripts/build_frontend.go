package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	stylePlaceholder  = "  <!-- FRONTEND_INLINE_STYLE -->"
	scriptPlaceholder = "  <!-- FRONTEND_INLINE_SCRIPT -->"
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

	inlineStyle := joinInlineBlock("style", string(styleCSS))
	inlineScript := joinInlineBlock("script", strings.Join([]string{
		strings.TrimSpace(string(coreJS)),
		strings.TrimSpace(string(i18nJS)),
		strings.TrimSpace(string(appJS)),
	}, "\n\n"))

	outputHTML := strings.Replace(string(templateHTML), stylePlaceholder, inlineStyle, 1)
	outputHTML = strings.Replace(outputHTML, scriptPlaceholder, inlineScript, 1)

	outputPath := filepath.Join(*rootDir, "frontend", "index.html")
	must(os.WriteFile(outputPath, []byte(outputHTML), 0600))
}

func joinInlineBlock(tagName, body string) string {
	body = strings.Trim(body, "\r\n")
	return fmt.Sprintf("  <%s>\n%s\n  </%s>", tagName, body, tagName)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
