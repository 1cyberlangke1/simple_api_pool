package auth

import (
	"crypto/subtle"
	"net/http"
	"unsafe"

	"simple-api-pool/config"
	"simple-api-pool/internal/proxyroute"
	"simple-api-pool/providerapi"
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
		if key := providerapi.ExtractClientCredential(r, providerType); key != "" {
			return key
		}
	}
	return extractAuthorizationCredential(r)
}

func extractAuthorizationCredential(r *http.Request) string {
	return providerapi.ExtractClientCredential(r, config.ProviderType("unknown"))
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
	if provider != nil {
		return provider.Type, true
	}

	group, _ := cfg.Group(parts.Provider)
	if group != nil {
		return group.Type, true
	}
	return "", false
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
