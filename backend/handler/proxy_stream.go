package handler

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/token"
)

const maxCacheableStreamResponseBytes = 1 << 20

func (h *ProxyHandler) handleStream(ctx context.Context, w http.ResponseWriter, resp *http.Response, upstreamStart time.Time, provider, upstreamKey string, providerType config.ProviderType, suffix string, analysis requestAnalysis, recordedRequestBody *recordedRequestBody, cacheEnabled bool, cacheRoute bool, cacheMaxEntries int64, logFields *proxyLogFields) {
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
	var streamErr error
	allowStreamCache := cacheEnabled
	for {
		select {
		case <-ctx.Done():
			_ = resp.Body.Close()
			streamErr = ctx.Err()
			break
		default:
		}
		if streamErr != nil {
			break
		}

		n, err := resp.Body.Read(buf)
		if n > 0 {
			if !firstByteRecorded {
				logFields.FirstByteMs = time.Since(upstreamStart).Milliseconds()
				logFields.FirstByteMeasured = true
				firstByteRecorded = true
			}
			if allowStreamCache && collected.Len()+n <= maxCacheableStreamResponseBytes {
				_, _ = collected.Write(buf[:n])
			} else {
				allowStreamCache = false
			}
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				streamErr = writeErr
				break
			}
			flusher.Flush()
		}
		if err != nil {
			if err != io.EOF {
				streamErr = err
			}
			break
		}
	}

	logFields.Status = resp.StatusCode
	logFields.ResponseBytes = collected.Len()
	if logFields.Model == "" {
		analysis = ensureCacheAnalysis(analysis, providerType, suffix, recordedRequestBody)
		logFields.Model = analysis.model
	}
	if streamErr != nil {
		if errors.Is(streamErr, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			logFields.Error = "客户端已断开流式连接"
		} else {
			logFields.Error = "上游流式透传中断: " + streamErr.Error()
		}
		h.stats.RecordError(provider, http.StatusBadGateway)
		return
	}

	usage := token.ExtractFromStream(string(providerType), collected.Bytes(), h.cfg.TokenEstimationEnabled())
	h.stats.RecordSuccess(provider, usage.InputTokens, usage.OutputTokens)
	h.stats.RecordCacheTokens(provider, usage.CacheTokens)
	h.keyring.RecordSuccess(provider, upstreamKey)

	if allowStreamCache {
		analysis = ensureCacheAnalysis(analysis, providerType, suffix, recordedRequestBody)
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
