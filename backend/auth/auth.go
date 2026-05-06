package auth

import (
	"net/http"
	"strings"

	"simple-api-pool/config"
)

func CheckClientKey(r *http.Request, cfg *config.Config) bool {
	keys := cfg.ClientKeys()
	if len(keys) == 0 {
		return true
	}
	key := extractBearer(r)
	if key == "" {
		return false
	}
	for _, k := range keys {
		if k == key {
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
	return key == adminKey
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
