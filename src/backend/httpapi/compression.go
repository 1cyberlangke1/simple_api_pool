package httpapi

import (
	"compress/gzip"
	"net/http"
	"strings"
)

func CompressionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		writer := &gzipResponseWriter{
			ResponseWriter: w,
			request:        r,
			statusCode:     http.StatusOK,
		}
		defer writer.Close()
		next.ServeHTTP(writer, r)
	})
}

type gzipResponseWriter struct {
	http.ResponseWriter
	request       *http.Request
	gzipWriter    *gzip.Writer
	headerWritten bool
	compressing   bool
	statusCode    int
}

func (writer *gzipResponseWriter) WriteHeader(statusCode int) {
	writer.statusCode = statusCode
	writer.ensureHeaderWritten()
}

func (writer *gzipResponseWriter) Write(payload []byte) (int, error) {
	writer.ensureHeaderWritten()
	if writer.compressing && writer.gzipWriter != nil {
		return writer.gzipWriter.Write(payload)
	}
	return writer.ResponseWriter.Write(payload)
}

func (writer *gzipResponseWriter) Flush() {
	writer.ensureHeaderWritten()
	if writer.gzipWriter != nil {
		_ = writer.gzipWriter.Flush()
	}
	if flusher, ok := writer.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (writer *gzipResponseWriter) Close() {
	if writer.gzipWriter != nil {
		_ = writer.gzipWriter.Close()
	}
}

func (writer *gzipResponseWriter) ensureHeaderWritten() {
	if writer.headerWritten {
		return
	}
	writer.headerWritten = true

	contentEncoding := writer.Header().Get("Content-Encoding")
	contentType := writer.Header().Get("Content-Type")
	if contentEncoding == "" && shouldCompressContentType(contentType) {
		writer.compressing = true
		writer.Header().Set("Content-Encoding", "gzip")
		writer.Header().Add("Vary", "Accept-Encoding")
		writer.Header().Del("Content-Length")
		writer.gzipWriter = gzip.NewWriter(writer.ResponseWriter)
	}

	writer.ResponseWriter.WriteHeader(writer.statusCode)
}

func shouldCompressContentType(contentType string) bool {
	normalizedType := strings.ToLower(strings.TrimSpace(contentType))
	if normalizedType == "" {
		return false
	}
	if strings.HasPrefix(normalizedType, "text/event-stream") {
		return false
	}
	return strings.HasPrefix(normalizedType, "application/json") ||
		strings.HasPrefix(normalizedType, "text/plain") ||
		strings.HasPrefix(normalizedType, "text/html")
}
