package adminapi

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"simple-api-pool/auth"
	"simple-api-pool/config"
)

var (
	ErrAdminRateLimited   = errors.New("admin rate limited")
	ErrAdminUnauthorized  = errors.New("admin unauthorized")
	ErrAdminOriginInvalid = errors.New("admin request origin invalid")
	ErrAdminBadCredential = errors.New("admin bad credential")
)

type AuthService struct {
	cfg     *config.Config
	limiter *auth.FailureLimiter
}

func NewAuthService(cfg *config.Config, limiter *auth.FailureLimiter) *AuthService {
	return &AuthService{
		cfg:     cfg,
		limiter: limiter,
	}
}

func (service *AuthService) Authorize(r *http.Request) error {
	if service.limiter != nil && !service.limiter.Allow(r.RemoteAddr) {
		return ErrAdminRateLimited
	}
	if auth.CheckAdminAuthorizationHeader(r, service.cfg) {
		if service.limiter != nil {
			service.limiter.RecordSuccess(r.RemoteAddr)
		}
		return nil
	}
	if auth.CheckAdminSession(r, service.cfg) {
		if requiresSameOriginProtection(r.Method) && !isSameOriginAdminRequest(r) {
			return ErrAdminOriginInvalid
		}
		if service.limiter != nil {
			service.limiter.RecordSuccess(r.RemoteAddr)
		}
		return nil
	}
	if service.limiter != nil {
		service.limiter.RecordFailure(r.RemoteAddr)
	}
	return ErrAdminUnauthorized
}

func (service *AuthService) Login(w http.ResponseWriter, r *http.Request, adminKey string) error {
	if service.limiter != nil && !service.limiter.Allow(r.RemoteAddr) {
		return ErrAdminRateLimited
	}
	if adminKey == "" || subtle.ConstantTimeCompare([]byte(adminKey), []byte(service.cfg.AdminKey())) != 1 {
		if service.limiter != nil {
			service.limiter.RecordFailure(r.RemoteAddr)
		}
		return ErrAdminBadCredential
	}
	if err := auth.SetAdminSessionCookie(w, r, service.cfg); err != nil {
		return err
	}
	if service.limiter != nil {
		service.limiter.RecordSuccess(r.RemoteAddr)
	}
	logAdminAudit("admin_login", "remote_addr", r.RemoteAddr)
	return nil
}

func (service *AuthService) RefreshSession(w http.ResponseWriter, r *http.Request) error {
	return auth.SetAdminSessionCookie(w, r, service.cfg)
}

func (service *AuthService) Logout(w http.ResponseWriter, r *http.Request) {
	auth.RevokeAdminSession(r, service.cfg)
	auth.ClearAdminSessionCookie(w, r)
	logAdminAudit("admin_logout", "remote_addr", r.RemoteAddr)
}

func requiresSameOriginProtection(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

func isSameOriginAdminRequest(r *http.Request) bool {
	requestOrigin := requestOrigin(r)
	if requestOrigin == "" {
		return false
	}
	return requestOrigin == requestBaseURL(r)
}

func requestOrigin(r *http.Request) string {
	rawOrigin := strings.TrimSpace(r.Header.Get("Origin"))
	if rawOrigin != "" {
		return normalizeOrigin(rawOrigin)
	}
	rawReferer := strings.TrimSpace(r.Header.Get("Referer"))
	if rawReferer == "" {
		return ""
	}
	refererURL, err := url.Parse(rawReferer)
	if err != nil {
		return ""
	}
	return normalizeOrigin(refererURL.Scheme + "://" + refererURL.Host)
}

func requestBaseURL(r *http.Request) string {
	if r == nil {
		return ""
	}
	scheme := forwardedRequestScheme(r)
	return normalizeOrigin(scheme + "://" + r.Host)
}

func forwardedRequestScheme(r *http.Request) string {
	if r == nil {
		return "http"
	}
	if forwardedScheme := forwardedHeaderScheme(r.Header.Get("Forwarded")); forwardedScheme != "" {
		return forwardedScheme
	}
	if forwardedProto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwardedProto != "" {
		protoParts := strings.Split(forwardedProto, ",")
		if len(protoParts) > 0 {
			normalizedProto := strings.ToLower(strings.TrimSpace(protoParts[0]))
			if normalizedProto == "http" || normalizedProto == "https" {
				return normalizedProto
			}
		}
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

func forwardedHeaderScheme(rawForwarded string) string {
	for _, entry := range strings.Split(rawForwarded, ",") {
		for _, pair := range strings.Split(entry, ";") {
			parts := strings.SplitN(strings.TrimSpace(pair), "=", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "proto") {
				continue
			}
			proto := strings.ToLower(strings.Trim(parts[1], `"`))
			if proto == "http" || proto == "https" {
				return proto
			}
		}
	}
	return ""
}

func normalizeOrigin(rawOrigin string) string {
	parsedOrigin, err := url.Parse(strings.TrimSpace(rawOrigin))
	if err != nil || parsedOrigin.Scheme == "" || parsedOrigin.Host == "" {
		return ""
	}
	return strings.ToLower(parsedOrigin.Scheme) + "://" + strings.ToLower(parsedOrigin.Host)
}
