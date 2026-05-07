package handler

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/token"
)

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
			_, _ = w.Write(buf[:n])
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
	h.stats.RecordCacheTokens(provider, usage.CacheTokens)
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

func writeBufferedPassthroughResponse(w http.ResponseWriter, prefix []byte, tail io.Reader, upstreamStart time.Time, logFields *proxyLogFields) (int, error) {
	totalBytes := 0
	if len(prefix) > 0 {
		logFields.FirstByteMs = time.Since(upstreamStart).Milliseconds()
		logFields.FirstByteMeasured = true
		writtenBytes, err := w.Write(prefix)
		totalBytes += writtenBytes
		if err != nil {
			return totalBytes, err
		}
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
	}

	streamedBytes, err := io.Copy(w, tail)
	totalBytes += int(streamedBytes)
	return totalBytes, err
}
