package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/tidwall/gjson"

	"simple-api-pool/applog"
	"simple-api-pool/auth"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/token"
)

var streamCopyBufferPool = sync.Pool{
	New: func() any {
		buf := make([]byte, 32*1024)
		return &buf
	},
}

var streamCaptureBufferPool = sync.Pool{
	New: func() any {
		return &bytes.Buffer{}
	},
}

const (
	maxCacheableRequestBodyBytes = 1 << 20
	maxUpstreamErrorLogBytes     = 4 << 10
)

type requestAnalysis struct {
	model         string
	stream        bool
	cacheKey      string
	cacheKeyReady bool
	requestBody   []byte
	requestBytes  int
}

type ProxyHandler struct {
	cfg     *config.Config
	stats   *stats.Manager
	keyring *keyring.KeyRing
	cache   *cache.Store
	client  *http.Client
	sema    chan struct{}
	limiter *auth.FailureLimiter
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
			Transport: &http.Transport{
				Proxy:               http.ProxyFromEnvironment,
				ForceAttemptHTTP2:   true,
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				MaxConnsPerHost:     20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		sema:    make(chan struct{}, maxConcurrent),
		limiter: auth.NewFailureLimiter(20, time.Minute, 5*time.Minute),
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

	if h.limiter != nil && !h.limiter.Allow(r.RemoteAddr) {
		logFields.Status = http.StatusTooManyRequests
		logFields.Error = "鉴权失败次数过多，请稍后再试"
		writeErrorResponse(w, http.StatusTooManyRequests, "鉴权失败次数过多，请稍后再试")
		return
	}

	if !auth.CheckClientKey(r, h.cfg) {
		if h.limiter != nil {
			h.limiter.RecordFailure(r.RemoteAddr)
		}
		logFields.Status = http.StatusUnauthorized
		logFields.Error = "未授权"
		writeErrorResponse(w, http.StatusUnauthorized, "未授权")
		return
	}
	if h.limiter != nil {
		h.limiter.RecordSuccess(r.RemoteAddr)
	}

	parts := parsePath(r.URL.Path)
	logFields.Provider = parts.provider
	logFields.CacheRoute = parts.useCache
	if parts.provider == "" {
		logFields.Status = http.StatusBadRequest
		logFields.Error = "未指定提供商"
		writeErrorResponse(w, http.StatusBadRequest, "未指定提供商")
		return
	}

	useCache := parts.useCache

	p, _ := h.cfg.Provider(parts.provider)
	if p == nil {
		logFields.Status = http.StatusNotFound
		logFields.Error = "提供商不存在"
		writeErrorResponse(w, http.StatusNotFound, "提供商不存在")
		return
	}
	logFields.ProviderType = string(p.Type)
	cacheEligible := p.CacheEnabled && !isModelDiscoveryRequest(r.Method, parts.suffix)

	targetURL := buildTargetURL(p.Type, p.BaseURL, parts.suffix, r.URL.RawQuery)
	if targetURL == "" {
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "上游地址无效"
		writeErrorResponse(w, http.StatusInternalServerError, "上游地址无效")
		return
	}
	logFields.UpstreamHost, logFields.UpstreamPath = splitUpstreamURL(targetURL)

	h.sema <- struct{}{}
	defer func() { <-h.sema }()

	isStream := isStreamingRequestHint(r)
	logFields.Stream = isStream

	var (
		analysis            requestAnalysis
		upstreamBodyReader  io.Reader
		recordedRequestBody *recordedRequestBody
		err                 error
	)

	if useCache && cacheEligible {
		if r.ContentLength > maxCacheableRequestBodyBytes {
			cacheEligible = false
			recordedRequestBody = newRecordedRequestBody(r.Body, 0)
			upstreamBodyReader = recordedRequestBody
		} else {
			var requestBodyComplete bool
			analysis.requestBody, requestBodyComplete, err = readRequestBodyForCache(r.Body, maxCacheableRequestBodyBytes)
			if err != nil {
				logFields.Status = http.StatusBadRequest
				logFields.Error = "读取请求体失败"
				writeErrorResponse(w, http.StatusBadRequest, "读取请求体失败")
				return
			}
			if requestBodyComplete {
				analysis.requestBytes = len(analysis.requestBody)
				logFields.RequestBytes = analysis.requestBytes
				analysis = analyzeRequestBody(p.Type, analysis.requestBody, isStream)
				if !logFields.Stream {
					logFields.Stream = analysis.stream
				}
				logFields.Model = analysis.model
				upstreamBodyReader = bytes.NewReader(analysis.requestBody)

				if entry, ok := h.cache.GetForRequestByKey(parts.provider, p.Type, analysis.cacheKey, analysis.stream); ok {
					h.stats.RecordCacheHit(parts.provider, entry.InputTokens+entry.OutputTokens)
					logFields.CacheHit = true
					logFields.Status = entry.StatusCode
					logFields.UpstreamStatus = entry.StatusCode
					logFields.ResponseBytes = len(entry.ResponseBody)
					h.logCacheEvent(cacheEventLogFields{
						Event:         "hit",
						Provider:      parts.provider,
						ProviderType:  string(p.Type),
						Model:         analysis.model,
						CacheKey:      analysis.cacheKey,
						CacheRoute:    parts.useCache,
						Stream:        analysis.stream,
						Status:        entry.StatusCode,
						RequestBytes:  analysis.requestBytes,
						ResponseBytes: len(entry.ResponseBody),
						InputTokens:   entry.InputTokens,
						OutputTokens:  entry.OutputTokens,
					})
					for k, v := range entry.Headers {
						w.Header().Set(k, v)
					}
					w.WriteHeader(entry.StatusCode)
					_, _ = w.Write([]byte(entry.ResponseBody))
					return
				}
			} else {
				cacheEligible = false
				recordedRequestBody = newRecordedRequestBody(newPrefixedReadCloser(analysis.requestBody, r.Body), 0)
				upstreamBodyReader = recordedRequestBody
			}
		}
	} else {
		copyLimit := 0
		if cacheEligible {
			copyLimit = maxCacheableRequestBodyBytes
		}
		recordedRequestBody = newRecordedRequestBody(r.Body, copyLimit)
		upstreamBodyReader = recordedRequestBody
	}

	upstreamKey, err := h.keyring.GetKey(parts.provider)
	if err != nil || upstreamKey == "" {
		h.stats.RecordError(parts.provider, http.StatusServiceUnavailable)
		logFields.Status = http.StatusServiceUnavailable
		logFields.Error = "没有可用的上游密钥"
		writeErrorResponse(w, http.StatusServiceUnavailable, "没有可用的上游密钥")
		return
	}
	logFields.KeyRef = applog.MaskSecret(upstreamKey)

	upstreamReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, upstreamBodyReader)
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusInternalServerError)
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "创建上游请求失败"
		writeErrorResponse(w, http.StatusInternalServerError, "创建上游请求失败")
		return
	}

	copyHeaders(upstreamReq.Header, r.Header)
	clearClientAuth(upstreamReq, p.Type)
	setAuthHeader(upstreamReq, p.Type, upstreamKey)

	upstreamStart := time.Now()
	resp, err := h.client.Do(upstreamReq)
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusBadGateway)
		h.keyring.RecordFailure(parts.provider, upstreamKey)
		logFields.Status = http.StatusBadGateway
		logFields.Error = fmt.Sprintf("上游请求失败: %v", err)
		writeErrorResponse(w, http.StatusBadGateway, fmt.Sprintf("上游请求失败: %v", err))
		return
	}
	defer resp.Body.Close()
	logFields.UpstreamStatus = resp.StatusCode
	logFields.UpstreamHeaderMs = time.Since(upstreamStart).Milliseconds()
	if recordedRequestBody != nil {
		analysis.requestBytes = recordedRequestBody.BytesRead()
		logFields.RequestBytes = analysis.requestBytes
	}

	if resp.StatusCode >= 400 {
		h.stats.RecordError(parts.provider, resp.StatusCode)
		logFields.Status = resp.StatusCode
		copyHeaders(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		errorCapture := newLimitedLogBuffer(maxUpstreamErrorLogBytes)
		responseBytes, copyErr := io.Copy(w, io.TeeReader(resp.Body, errorCapture))
		logFields.ResponseBytes = int(responseBytes)
		logFields.Error = errorCapture.String()
		if copyErr != nil && logFields.Error == "" {
			logFields.Error = fmt.Sprintf("读取上游错误响应失败: %v", copyErr)
		}
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			h.keyring.RecordFailure(parts.provider, upstreamKey)
		}
		return
	}

	streamResponse := isStream || isStreamingResponse(resp.Header)
	logFields.Stream = streamResponse
	if streamResponse {
		h.handleStream(w, resp, upstreamStart, parts.provider, upstreamKey, p.Type, analysis, recordedRequestBody, cacheEligible, parts.useCache, int64(p.CacheMaxEntries), &logFields)
		return
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusInternalServerError)
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "读取上游响应失败"
		writeErrorResponse(w, http.StatusInternalServerError, "读取上游响应失败")
		return
	}
	logFields.Status = resp.StatusCode
	logFields.ResponseBytes = len(respBody)

	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)

	usage := token.Extract(string(p.Type), respBody, h.cfg.TokenEstimationEnabled())
	h.stats.RecordSuccess(parts.provider, usage.InputTokens, usage.OutputTokens)
	h.keyring.RecordSuccess(parts.provider, upstreamKey)

	if cacheEligible {
		analysis = ensureCacheAnalysis(analysis, p.Type, recordedRequestBody)
		if analysis.cacheKeyReady {
			stored := h.cache.SetByKey(parts.provider, p.Type, analysis.cacheKey, respBody, resp.StatusCode, cacheableHeaders(resp.Header, false), usage.InputTokens, usage.OutputTokens, int64(p.CacheMaxEntries))
			if stored {
				h.logCacheEvent(cacheEventLogFields{
					Event:         "store",
					Provider:      parts.provider,
					ProviderType:  string(p.Type),
					Model:         analysis.model,
					CacheKey:      analysis.cacheKey,
					CacheRoute:    parts.useCache,
					Stream:        false,
					Status:        resp.StatusCode,
					RequestBytes:  analysis.requestBytes,
					ResponseBytes: len(respBody),
					InputTokens:   usage.InputTokens,
					OutputTokens:  usage.OutputTokens,
				})
			}
		}
	}
}

func (h *ProxyHandler) handleStream(w http.ResponseWriter, resp *http.Response, upstreamStart time.Time, provider, upstreamKey string, providerType config.ProviderType, analysis requestAnalysis, recordedRequestBody *recordedRequestBody, cacheEnabled bool, cacheRoute bool, cacheMaxEntries int64, logFields *proxyLogFields) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "当前响应不支持流式转发"
		writeErrorResponse(w, http.StatusInternalServerError, "当前响应不支持流式转发")
		return
	}

	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	flusher.Flush()

	collected := streamCaptureBufferPool.Get().(*bytes.Buffer)
	collected.Reset()
	defer streamCaptureBufferPool.Put(collected)

	bufferPtr := streamCopyBufferPool.Get().(*[]byte)
	buf := *bufferPtr
	defer streamCopyBufferPool.Put(bufferPtr)
	firstByteRecorded := false
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if !firstByteRecorded {
				logFields.FirstByteMs = time.Since(upstreamStart).Milliseconds()
				logFields.FirstByteMeasured = true
				firstByteRecorded = true
			}
			collected.Write(buf[:n])
			w.Write(buf[:n])
			flusher.Flush()
		}
		if err != nil {
			break
		}
	}

	logFields.Status = resp.StatusCode
	logFields.ResponseBytes = collected.Len()
	usage := token.ExtractFromStream(string(providerType), collected.Bytes(), h.cfg.TokenEstimationEnabled())
	h.stats.RecordSuccess(provider, usage.InputTokens, usage.OutputTokens)
	h.keyring.RecordSuccess(provider, upstreamKey)

	if cacheEnabled {
		analysis = ensureCacheAnalysis(analysis, providerType, recordedRequestBody)
		if analysis.cacheKeyReady {
			stored := h.cache.SetForRequestByKey(provider, providerType, analysis.cacheKey, collected.Bytes(), resp.StatusCode, cacheableHeaders(resp.Header, true), usage.InputTokens, usage.OutputTokens, cacheMaxEntries, true)
			if stored {
				h.logCacheEvent(cacheEventLogFields{
					Event:         "store",
					Provider:      provider,
					ProviderType:  string(providerType),
					Model:         analysis.model,
					CacheKey:      analysis.cacheKey,
					CacheRoute:    cacheRoute,
					Stream:        true,
					Status:        resp.StatusCode,
					RequestBytes:  analysis.requestBytes,
					ResponseBytes: collected.Len(),
					InputTokens:   usage.InputTokens,
					OutputTokens:  usage.OutputTokens,
				})
			}
		}
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

type pathParts struct {
	useCache bool
	provider string
	suffix   string
}

func parsePath(path string) pathParts {
	var p pathParts
	path = strings.TrimPrefix(path, "/")
	if path == "" {
		return p
	}
	segments := strings.Split(path, "/")

	idx := 0
	if len(segments) > idx && segments[idx] == "cache" {
		p.useCache = true
		idx++
	}
	if len(segments) > idx {
		p.provider = segments[idx]
		idx++
	}
	if len(segments) > idx {
		p.suffix = "/" + strings.Join(segments[idx:], "/")
	}
	return p
}

func buildTargetURL(providerType config.ProviderType, baseURL, suffix, rawQuery string) string {
	base, err := url.Parse(strings.TrimRight(baseURL, "/") + suffix)
	if err != nil {
		return ""
	}
	queryValues, err := url.ParseQuery(rawQuery)
	if err != nil {
		return ""
	}
	sanitizeClientAuthQuery(queryValues, providerType)
	base.RawQuery = queryValues.Encode()
	return base.String()
}

func splitUpstreamURL(targetURL string) (string, string) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return "", ""
	}
	return u.Host, u.Path
}

func clearClientAuth(req *http.Request, providerType config.ProviderType) {
	req.Header.Del("Authorization")
	req.Header.Del("x-api-key")
	req.Header.Del("x-goog-api-key")

	queryValues := req.URL.Query()
	sanitizeClientAuthQuery(queryValues, providerType)
	req.URL.RawQuery = queryValues.Encode()
}

func sanitizeClientAuthQuery(values url.Values, providerType config.ProviderType) {
	switch providerType {
	case config.Gemini:
		values.Del("key")
	}
}

func setAuthHeader(req *http.Request, ptype config.ProviderType, key string) {
	switch ptype {
	case config.OpenAIChat, config.OpenAIResponses:
		req.Header.Set("Authorization", "Bearer "+key)
	case config.Claude:
		req.Header.Set("x-api-key", key)
	case config.Gemini:
		req.Header.Set("x-goog-api-key", key)
	}
}

func copyHeaders(dst, src http.Header) {
	for k, vs := range src {
		for _, v := range vs {
			dst.Add(k, v)
		}
	}
}

func isStreamingRequestHint(r *http.Request) bool {
	if strings.Contains(r.Header.Get("Accept"), "text/event-stream") || r.URL.Query().Get("stream") == "true" {
		return true
	}
	if strings.EqualFold(r.URL.Query().Get("alt"), "sse") {
		return true
	}
	return false
}

func analyzeRequestBody(providerType config.ProviderType, body []byte, streamHint bool) requestAnalysis {
	analysis := requestAnalysis{
		stream:       streamHint,
		requestBody:  body,
		requestBytes: len(body),
	}

	if len(body) == 0 {
		analysis.cacheKey = cache.BuildNormalizedCacheKey("", nil)
		analysis.cacheKeyReady = true
		return analysis
	}

	analysis.model = gjson.GetBytes(body, "model").String()
	if !analysis.stream {
		streamValue := gjson.GetBytes(body, "stream")
		if streamValue.Exists() {
			analysis.stream = streamValue.Bool()
		}
	}

	normalizedBody := normalizeRequestBodyForCache(providerType, body)

	analysis.cacheKey = cache.BuildNormalizedCacheKey(analysis.model, normalizedBody)
	analysis.cacheKeyReady = true
	return analysis
}

func normalizeRequestBodyForCache(providerType config.ProviderType, fallbackBody []byte) []byte {
	cacheField := cacheFieldForProviderType(providerType)
	if cacheField != "" {
		return normalizeCoreCacheField(cacheField, fallbackBody)
	}
	return normalizeTopLevelPayload(fallbackBody)
}

func normalizeCoreCacheField(cacheField string, fallbackBody []byte) []byte {
	var normalizedValue any
	rawValue := gjson.GetBytes(fallbackBody, cacheField)
	rawJSON := "null"
	if rawValue.Exists() {
		rawJSON = rawValue.Raw
	}
	if err := json.Unmarshal([]byte(rawJSON), &normalizedValue); err != nil {
		return fallbackBody
	}

	normalizedBody, err := json.Marshal(map[string]any{
		cacheField: normalizedValue,
	})
	if err != nil {
		return fallbackBody
	}
	return normalizedBody
}

func normalizeTopLevelPayload(fallbackBody []byte) []byte {
	var payload map[string]any
	if err := json.Unmarshal(fallbackBody, &payload); err != nil {
		return fallbackBody
	}
	delete(payload, "stream")
	delete(payload, "stream_options")
	normalizedBody, err := json.Marshal(payload)
	if err != nil {
		return fallbackBody
	}
	return normalizedBody
}

func isStreamingResponse(headers http.Header) bool {
	return strings.Contains(strings.ToLower(headers.Get("Content-Type")), "text/event-stream")
}

func cacheFieldForProviderType(providerType config.ProviderType) string {
	switch providerType {
	case config.OpenAIChat, config.Claude:
		return "messages"
	case config.OpenAIResponses:
		return "input"
	case config.Gemini:
		return "contents"
	default:
		return ""
	}
}

type recordedRequestBody struct {
	mu           sync.Mutex
	source       io.ReadCloser
	copyBody     *bytes.Buffer
	copyLimit    int
	copyExceeded bool
	bytesRead    int
	finished     bool
}

func newRecordedRequestBody(source io.ReadCloser, copyLimit int) *recordedRequestBody {
	var bodyBuffer *bytes.Buffer
	if copyLimit > 0 {
		bodyBuffer = &bytes.Buffer{}
	}
	return &recordedRequestBody{
		source:    source,
		copyBody:  bodyBuffer,
		copyLimit: copyLimit,
	}
}

func (r *recordedRequestBody) Read(p []byte) (int, error) {
	n, err := r.source.Read(p)
	if n > 0 {
		r.mu.Lock()
		r.bytesRead += n
		if r.copyBody != nil {
			remaining := r.copyLimit - r.copyBody.Len()
			if remaining > 0 {
				writeCount := n
				if writeCount > remaining {
					writeCount = remaining
				}
				_, _ = r.copyBody.Write(p[:writeCount])
			}
			if n > remaining {
				r.copyExceeded = true
				r.copyBody = nil
			}
		}
		r.mu.Unlock()
	}
	if err == io.EOF {
		r.mu.Lock()
		r.finished = true
		r.mu.Unlock()
	}
	return n, err
}

func (r *recordedRequestBody) Close() error {
	return r.source.Close()
}

func (r *recordedRequestBody) BytesRead() int {
	if r == nil {
		return 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.bytesRead
}

func (r *recordedRequestBody) Snapshot() ([]byte, bool) {
	if r == nil {
		return nil, false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.finished || r.copyBody == nil || r.copyExceeded {
		return nil, false
	}
	return append([]byte(nil), r.copyBody.Bytes()...), true
}

type prefixedReadCloser struct {
	reader io.Reader
	tail   io.Closer
}

func newPrefixedReadCloser(prefix []byte, tail io.ReadCloser) io.ReadCloser {
	return &prefixedReadCloser{
		reader: io.MultiReader(bytes.NewReader(prefix), tail),
		tail:   tail,
	}
}

func (r *prefixedReadCloser) Read(p []byte) (int, error) {
	return r.reader.Read(p)
}

func (r *prefixedReadCloser) Close() error {
	if r.tail == nil {
		return nil
	}
	return r.tail.Close()
}

type limitedLogBuffer struct {
	buf       bytes.Buffer
	limit     int
	truncated bool
}

func newLimitedLogBuffer(limit int) *limitedLogBuffer {
	return &limitedLogBuffer{limit: limit}
}

func (b *limitedLogBuffer) Write(p []byte) (int, error) {
	if b.limit <= 0 {
		return len(p), nil
	}
	remaining := b.limit - b.buf.Len()
	if remaining > 0 {
		writeCount := len(p)
		if writeCount > remaining {
			writeCount = remaining
		}
		_, _ = b.buf.Write(p[:writeCount])
	}
	if len(p) > remaining {
		b.truncated = true
	}
	return len(p), nil
}

func (b *limitedLogBuffer) String() string {
	value := strings.TrimSpace(b.buf.String())
	if b.truncated {
		if value == "" {
			return "上游错误响应过大，已截断日志"
		}
		return value + " ...(truncated)"
	}
	return value
}

func readRequestBodyForCache(body io.ReadCloser, limit int) ([]byte, bool, error) {
	if limit <= 0 {
		return nil, false, nil
	}

	var captured bytes.Buffer
	chunk := make([]byte, 32*1024)
	maxBytes := limit + 1

	for captured.Len() <= limit {
		readSize := len(chunk)
		remaining := maxBytes - captured.Len()
		if remaining < readSize {
			readSize = remaining
		}
		n, err := body.Read(chunk[:readSize])
		if n > 0 {
			_, _ = captured.Write(chunk[:n])
		}
		if err == io.EOF {
			return captured.Bytes(), true, nil
		}
		if err != nil {
			return nil, false, err
		}
		if captured.Len() > limit {
			break
		}
	}

	return captured.Bytes(), false, nil
}

func ensureCacheAnalysis(analysis requestAnalysis, providerType config.ProviderType, recordedRequestBody *recordedRequestBody) requestAnalysis {
	if analysis.cacheKeyReady {
		return analysis
	}
	recordedBody, ok := recordedRequestBody.Snapshot()
	if !ok {
		return analysis
	}
	return analyzeRequestBody(providerType, recordedBody, analysis.stream)
}

func isModelDiscoveryRequest(method, suffix string) bool {
	if method != http.MethodGet {
		return false
	}

	switch strings.TrimSuffix(suffix, "/") {
	case "/v1/models", "/v1beta/models":
		return true
	default:
		return false
	}
}

func cacheableHeaders(headers http.Header, isStream bool) map[string]string {
	out := make(map[string]string)
	for k := range headers {
		if strings.EqualFold(k, "Content-Length") || strings.EqualFold(k, "Transfer-Encoding") {
			continue
		}
		out[k] = headers.Get(k)
	}
	if _, ok := out["Content-Type"]; !ok && !isStream {
		out["Content-Type"] = "application/json"
	}
	return out
}
