package main

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var inlineScriptPattern = regexp.MustCompile(`(?is)<script(?:\s[^>]*)?>(.*?)</script>`)

func buildFrontendContentSecurityPolicy(frontendRoot string) (string, error) {
	if frontendRoot == "" {
		return defaultContentSecurityPolicy(), nil
	}

	indexPath := filepath.Join(frontendRoot, "index.html")
	indexHTML, err := os.ReadFile(indexPath)
	if err != nil {
		return "", fmt.Errorf("read frontend index: %w", err)
	}

	matches := inlineScriptPattern.FindAllSubmatch(indexHTML, -1)
	scriptSources := []string{"'self'"}
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		scriptBody := strings.TrimSpace(string(match[1]))
		if scriptBody == "" {
			continue
		}
		sum := sha256.Sum256([]byte(scriptBody))
		scriptSources = append(scriptSources, "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'")
	}

	return "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src " + strings.Join(scriptSources, " ") + "; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", nil
}
