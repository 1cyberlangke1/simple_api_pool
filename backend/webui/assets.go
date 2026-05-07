package webui

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var inlineScriptPattern = regexp.MustCompile(`(?is)<script(?:\s[^>]*)?>(.*?)</script>`)
var inlineStylePattern = regexp.MustCompile(`(?is)<style(?:\s[^>]*)?>(.*?)</style>`)

const defaultContentSecurityPolicy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

func DefaultContentSecurityPolicy() string {
	return defaultContentSecurityPolicy
}

func ResolveRoot() string {
	candidates := []string{"frontend", filepath.Join("..", "frontend")}
	for _, candidate := range candidates {
		indexPath := filepath.Join(candidate, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			return candidate
		}
	}
	return ""
}

func BuildContentSecurityPolicy(frontendRoot string) (string, error) {
	if frontendRoot == "" {
		return DefaultContentSecurityPolicy(), nil
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
		scriptBody := string(match[1])
		if strings.TrimSpace(scriptBody) == "" {
			continue
		}
		sum := sha256.Sum256([]byte(scriptBody))
		scriptSources = append(scriptSources, "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'")
	}

	styleSources := []string{"'self'"}
	styleMatches := inlineStylePattern.FindAllSubmatch(indexHTML, -1)
	for _, match := range styleMatches {
		if len(match) < 2 {
			continue
		}
		styleBody := string(match[1])
		if strings.TrimSpace(styleBody) == "" {
			continue
		}
		sum := sha256.Sum256([]byte(styleBody))
		styleSources = append(styleSources, "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'")
	}

	return "default-src 'self'; img-src 'self' data:; style-src " + strings.Join(styleSources, " ") + "; script-src " + strings.Join(scriptSources, " ") + "; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", nil
}

func ServeIndex(w http.ResponseWriter, r *http.Request, frontendRoot string) {
	if frontendRoot == "" {
		http.Error(w, `{"error":"前端资源不存在"}`, http.StatusServiceUnavailable)
		return
	}
	http.ServeFile(w, r, filepath.Join(frontendRoot, "index.html"))
}

func ServeAsset(w http.ResponseWriter, r *http.Request, frontendRoot, assetName string) {
	if frontendRoot == "" {
		http.Error(w, `{"error":"前端资源不存在"}`, http.StatusServiceUnavailable)
		return
	}
	http.ServeFile(w, r, filepath.Join(frontendRoot, assetName))
}
