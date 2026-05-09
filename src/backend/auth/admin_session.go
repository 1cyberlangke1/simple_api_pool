package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"simple-api-pool/config"
)

const (
	AdminSessionCookieName = "simple_api_pool_admin_session"
	defaultAdminSessionTTL = 24 * time.Hour
)

type adminSessionRegistry struct {
	mu      sync.Mutex
	entries map[string]time.Time
}

var activeAdminSessions = &adminSessionRegistry{
	entries: make(map[string]time.Time),
}

func CheckAdminSession(r *http.Request, cfg *config.Config) bool {
	adminKey := cfg.AdminKey()
	if adminKey == "" {
		return false
	}

	cookie, err := r.Cookie(AdminSessionCookieName)
	if err != nil || cookie.Value == "" {
		return false
	}
	return verifyAdminSessionToken(cookie.Value, adminKey, time.Now())
}

func SetAdminSessionCookie(w http.ResponseWriter, r *http.Request, cfg *config.Config) error {
	adminKey := cfg.AdminKey()
	if adminKey == "" {
		return fmt.Errorf("admin key is empty")
	}

	now := time.Now()
	token, expiry, err := buildAdminSessionToken(adminKey, now)
	if err != nil {
		return err
	}
	activeAdminSessions.store(token, expiry)

	http.SetCookie(w, &http.Cookie{
		Name:     AdminSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   shouldSetAdminSessionSecureCookie(r),
		MaxAge:   int(adminSessionTTL().Seconds()),
		Expires:  expiry,
	})
	return nil
}

func RevokeAdminSession(r *http.Request, cfg *config.Config) {
	if cfg == nil || cfg.AdminKey() == "" || r == nil {
		return
	}

	cookie, err := r.Cookie(AdminSessionCookieName)
	if err != nil || cookie.Value == "" {
		return
	}
	activeAdminSessions.remove(cookie.Value)
}

func ClearAdminSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     AdminSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   shouldSetAdminSessionSecureCookie(r),
		MaxAge:   -1,
		Expires:  time.Now().Add(-time.Hour),
	})
}

func buildAdminSessionToken(adminKey string, now time.Time) (string, time.Time, error) {
	expiry := now.Add(adminSessionTTL())
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", time.Time{}, err
	}

	expiryText := strconv.FormatInt(expiry.Unix(), 10)
	nonceText := base64.RawURLEncoding.EncodeToString(nonceBytes)
	payload := expiryText + "." + nonceText
	signature, err := signAdminSessionPayload(adminKey, payload)
	if err != nil {
		return "", time.Time{}, err
	}
	return base64.RawURLEncoding.EncodeToString([]byte(payload + "." + signature)), expiry, nil
}

func verifyAdminSessionToken(token, adminKey string, now time.Time) bool {
	decodedToken, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return false
	}

	parts := strings.Split(string(decodedToken), ".")
	if len(parts) != 3 {
		return false
	}

	expiryUnix, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || expiryUnix <= now.Unix() {
		activeAdminSessions.remove(token)
		return false
	}

	payload := parts[0] + "." + parts[1]
	expectedSignature, err := signAdminSessionPayload(adminKey, payload)
	if err != nil || !constantTimeEqual(expectedSignature, parts[2]) {
		return false
	}
	return activeAdminSessions.active(token, now)
}

func signAdminSessionPayload(adminKey, payload string) (string, error) {
	mac := hmac.New(sha256.New, []byte(adminKey))
	if _, err := mac.Write([]byte(payload)); err != nil {
		return "", err
	}
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func shouldSetAdminSessionSecureCookie(r *http.Request) bool {
	value := strings.TrimSpace(os.Getenv("ADMIN_COOKIE_SECURE"))
	if value == "" {
		return true
	}

	secure, err := strconv.ParseBool(value)
	if err != nil {
		return true
	}
	return secure
}

func adminSessionTTL() time.Duration {
	value := strings.TrimSpace(os.Getenv("ADMIN_SESSION_TTL"))
	if value == "" {
		return defaultAdminSessionTTL
	}
	ttl, err := time.ParseDuration(value)
	if err != nil || ttl <= 0 {
		return defaultAdminSessionTTL
	}
	return ttl
}

func (registry *adminSessionRegistry) store(token string, expiry time.Time) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.pruneLocked(time.Now())
	registry.entries[token] = expiry
}

func (registry *adminSessionRegistry) remove(token string) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	delete(registry.entries, token)
}

func (registry *adminSessionRegistry) active(token string, now time.Time) bool {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.pruneLocked(now)
	expiry, ok := registry.entries[token]
	return ok && expiry.After(now)
}

func (registry *adminSessionRegistry) pruneLocked(now time.Time) {
	for token, expiry := range registry.entries {
		if !expiry.After(now) {
			delete(registry.entries, token)
		}
	}
}
