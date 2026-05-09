package applog

import (
	"bufio"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultFormat = "json"
	defaultLevel  = "info"
)

func InitFromEnv() *slog.Logger {
	level := parseLevel(os.Getenv("LOG_LEVEL"))
	format := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT")))
	if format == "" {
		format = defaultFormat
	}

	var handler slog.Handler
	opts := &slog.HandlerOptions{Level: level}
	switch format {
	case "text":
		handler = slog.NewTextHandler(os.Stdout, opts)
	default:
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}
	handler = NewRecentEntryHandler(handler)

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

func NewTestLogger(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)

		slog.Default().Info("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"query", SanitizeQuery(r.URL.RawQuery),
			"status", recorder.status,
			"response_bytes", recorder.bytes,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote_addr", r.RemoteAddr,
		)
	})
}

func MaskSecret(secret string) string {
	if secret == "" {
		return ""
	}
	if len(secret) <= 4 {
		return "****"
	}
	return "****" + secret[len(secret)-4:]
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(p []byte) (int, error) {
	n, err := r.ResponseWriter.Write(p)
	r.bytes += n
	return n, err
}

func (r *responseRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}
