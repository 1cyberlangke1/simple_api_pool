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
	"time"

	"simple-api-pool/applog"
	"simple-api-pool/auth"
	"simple-api-pool/cache"
	"simple-api-pool/config"
	"simple-api-pool/keyring"
	"simple-api-pool/stats"
	"simple-api-pool/token"
)

type ProxyHandler struct {
	cfg     *config.Config
	stats   *stats.Manager
	keyring *keyring.KeyRing
	cache   *cache.Store
	sema    chan struct{}
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
		sema:    make(chan struct{}, maxConcurrent),
	}
}

func (h *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	logFields := proxyLogFields{
		Method: r.Method,
		Path:   r.URL.Path,
		Query:  r.URL.RawQuery,
	}
	defer func() {
		h.logProxyResult(start, logFields)
	}()

	if !auth.CheckClientKey(r, h.cfg) {
		logFields.Status = http.StatusUnauthorized
		logFields.Error = "未授权"
		writeJSONError(w, http.StatusUnauthorized, "未授权")
		return
	}
	h.sema <- struct{}{}
	defer func() { <-h.sema }()

	parts := parsePath(r.URL.Path)
	logFields.Provider = parts.provider
	logFields.CacheRoute = parts.useCache
	if parts.provider == "" {
		logFields.Status = http.StatusBadRequest
		logFields.Error = "未指定提供商"
		writeJSONError(w, http.StatusBadRequest, "未指定提供商")
		return
	}

	useCache := parts.useCache

	p, _ := h.cfg.Provider(parts.provider)
	if p == nil {
		logFields.Status = http.StatusNotFound
		logFields.Error = "提供商不存在"
		writeJSONError(w, http.StatusNotFound, "提供商不存在")
		return
	}
	logFields.ProviderType = string(p.Type)

	targetURL := buildTargetURL(p.Type, p.BaseURL, parts.suffix, r.URL.RawQuery)
	if targetURL == "" {
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "上游地址无效"
		writeJSONError(w, http.StatusInternalServerError, "上游地址无效")
		return
	}
	logFields.UpstreamHost, logFields.UpstreamPath = splitUpstreamURL(targetURL)

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		logFields.Status = http.StatusBadRequest
		logFields.Error = "读取请求体失败"
		writeJSONError(w, http.StatusBadRequest, "读取请求体失败")
		return
	}
	r.Body.Close()
	logFields.RequestBytes = len(bodyBytes)

	model := extractModel(bodyBytes)
	logFields.Model = model
	isStream := isStreamRequest(r, bodyBytes)
	logFields.Stream = isStream

	if useCache && p.CacheEnabled {
		if entry, ok := h.cache.Get(parts.provider, p.Type, model, bodyBytes); ok {
			h.stats.RecordCacheHit(parts.provider, entry.InputTokens+entry.OutputTokens)
			logFields.CacheHit = true
			logFields.Status = entry.StatusCode
			logFields.UpstreamStatus = entry.StatusCode
			logFields.ResponseBytes = len(entry.CachedBody)
			headers := entry.Headers
			if isStream {
				headers["Content-Type"] = "text/event-stream"
				delete(headers, "Content-Length")
				logFields.ResponseBytes = len(entry.CachedStreamBody)
			}
			for k, v := range headers {
				w.Header().Set(k, v)
			}
			w.WriteHeader(entry.StatusCode)
			body := entry.CachedBody
			if isStream {
				body = entry.CachedStreamBody
			}
			w.Write(body)
			return
		}
	}

	upstreamKey, err := h.keyring.GetKey(parts.provider)
	if err != nil || upstreamKey == "" {
		h.stats.RecordError(parts.provider, http.StatusServiceUnavailable)
		logFields.Status = http.StatusServiceUnavailable
		logFields.Error = "没有可用的上游密钥"
		writeJSONError(w, http.StatusServiceUnavailable, "没有可用的上游密钥")
		return
	}
	logFields.KeyRef = applog.MaskSecret(upstreamKey)

	upstreamReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusInternalServerError)
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "创建上游请求失败"
		writeJSONError(w, http.StatusInternalServerError, "创建上游请求失败")
		return
	}

	copyHeaders(upstreamReq.Header, r.Header)
	clearClientAuth(upstreamReq, p.Type)
	setAuthHeader(upstreamReq, p.Type, upstreamKey)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(upstreamReq)
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusBadGateway)
		h.keyring.RecordFailure(parts.provider, upstreamKey)
		logFields.Status = http.StatusBadGateway
		logFields.Error = fmt.Sprintf("上游请求失败: %v", err)
		writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("上游请求失败: %v", err))
		return
	}
	defer resp.Body.Close()
	logFields.UpstreamStatus = resp.StatusCode

	if resp.StatusCode >= 400 {
		h.stats.RecordError(parts.provider, resp.StatusCode)
		errBody, _ := io.ReadAll(resp.Body)
		logFields.Status = resp.StatusCode
		logFields.ResponseBytes = len(errBody)
		logFields.Error = strings.TrimSpace(string(errBody))
		copyHeaders(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		w.Write(errBody)
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			h.keyring.RecordFailure(parts.provider, upstreamKey)
		}
		return
	}

	if isStream {
		h.handleStream(w, resp, parts.provider, upstreamKey, p.Type, model, bodyBytes, p.CacheEnabled, int64(p.CacheMaxEntries), &logFields)
		return
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		h.stats.RecordError(parts.provider, http.StatusInternalServerError)
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "读取上游响应失败"
		writeJSONError(w, http.StatusInternalServerError, "读取上游响应失败")
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

	if p.CacheEnabled {
		headers := make(map[string]string)
		for k := range resp.Header {
			headers[k] = resp.Header.Get(k)
		}
		h.cache.Set(parts.provider, p.Type, model, bodyBytes, respBody, resp.StatusCode, headers, usage.InputTokens, usage.OutputTokens, int64(p.CacheMaxEntries))
	}
}

func (h *ProxyHandler) handleStream(w http.ResponseWriter, resp *http.Response, provider, upstreamKey string, providerType config.ProviderType, model string, requestBody []byte, cacheEnabled bool, cacheMaxEntries int64, logFields *proxyLogFields) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		logFields.Status = http.StatusInternalServerError
		logFields.Error = "当前响应不支持流式转发"
		writeJSONError(w, http.StatusInternalServerError, "当前响应不支持流式转发")
		return
	}

	copyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	flusher.Flush()

	var collected bytes.Buffer
	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
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
		if canonicalBody, ok := canonicalResponseFromStream(string(providerType), collected.Bytes()); ok {
			h.cache.Set(provider, providerType, model, requestBody, canonicalBody, resp.StatusCode, cacheableHeaders(resp.Header), usage.InputTokens, usage.OutputTokens, cacheMaxEntries)
		}
	}
}

type proxyLogFields struct {
	Method         string
	Path           string
	Query          string
	Provider       string
	ProviderType   string
	Model          string
	CacheRoute     bool
	CacheHit       bool
	Stream         bool
	Status         int
	UpstreamStatus int
	RequestBytes   int
	ResponseBytes  int
	UpstreamHost   string
	UpstreamPath   string
	KeyRef         string
	Error          string
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
		"duration_ms", time.Since(start).Milliseconds(),
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

func extractModel(body []byte) string {
	var req struct {
		Model string `json:"model"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		return ""
	}
	return req.Model
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

func isStreamRequest(r *http.Request, body []byte) bool {
	if strings.Contains(r.Header.Get("Accept"), "text/event-stream") || r.URL.Query().Get("stream") == "true" {
		return true
	}

	var payload struct {
		Stream bool `json:"stream"`
	}
	if err := json.Unmarshal(body, &payload); err == nil && payload.Stream {
		return true
	}
	return false
}

func canonicalResponseFromStream(providerType string, body []byte) ([]byte, bool) {
	switch providerType {
	case string(config.OpenAIChat):
		return canonicalOpenAIChatResponse(body)
	case string(config.OpenAIResponses):
		return canonicalOpenAIResponsesResponse(body)
	case string(config.Claude):
		return canonicalClaudeResponse(body)
	case string(config.Gemini):
		return canonicalGeminiResponse(body)
	default:
		return nil, false
	}
}

func canonicalOpenAIChatResponse(body []byte) ([]byte, bool) {
	lines := strings.Split(string(body), "\n")
	var id string
	var model string
	var role string
	var finishReason any
	var content strings.Builder
	var usage map[string]any

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "data: ") || line == "data: [DONE]" {
			continue
		}

		jsonStr := strings.TrimPrefix(line, "data: ")
		var chunk struct {
			ID      string `json:"id"`
			Model   string `json:"model"`
			Choices []struct {
				Index        int `json:"index"`
				FinishReason any `json:"finish_reason"`
				Delta        struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Usage map[string]any `json:"usage"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &chunk); err != nil {
			continue
		}

		if chunk.ID != "" {
			id = chunk.ID
		}
		if chunk.Model != "" {
			model = chunk.Model
		}
		if len(chunk.Choices) > 0 {
			choice := chunk.Choices[0]
			if choice.Delta.Role != "" {
				role = choice.Delta.Role
			}
			if choice.Delta.Content != "" {
				content.WriteString(choice.Delta.Content)
			}
			if choice.FinishReason != nil {
				finishReason = choice.FinishReason
			}
		}
		if len(chunk.Usage) > 0 {
			usage = chunk.Usage
		}
	}

	if content.Len() == 0 && len(usage) == 0 {
		return nil, false
	}
	if role == "" {
		role = "assistant"
	}

	response := map[string]any{
		"id":     id,
		"object": "chat.completion",
		"model":  model,
		"choices": []map[string]any{
			{
				"index": 0,
				"message": map[string]any{
					"role":    role,
					"content": content.String(),
				},
				"finish_reason": finishReason,
			},
		},
	}
	if len(usage) > 0 {
		response["usage"] = usage
	}

	payload, err := json.Marshal(response)
	if err != nil {
		return nil, false
	}
	return payload, true
}

func canonicalClaudeResponse(body []byte) ([]byte, bool) {
	lines := strings.Split(string(body), "\n")
	var message map[string]any
	var usage map[string]any
	var content strings.Builder
	var stopReason any
	var stopSequence any

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		jsonStr := strings.TrimPrefix(line, "data: ")
		var event struct {
			Type         string         `json:"type"`
			Message      map[string]any `json:"message"`
			ContentBlock map[string]any `json:"content_block"`
			Delta        map[string]any `json:"delta"`
			Usage        map[string]any `json:"usage"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &event); err != nil {
			continue
		}

		switch event.Type {
		case "message_start":
			if len(event.Message) > 0 {
				message = event.Message
			}
		case "content_block_delta":
			if deltaType, _ := event.Delta["type"].(string); deltaType == "text_delta" {
				if text, _ := event.Delta["text"].(string); text != "" {
					content.WriteString(text)
				}
			}
		case "message_delta":
			if len(event.Usage) > 0 {
				usage = event.Usage
			}
			if len(event.Delta) > 0 {
				if value, ok := event.Delta["stop_reason"]; ok {
					stopReason = value
				}
				if value, ok := event.Delta["stop_sequence"]; ok {
					stopSequence = value
				}
			}
		}
	}

	if message == nil && content.Len() == 0 {
		return nil, false
	}
	if message == nil {
		message = make(map[string]any)
	}

	response := map[string]any{
		"id":            message["id"],
		"type":          "message",
		"role":          "assistant",
		"model":         message["model"],
		"stop_reason":   stopReason,
		"stop_sequence": stopSequence,
		"content": []map[string]any{
			{
				"type": "text",
				"text": content.String(),
			},
		},
	}
	if len(usage) > 0 {
		response["usage"] = usage
	}

	payload, err := json.Marshal(response)
	if err != nil {
		return nil, false
	}
	return payload, true
}

func canonicalOpenAIResponsesResponse(body []byte) ([]byte, bool) {
	lines := strings.Split(string(body), "\n")
	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "data: ") || line == "data: [DONE]" {
			continue
		}

		jsonStr := strings.TrimPrefix(line, "data: ")
		var event struct {
			Type     string         `json:"type"`
			Response map[string]any `json:"response"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &event); err != nil {
			continue
		}
		if event.Type == "response.completed" && len(event.Response) > 0 {
			payload, err := json.Marshal(event.Response)
			if err == nil {
				return payload, true
			}
		}
	}
	return nil, false
}

func canonicalGeminiResponse(body []byte) ([]byte, bool) {
	lines := strings.Split(string(body), "\n")
	var role string
	var finishReason any
	var usageMetadata map[string]any
	var text strings.Builder

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		jsonStr := strings.TrimPrefix(line, "data: ")
		var chunk struct {
			Candidates []struct {
				FinishReason any `json:"finishReason"`
				Content      struct {
					Role  string `json:"role"`
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
			UsageMetadata map[string]any `json:"usageMetadata"`
		}
		if err := json.Unmarshal([]byte(jsonStr), &chunk); err != nil {
			continue
		}

		if len(chunk.Candidates) > 0 {
			candidate := chunk.Candidates[0]
			if candidate.Content.Role != "" {
				role = candidate.Content.Role
			}
			for _, part := range candidate.Content.Parts {
				if part.Text != "" {
					text.WriteString(part.Text)
				}
			}
			if candidate.FinishReason != nil {
				finishReason = candidate.FinishReason
			}
		}
		if len(chunk.UsageMetadata) > 0 {
			usageMetadata = chunk.UsageMetadata
		}
	}

	if text.Len() == 0 && len(usageMetadata) == 0 {
		return nil, false
	}
	if role == "" {
		role = "model"
	}

	response := map[string]any{
		"candidates": []map[string]any{
			{
				"content": map[string]any{
					"role": role,
					"parts": []map[string]any{
						{"text": text.String()},
					},
				},
				"finishReason": finishReason,
			},
		},
	}
	if len(usageMetadata) > 0 {
		response["usageMetadata"] = usageMetadata
	}

	payload, err := json.Marshal(response)
	if err != nil {
		return nil, false
	}
	return payload, true
}

func cacheableHeaders(headers http.Header) map[string]string {
	out := make(map[string]string)
	for k := range headers {
		if strings.EqualFold(k, "Content-Type") {
			out[k] = "application/json"
			continue
		}
		if strings.EqualFold(k, "Content-Length") || strings.EqualFold(k, "Transfer-Encoding") {
			continue
		}
		out[k] = headers.Get(k)
	}
	if _, ok := out["Content-Type"]; !ok {
		out["Content-Type"] = "application/json"
	}
	return out
}
