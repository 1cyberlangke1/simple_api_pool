package statusapi

import (
	"net/http"
	"time"

	"simple-api-pool/httpapi"
	"simple-api-pool/realtime"
	"simple-api-pool/service"
)

const streamKeepAliveInterval = 15 * time.Second

type statsDeltaPayload struct {
	Provider string   `json:"provider"`
	Snapshot Snapshot `json:"snapshot"`
}

func (sh *Handler) handleStream(w http.ResponseWriter, r *http.Request) {
	after, err := realtime.ResolveAfter(r)
	if err != nil {
		httpapi.WriteErrorResponse(w, http.StatusBadRequest, "实时游标参数无效")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpapi.WriteErrorResponse(w, http.StatusInternalServerError, "当前响应不支持实时流")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	replayEvents, stream, cancel, gapDetected := realtime.Current().Subscribe(after)
	if gapDetected {
		_ = realtime.WriteSSEEventWithoutID(w, realtime.SSEResyncRequired, map[string]string{"reason": "gap"})
		flusher.Flush()
		return
	}
	defer cancel()

	for _, event := range replayEvents {
		wrote, writeErr := sh.writeStreamEvent(w, event)
		if writeErr != nil {
			return
		}
		if wrote {
			flusher.Flush()
		}
	}

	heartbeatTicker := time.NewTicker(streamKeepAliveInterval)
	defer heartbeatTicker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-stream:
			if !ok {
				return
			}
			wrote, writeErr := sh.writeStreamEvent(w, event)
			if writeErr != nil {
				return
			}
			if wrote {
				flusher.Flush()
			}
		case <-heartbeatTicker.C:
			if err := realtime.WriteSSEComment(w, "keepalive"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func (sh *Handler) writeStreamEvent(w http.ResponseWriter, event realtime.Event) (bool, error) {
	switch event.Kind {
	case realtime.KindStatsChanged:
		snapshot, exists := service.NewOverviewService(sh.cfg, sh.stats).ProviderStatusSnapshot(event.Provider)
		if !exists {
			return false, nil
		}
		return true, realtime.WriteSSEEvent(w, event.ID, realtime.SSEStatsDelta, statsDeltaPayload{
			Provider: event.Provider,
			Snapshot: snapshot,
		})
	case realtime.KindProvidersChanged:
		return true, realtime.WriteSSEEvent(w, event.ID, realtime.SSEProvidersChanged, map[string]string{"reason": "providers_changed"})
	default:
		return false, nil
	}
}
