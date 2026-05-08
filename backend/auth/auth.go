package auth

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"unsafe"

	"simple-api-pool/config"
	"simple-api-pool/internal/proxyroute"
)

func CheckClientKey(r *http.Request, cfg *config.Config) bool {
	keys := cfg.ClientKeys()
	if len(keys) == 0 {
		return false
	}
	key := extractClientKey(r, cfg)
	if key == "" {
		return false
	}
	for _, configuredKey := range keys {
		if constantTimeEqual(configuredKey, key) {
			return true
		}
	}
	return false
}

func CheckAdminKey(r *http.Request, cfg *config.Config) bool {
	if CheckAdminAuthorizationHeader(r, cfg) {
		return true
	}
	return CheckAdminSession(r, cfg)
}

func CheckAdminAuthorizationHeader(r *http.Request, cfg *config.Config) bool {
	adminKey := cfg.AdminKey()
	if adminKey == "" {
		return false
	}
	key := extractAuthorizationCredential(r)
	if key != "" && constantTimeEqual(key, adminKey) {
		return true
	}
	return false
}

func extractClientKey(r *http.Request, cfg *config.Config) string {
	if providerType, ok := providerTypeFromRequest(r, cfg); ok {
		if key := extractProviderKey(r, providerType); key != "" {
			return key
		}
	}
	return extractAuthorizationCredential(r)
}

func extractAuthorizationCredential(r *http.Request) string {
	if r == nil {
		return ""
	}

	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if authorization == "" {
		return ""
	}
	if strings.HasPrefix(authorization, "Bearer ") {
		return strings.TrimSpace(authorization[len("Bearer "):])
	}
	if strings.Contains(authorization, " ") {
		return ""
	}
	return authorization
}

func providerTypeFromRequest(r *http.Request, cfg *config.Config) (config.ProviderType, bool) {
	if r == nil {
		return "", false
	}

	parts := proxyroute.ParsePath(r.URL.Path)
	if parts.Provider == "" {
		return "", false
	}

	provider, _ := cfg.Provider(parts.Provider)
	if provider == nil {
		return "", false
	}
	return provider.Type, true
}

func extractProviderKey(r *http.Request, providerType config.ProviderType) string {
	switch providerType {
	case config.Claude:
		if key := strings.TrimSpace(r.Header.Get("x-api-key")); key != "" {
			return key
		}
	case config.Gemini:
		if key := strings.TrimSpace(r.Header.Get("x-goog-api-key")); key != "" {
			return key
		}
		if key := strings.TrimSpace(r.URL.Query().Get("key")); key != "" {
			return key
		}
	}
	return extractAuthorizationCredential(r)
}

func constantTimeEqual(left, right string) bool {
	// subtle.ConstantTimeCompare requires equal lengths; the explicit check avoids
	// panics and keeps the actual byte comparison allocation-free.
	if len(left) != len(right) {
		return false
	}
	if len(left) == 0 {
		return true
	}
	return subtle.ConstantTimeCompare(
		unsafe.Slice(unsafe.StringData(left), len(left)),
		unsafe.Slice(unsafe.StringData(right), len(right)),
	) == 1
}
