package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"sync"

	"github.com/tidwall/gjson"

	"simple-api-pool/cache"
	"simple-api-pool/config"
)

type requestAnalysis struct {
	model         string
	stream        bool
	cacheKey      string
	cacheKeyReady bool
	requestBody   []byte
	requestBytes  int
}

func analyzeRequestBody(providerType config.ProviderType, suffix string, body []byte, streamHint bool) requestAnalysis {
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

	analysis.model = extractRequestModel(providerType, suffix, body)
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
	readBytes, err := r.source.Read(p)
	if readBytes > 0 {
		r.mu.Lock()
		r.bytesRead += readBytes
		if r.copyBody != nil {
			remaining := r.copyLimit - r.copyBody.Len()
			if remaining > 0 {
				writeCount := readBytes
				if writeCount > remaining {
					writeCount = remaining
				}
				_, _ = r.copyBody.Write(p[:writeCount])
			}
			if readBytes > remaining {
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
	return readBytes, err
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
		readBytes, err := body.Read(chunk[:readSize])
		if readBytes > 0 {
			_, _ = captured.Write(chunk[:readBytes])
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

func readResponseBodyWithinLimit(body io.Reader, limitBytes int64) ([]byte, bool, error) {
	if limitBytes <= 0 {
		responseBody, err := io.ReadAll(body)
		return responseBody, true, err
	}

	limitedReader := io.LimitReader(body, limitBytes+1)
	responseBody, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, false, err
	}
	if int64(len(responseBody)) > limitBytes {
		return responseBody, false, nil
	}
	return responseBody, true, nil
}

func ensureCacheAnalysis(analysis requestAnalysis, providerType config.ProviderType, suffix string, recordedRequestBody *recordedRequestBody) requestAnalysis {
	if analysis.cacheKeyReady {
		return analysis
	}
	recordedBody, ok := recordedRequestBody.Snapshot()
	if !ok {
		return analysis
	}
	return analyzeRequestBody(providerType, suffix, recordedBody, analysis.stream)
}

func extractRequestModel(providerType config.ProviderType, suffix string, body []byte) string {
	model := gjson.GetBytes(body, "model").String()
	if model != "" {
		return model
	}

	switch providerType {
	case config.Gemini:
		return extractGeminiModelFromSuffix(suffix)
	default:
		return ""
	}
}

func extractGeminiModelFromSuffix(suffix string) string {
	const marker = "/models/"

	index := strings.Index(suffix, marker)
	if index == -1 {
		return ""
	}

	modelPath := suffix[index+len(marker):]
	if modelPath == "" {
		return ""
	}

	if slashIndex := strings.Index(modelPath, "/"); slashIndex >= 0 {
		modelPath = modelPath[:slashIndex]
	}
	if colonIndex := strings.Index(modelPath, ":"); colonIndex >= 0 {
		modelPath = modelPath[:colonIndex]
	}
	return strings.TrimSpace(modelPath)
}
