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
	"sync"
	"time"
)

var inlineScriptPattern = regexp.MustCompile(`(?is)<script(?:\s[^>]*)?>(.*?)</script>`)
var inlineStylePattern = regexp.MustCompile(`(?is)<style(?:\s[^>]*)?>(.*?)</style>`)

const cloudflareInsightsScriptSource = "https://static.cloudflareinsights.com"
const cloudflareInsightsConnectSource = "https://cloudflareinsights.com"
const googleFontsStyleSource = "https://fonts.googleapis.com"
const googleFontsFontSource = "https://fonts.gstatic.com"
const defaultContentSecurityPolicy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' " + googleFontsStyleSource + "; font-src 'self' " + googleFontsFontSource + "; script-src 'self' " + cloudflareInsightsScriptSource + "; connect-src 'self' " + cloudflareInsightsConnectSource + "; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

type ContentSecurityPolicyProvider struct {
	mu           sync.RWMutex
	frontendRoot string
	indexPath    string
	policy       string
	modTime      time.Time
	size         int64
}

func DefaultContentSecurityPolicy() string {
	return defaultContentSecurityPolicy
}

func NewContentSecurityPolicyProvider(frontendRoot string) (*ContentSecurityPolicyProvider, error) {
	provider := &ContentSecurityPolicyProvider{
		frontendRoot: frontendRoot,
		indexPath:    filepath.Join(frontendRoot, "index.html"),
		policy:       DefaultContentSecurityPolicy(),
	}
	if frontendRoot == "" {
		return provider, nil
	}
	if err := provider.refresh(); err != nil {
		return nil, err
	}
	return provider, nil
}

func (p *ContentSecurityPolicyProvider) Policy() string {
	if p == nil {
		return DefaultContentSecurityPolicy()
	}
	if p.frontendRoot == "" {
		return DefaultContentSecurityPolicy()
	}

	info, err := os.Stat(p.indexPath)
	if err != nil {
		p.mu.RLock()
		defer p.mu.RUnlock()
		if p.policy != "" {
			return p.policy
		}
		return DefaultContentSecurityPolicy()
	}

	p.mu.RLock()
	if p.policy != "" && p.modTime.Equal(info.ModTime()) && p.size == info.Size() {
		policy := p.policy
		p.mu.RUnlock()
		return policy
	}
	p.mu.RUnlock()

	p.mu.Lock()
	defer p.mu.Unlock()
	if p.policy != "" && p.modTime.Equal(info.ModTime()) && p.size == info.Size() {
		return p.policy
	}
	if err := p.refreshLocked(); err != nil {
		if p.policy != "" {
			return p.policy
		}
		return DefaultContentSecurityPolicy()
	}
	return p.policy
}

func ResolveRoot() string {
	candidates := []string{
		filepath.Join("src", "frontend"),
		"frontend",
		filepath.Join("..", "frontend"),
		filepath.Join("..", "src", "frontend"),
	}
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
	scriptSources := []string{"'self'", cloudflareInsightsScriptSource}
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

	styleSources = append(styleSources, googleFontsStyleSource)
	return "default-src 'self'; img-src 'self' data:; style-src " + strings.Join(styleSources, " ") + "; font-src 'self' " + googleFontsFontSource + "; script-src " + strings.Join(scriptSources, " ") + "; connect-src 'self' " + cloudflareInsightsConnectSource + "; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", nil
}

func (p *ContentSecurityPolicyProvider) refresh() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.refreshLocked()
}

func (p *ContentSecurityPolicyProvider) refreshLocked() error {
	policy, err := BuildContentSecurityPolicy(p.frontendRoot)
	if err != nil {
		return err
	}
	info, err := os.Stat(p.indexPath)
	if err != nil {
		return err
	}
	p.policy = policy
	p.modTime = info.ModTime()
	p.size = info.Size()
	return nil
}

func ServeIndex(w http.ResponseWriter, r *http.Request, frontendRoot string) {
	if frontendRoot == "" {
		http.Error(w, `{"error":"前端资源不存在"}`, http.StatusServiceUnavailable)
		return
	}
	indexPath, ok := safeAssetPath(frontendRoot, "index.html")
	if !ok {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, indexPath)
}

func ServeAsset(w http.ResponseWriter, r *http.Request, frontendRoot, assetName string) {
	if frontendRoot == "" {
		http.Error(w, `{"error":"前端资源不存在"}`, http.StatusServiceUnavailable)
		return
	}
	assetPath, ok := safeAssetPath(frontendRoot, assetName)
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, assetPath)
}

func ServeAssetByRequestPath(w http.ResponseWriter, r *http.Request, frontendRoot, requestPath string) bool {
	requestPath = strings.TrimPrefix(requestPath, "/")
	if requestPath == "" || requestPath == "index.html" {
		return false
	}
	assetPath, ok := safeAssetPath(frontendRoot, requestPath)
	if !ok {
		return false
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, assetPath)
	return true
}

func safeAssetPath(frontendRoot, assetName string) (string, bool) {
	rootPath, err := filepath.Abs(frontendRoot)
	if err != nil {
		return "", false
	}
	rootPath = filepath.Clean(rootPath)

	candidatePath, err := filepath.Abs(filepath.Join(rootPath, assetName))
	if err != nil {
		return "", false
	}
	candidatePath = filepath.Clean(candidatePath)

	if candidatePath != rootPath && !strings.HasPrefix(candidatePath, rootPath+string(filepath.Separator)) {
		return "", false
	}
	if _, err := os.Stat(candidatePath); err != nil {
		return "", false
	}
	return candidatePath, true
}
