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
	"time"

	"simple-api-pool/config"
)

const (
	AdminSessionCookieName = "simple_api_pool_admin_session"
	adminSessionTTL        = 24 * time.Hour
)

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

	token, err := buildAdminSessionToken(adminKey, time.Now())
	if err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     AdminSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   shouldSetAdminSessionSecureCookie(),
		MaxAge:   int(adminSessionTTL.Seconds()),
		Expires:  time.Now().Add(adminSessionTTL),
	})
	return nil
}

func ClearAdminSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     AdminSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   shouldSetAdminSessionSecureCookie(),
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func buildAdminSessionToken(adminKey string, now time.Time) (string, error) {
	expiryUnix := now.Add(adminSessionTTL).Unix()
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", err
	}

	expiryText := strconv.FormatInt(expiryUnix, 10)
	nonceText := hex.EncodeToString(nonceBytes)
	payload := expiryText + "." + nonceText
	signature := signAdminSessionPayload(adminKey, payload)
	return base64.RawURLEncoding.EncodeToString([]byte(payload + "." + signature)), nil
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
		return false
	}

	payload := parts[0] + "." + parts[1]
	expectedSignature := signAdminSessionPayload(adminKey, payload)
	return constantTimeEqual(expectedSignature, parts[2])
}

func signAdminSessionPayload(adminKey, payload string) string {
	mac := hmac.New(sha256.New, []byte(adminKey))
	_, _ = mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func shouldSetAdminSessionSecureCookie() bool {
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
