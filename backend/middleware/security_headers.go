package middleware

import (
	"net/http"
	"strings"

	"simple-api-pool/webui"
)

func ApplySecurityHeaders(next http.Handler, contentSecurityPolicy string) http.Handler {
	if contentSecurityPolicy == "" {
		contentSecurityPolicy = webui.DefaultContentSecurityPolicy()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", contentSecurityPolicy)

		if r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/api/admin") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
		}

		next.ServeHTTP(w, r)
	})
}
