package proxyapi

import (
	"bytes"
	"errors"
	"fmt"
	"io"
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
	"simple-api-pool/token"
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
	maxCacheableRequestBodyBytes      = 256 << 10
	maxRetainedStreamCaptureBodyBytes = 128 << 10
	maxUpstreamErrorLogBytes          = 4 << 10
)

type ProxyHandler struct {
	cfg                         *config.Config
	stats                       *stats.Manager
	keyring                     *keyring.KeyRing
	cache                       *cache.Store
	client                      *http.Client
	sema                        chan struct{}
	limiter                     *auth.FailureLimiter
	nonStreamResponseLimitBytes int64
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
		sema:                        make(chan struct{}, maxConcurrent),
		limiter:                     auth.NewFailureLimiter(20, time.Minute, 5*time.Minute),
		nonStreamResponseLimitBytes: config.UpstreamResponseLimitBytes(),
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

	select {
	case h.sema <- struct{}{}:
	case <-time.After(30 * time.Second):
		logFields.Status = http.StatusServiceUnavailable
		logFields.Error = "等待上游槽位超时"
		writeErrorResponse(w, http.StatusServiceUnavailable, "上游繁忙，请稍后重试")
		return
	case <-r.Context().Done():
		logFields.Status = http.StatusRequestTimeout
		logFields.Error = "请求在等待上游槽位时已取消"
		writeErrorResponse(w, http.StatusRequestTimeout, "请求已取消")
		return
	}
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
				analysis = analyzeRequestBody(p.Type, parts.suffix, analysis.requestBody, isStream)
				if !logFields.Stream {
					logFields.Stream = analysis.stream
				}
				logFields.Model = analysis.model
				upstreamBodyReader = bytes.NewReader(analysis.requestBody)

				if entry, ok := h.cache.GetForRequestByKeyContext(r.Context(), parts.provider, p.Type, analysis.cacheKey, analysis.stream); ok {
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
					if _, err := w.Write(entry.ResponseBody); err != nil {
						logFields.Status = http.StatusBadGateway
						logFields.Error = fmt.Sprintf("写入缓存命中响应失败: %v", err)
					}
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
		if !useCache || cacheEligible {
			copyLimit = maxCacheableRequestBodyBytes
		}
		recordedRequestBody = newRecordedRequestBody(r.Body, copyLimit)
		upstreamBodyReader = recordedRequestBody
	}

	upstreamKey, err := h.keyring.GetKey(parts.provider)
	if err != nil {
		statusCode := http.StatusServiceUnavailable
		errMessage := "没有可用的上游密钥"
		switch {
		case errors.Is(err, keyring.ErrProviderNotFound):
			statusCode = http.StatusNotFound
			errMessage = "提供商不存在"
		case errors.Is(err, keyring.ErrNoKeysConfigured):
			errMessage = "提供商未配置上游密钥"
		case errors.Is(err, keyring.ErrAllKeysExhausted):
			errMessage = "所有上游密钥当前不可用"
		}
		h.stats.RecordError(parts.provider, statusCode)
		logFields.Status = statusCode
		logFields.Error = errMessage
		writeErrorResponse(w, statusCode, errMessage)
		return
	}
	if upstreamKey == "" {
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
		if logFields.Model == "" {
			analysis = ensureCacheAnalysis(analysis, p.Type, parts.suffix, recordedRequestBody)
			logFields.Model = analysis.model
		}
		if copyErr != nil && logFields.Error == "" {
			logFields.Error = fmt.Sprintf("读取上游错误响应失败: %v", copyErr)
		}
		if shouldRecordUpstreamFailure(resp.StatusCode) {
			h.keyring.RecordFailure(parts.provider, upstreamKey)
		}
		return
	}

	streamResponse := isStream || isStreamingResponse(resp.Header)
	logFields.Stream = streamResponse
	if streamResponse {
		h.handleStream(r.Context(), w, resp, upstreamStart, parts.provider, upstreamKey, p.Type, parts.suffix, analysis, recordedRequestBody, cacheEligible, parts.useCache, int64(p.CacheMaxEntries), &logFields)
		return
	}

	respBody, fitsWithinLimit, err := readResponseBodyWithinLimit(resp.Body, h.nonStreamResponseLimitBytes)
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusBadGateway)
		logFields.Status = http.StatusBadGateway
		logFields.Error = err.Error()
		writeErrorResponse(w, http.StatusBadGateway, "读取上游响应失败")
		return
	}
	if !fitsWithinLimit {
		logFields.Status = resp.StatusCode
		copyHeaders(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		responseBytes, copyErr := writeBufferedPassthroughResponse(w, respBody, resp.Body, upstreamStart, &logFields)
		logFields.ResponseBytes = responseBytes
		if logFields.Model == "" {
			analysis = ensureCacheAnalysis(analysis, p.Type, parts.suffix, recordedRequestBody)
			logFields.Model = analysis.model
		}
		if copyErr != nil {
			logFields.Error = fmt.Sprintf("透传上游响应失败: %v", copyErr)
			return
		}
		h.stats.RecordSuccess(parts.provider, 0, 0)
		h.keyring.RecordSuccess(parts.provider, upstreamKey)
		return
	}
	logFields.Status = resp.StatusCode
	logFields.ResponseBytes = len(respBody)
	if logFields.Model == "" {
		analysis = ensureCacheAnalysis(analysis, p.Type, parts.suffix, recordedRequestBody)
		logFields.Model = analysis.model
	}

	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	if _, err := w.Write(respBody); err != nil {
		h.stats.RecordError(parts.provider, http.StatusBadGateway)
		logFields.Status = http.StatusBadGateway
		logFields.Error = fmt.Sprintf("写入客户端响应失败: %v", err)
		return
	}

	usage := token.Extract(string(p.Type), respBody, h.cfg.TokenEstimationEnabled())
	h.stats.RecordSuccess(parts.provider, usage.InputTokens, usage.OutputTokens)
	h.stats.RecordCacheTokens(parts.provider, usage.CacheTokens)
	h.keyring.RecordSuccess(parts.provider, upstreamKey)

	if cacheEligible {
		analysis = ensureCacheAnalysis(analysis, p.Type, parts.suffix, recordedRequestBody)
		if analysis.cacheKeyReady {
			stored := h.cache.SetForRequestByKey(parts.provider, p.Type, analysis.cacheKey, respBody, resp.StatusCode, cacheableHeaders(resp.Header, false), usage.InputTokens, usage.OutputTokens, int64(p.CacheMaxEntries), false)
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
