package middleware

import (
	"net/http"
	"strings"

	"simple-api-pool/webui"
)

func ApplySecurityHeaders(next http.Handler, contentSecurityPolicy func() string) http.Handler {
	if contentSecurityPolicy == nil {
		contentSecurityPolicy = webui.DefaultContentSecurityPolicy
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", contentSecurityPolicy())
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()")

		if r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/api/admin") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
		}

		next.ServeHTTP(w, r)
	})
}
