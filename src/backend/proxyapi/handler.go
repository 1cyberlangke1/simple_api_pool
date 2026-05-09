package proxyapi

import (
	"bytes"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"simple-api-pool/applog"
	"simple-api-pool/auth"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/httpapi"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
)

var streamCopyBufferPool = sync.Pool{
	New: func() any {
		return make([]byte, 32*1024)
	},
}

var streamCaptureBufferPool = sync.Pool{
	New: func() any {
		return &bytes.Buffer{}
	},
}

const (
	maxRetainedStreamCaptureBodyBytes = 128 << 10
	maxUpstreamErrorLogBytes          = 4 << 10
)

type ProxyHandler struct {
	cfg                          *config.Config
	stats                        *stats.Manager
	keyring                      *keyring.KeyRing
	cache                        *cache.Store
	client                       *http.Client
	sema                         chan struct{}
	limiter                      *auth.FailureLimiter
	nonStreamResponseLimitBytes  int64
	cacheableRequestBodyLimit    int
	cacheableStreamResponseLimit int
}

func writeErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	httpapi.WriteErrorResponse(w, statusCode, message)
}

type cacheEventLogFields struct {
	Event         string
	Provider      string
	ProviderType  string
	Model         string
	CacheKey      string
	CacheRoute    bool
	Stream        bool
	Status        int
	RequestBytes  int
	ResponseBytes int
	InputTokens   int64
	OutputTokens  int64
}

func NewProxyHandler(cfg *config.Config, sm *stats.Manager, kr *keyring.KeyRing, cs *cache.Store, maxConcurrent int) *ProxyHandler {
	if maxConcurrent <= 0 {
		maxConcurrent = 50
	}
	return &ProxyHandler{
		cfg:     cfg,
		stats:   sm,
		keyring: kr,
		cache:   cs,
		client: &http.Client{
			Timeout: 5 * time.Minute,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
			Transport: &http.Transport{
				Proxy:               http.ProxyFromEnvironment,
				ForceAttemptHTTP2:   true,
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				MaxConnsPerHost:     20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		sema:                         make(chan struct{}, maxConcurrent),
		limiter:                      auth.NewFailureLimiter(20, time.Minute, 5*time.Minute),
		nonStreamResponseLimitBytes:  config.UpstreamResponseLimitBytes(),
		cacheableRequestBodyLimit:    config.CacheableRequestBodyLimitBytes(),
		cacheableStreamResponseLimit: config.CacheableStreamResponseLimitBytes(),
	}
}

func (h *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	logFields := proxyLogFields{
		Method: r.Method,
		Path:   r.URL.Path,
		Query:  applog.SanitizeQuery(r.URL.RawQuery),
	}
	defer func() {
		h.logProxyResult(start, logFields)
	}()

	if !h.authenticateClientRequest(w, r, &logFields) {
		return
	}

	proxyReq, ok := h.resolveProxyRequest(w, r, &logFields)
	if !ok {
		return
	}

	if !h.acquireUpstreamSlot(w, r, &logFields) {
		return
	}
	defer func() { <-h.sema }()

	isStream := isStreamingRequestHint(r)
	logFields.Stream = isStream

	preparation, ok := h.prepareRequestForUpstream(w, r, proxyReq, isStream, &logFields)
	if !ok {
		return
	}

	upstreamKey, ok := h.resolveUpstreamKey(w, proxyReq, &logFields)
	if !ok {
		return
	}

	upstreamReq, ok := h.buildUpstreamRequest(r, proxyReq, preparation.upstreamBodyReader, upstreamKey, &logFields)
	if !ok {
		writeErrorResponse(w, http.StatusInternalServerError, "创建上游请求失败")
		return
	}

	upstreamStart := time.Now()
	resp, err := h.client.Do(upstreamReq)
	if err != nil {
		h.handleUpstreamDoError(w, proxyReq, upstreamKey, err, &logFields)
		return
	}
	defer resp.Body.Close()
	logFields.UpstreamStatus = resp.StatusCode
	logFields.UpstreamHeaderMs = time.Since(upstreamStart).Milliseconds()
	if preparation.recordedRequestBody != nil {
		preparation.analysis.requestBytes = preparation.recordedRequestBody.BytesRead()
		logFields.RequestBytes = preparation.analysis.requestBytes
	}

	if resp.StatusCode >= 400 {
		h.handleUpstreamErrorResponse(w, resp, proxyReq, upstreamKey, preparation, &logFields)
		return
	}

	streamResponse := isStream || isStreamingResponse(resp.Header)
	logFields.Stream = streamResponse
	if streamResponse {
		h.handleStream(r.Context(), w, resp, upstreamStart, proxyReq.parts.provider, upstreamKey, proxyReq.provider.Type, proxyReq.parts.suffix, preparation.analysis, preparation.recordedRequestBody, preparation.cacheEligible, proxyReq.parts.useCache, int64(proxyReq.provider.CacheMaxEntries), &logFields)
		return
	}
	h.handleNonStreamResponse(w, resp, upstreamStart, proxyReq, upstreamKey, preparation, &logFields)
}

func shouldRecordUpstreamFailure(statusCode int) bool {
	switch {
	case statusCode == http.StatusUnauthorized:
		return true
	case statusCode == http.StatusForbidden:
		return true
	case statusCode == http.StatusTooManyRequests:
		return true
	case statusCode >= http.StatusInternalServerError:
		return true
	default:
		return false
	}
}

type proxyLogFields struct {
	Method            string
	Path              string
	Query             string
	Provider          string
	ProviderType      string
	Model             string
	CacheRoute        bool
	CacheHit          bool
	Stream            bool
	Status            int
	UpstreamStatus    int
	RequestBytes      int
	ResponseBytes     int
	UpstreamHeaderMs  int64
	FirstByteMs       int64
	FirstByteMeasured bool
	UpstreamHost      string
	UpstreamPath      string
	KeyRef            string
	Error             string
}

func (h *ProxyHandler) logProxyResult(start time.Time, fields proxyLogFields) {
	attrs := []any{
		"method", fields.Method,
		"path", fields.Path,
		"query", fields.Query,
		"provider", fields.Provider,
		"provider_type", fields.ProviderType,
		"model", fields.Model,
		"cache_route", fields.CacheRoute,
		"cache_hit", fields.CacheHit,
		"stream", fields.Stream,
		"status", fields.Status,
		"upstream_status", fields.UpstreamStatus,
		"request_bytes", fields.RequestBytes,
		"response_bytes", fields.ResponseBytes,
		"upstream_header_ms", fields.UpstreamHeaderMs,
		"duration_ms", time.Since(start).Milliseconds(),
	}
	if fields.FirstByteMeasured {
		attrs = append(attrs, "first_byte_ms", fields.FirstByteMs)
	}
	if fields.UpstreamHost != "" {
		attrs = append(attrs, "upstream_host", fields.UpstreamHost)
	}
	if fields.UpstreamPath != "" {
		attrs = append(attrs, "upstream_path", fields.UpstreamPath)
	}
	if fields.KeyRef != "" {
		attrs = append(attrs, "key_ref", fields.KeyRef)
	}

	logger := slog.Default()
	if fields.Error != "" || fields.Status >= 400 {
		attrs = append(attrs, "error", fields.Error)
		logger.Error("proxy_request", attrs...)
		return
	}
	logger.Info("proxy_request", attrs...)
}

func (h *ProxyHandler) logCacheEvent(fields cacheEventLogFields) {
	slog.Default().Info("cache_event",
		"event", fields.Event,
		"provider", fields.Provider,
		"provider_type", fields.ProviderType,
		"model", fields.Model,
		"cache_key", fields.CacheKey,
		"cache_route", fields.CacheRoute,
		"stream", fields.Stream,
		"status", fields.Status,
		"request_bytes", fields.RequestBytes,
		"response_bytes", fields.ResponseBytes,
		"input_tokens", fields.InputTokens,
		"output_tokens", fields.OutputTokens,
		"total_tokens", fields.InputTokens+fields.OutputTokens,
	)
}
