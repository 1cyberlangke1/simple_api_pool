package auth

import (
	"crypto/subtle"
	"net/http"
	"net/url"
	"strings"

	"simple-api-pool/config"
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
	for _, k := range keys {
		if constantTimeEqual(k, key) {
			return true
		}
	}
	return false
}

func CheckAdminKey(r *http.Request, cfg *config.Config) bool {
	adminKey := cfg.AdminKey()
	if adminKey == "" {
		return false
	}
	key := extractBearer(r)
	if key != "" && constantTimeEqual(key, adminKey) {
		return true
	}
	return CheckAdminSession(r, cfg)
}

func extractClientKey(r *http.Request, cfg *config.Config) string {
	if providerType, ok := providerTypeFromRequest(r, cfg); ok {
		if key := extractProviderKey(r, providerType); key != "" {
			return key
		}
	}
	return extractBearer(r)
}

func extractBearer(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	if strings.HasPrefix(auth, "Bearer ") {
		return auth[7:]
	}
	return auth
}

func providerTypeFromRequest(r *http.Request, cfg *config.Config) (config.ProviderType, bool) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		return "", false
	}

	segments := strings.Split(path, "/")
	idx := 0
	if len(segments) > 0 && segments[0] == "cache" {
		idx++
	}
	if len(segments) <= idx {
		return "", false
	}

	provider, _ := cfg.Provider(segments[idx])
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
		if key := queryKey(r.URL.Query(), "key"); key != "" {
			return key
		}
	}
	return extractBearer(r)
}

func queryKey(values url.Values, key string) string {
	if values == nil {
		return ""
	}
	return strings.TrimSpace(values.Get(key))
}

func constantTimeEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}
