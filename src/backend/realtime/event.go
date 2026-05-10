package realtime

import (
	"encoding/json"
	"fmt"
	"io"
)

const (
	KindStatsChanged        = "stats_changed"
	KindLogAppend           = "log_append"
	KindProvidersChanged    = "providers_changed"
	KindGlobalConfigChanged = "global_config_changed"

	SSEStatsDelta          = "stats_delta"
	SSELogAppend           = "log_append"
	SSEProvidersChanged    = "providers_changed"
	SSEGlobalConfigChanged = "global_config_changed"
	SSEResyncRequired      = "resync_required"
)

type LogEntry struct {
	Seq   uint64         `json:"seq"`
	Time  string         `json:"time"`
	Level string         `json:"level"`
	Msg   string         `json:"msg"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

type Event struct {
	ID       uint64
	Kind     string
	Provider string
	LogEntry *LogEntry
}

func WriteSSEEvent(w io.Writer, id uint64, eventName string, payload any) error {
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "id: %d\n", id); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", eventName); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", encodedPayload); err != nil {
		return err
	}
	return nil
}

func WriteSSEEventWithoutID(w io.Writer, eventName string, payload any) error {
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\n", eventName); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", encodedPayload); err != nil {
		return err
	}
	return nil
}

func WriteSSEComment(w io.Writer, comment string) error {
	if _, err := fmt.Fprintf(w, ": %s\n\n", comment); err != nil {
		return err
	}
	return nil
}
