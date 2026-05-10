package applog

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dustin/go-humanize"

	"simple-api-pool/realtime"
)

const defaultRecentEntryLimit = 200
const defaultRecentEntryMaxBytes = 2 * 1024 * 1024

type Entry struct {
	Seq   uint64         `json:"seq"`
	Time  string         `json:"time"`
	Level string         `json:"level"`
	Msg   string         `json:"msg"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

type RecentEntryDelta struct {
	Entries    []Entry `json:"entries"`
	NextCursor uint64  `json:"next_cursor"`
	Gap        bool    `json:"gap"`
	Snapshot   []Entry `json:"snapshot,omitempty"`
}

type entryRingBuffer struct {
	mu         sync.RWMutex
	entries    []Entry
	entrySizes []int
	start      int
	count      int
	limit      int
	maxBytes   int
	totalBytes int
	nextSeq    uint64
}

var entryBuffer atomic.Pointer[entryRingBuffer]

func init() {
	entryBuffer.Store(newEntryRingBuffer(loadRecentEntryLimitFromEnv(), loadRecentEntryMaxBytesFromEnv()))
}

func RecentEntries(limit int) []Entry {
	return currentEntryBuffer().snapshot(limit)
}

func RecentEntriesAfter(after uint64, limit int) RecentEntryDelta {
	return currentEntryBuffer().delta(after, limit)
}

func ReplaceRecentEntriesForTesting(limit int) func() {
	previous := currentEntryBuffer()
	entryBuffer.Store(newEntryRingBuffer(limit, defaultRecentEntryMaxBytes))
	return func() {
		entryBuffer.Store(previous)
	}
}

func ReplaceRecentEntriesForTestingWithBytes(limit, maxBytes int) func() {
	previous := currentEntryBuffer()
	entryBuffer.Store(newEntryRingBuffer(limit, maxBytes))
	return func() {
		entryBuffer.Store(previous)
	}
}

func AppendRecentEntryForTesting(entry Entry) {
	appendRecentEntry(entry)
}

func loadRecentEntryLimitFromEnv() int {
	raw := os.Getenv("LOG_BUFFER_LIMIT")
	if raw == "" {
		return defaultRecentEntryLimit
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		slog.Warn("invalid LOG_BUFFER_LIMIT, falling back to default", "value", raw, "default", defaultRecentEntryLimit)
		return defaultRecentEntryLimit
	}
	return parsed
}

func loadRecentEntryMaxBytesFromEnv() int {
	raw := os.Getenv("LOG_BUFFER_MAX_BYTES")
	if raw == "" {
		return defaultRecentEntryMaxBytes
	}

	if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
		return parsed
	}

	parsed, err := humanize.ParseBytes(raw)
	if err != nil || parsed == 0 {
		slog.Warn("invalid LOG_BUFFER_MAX_BYTES, falling back to default", "value", raw, "default", defaultRecentEntryMaxBytes)
		return defaultRecentEntryMaxBytes
	}
	return int(parsed)
}

func currentEntryBuffer() *entryRingBuffer {
	buffer := entryBuffer.Load()
	if buffer == nil {
		buffer = newEntryRingBuffer(defaultRecentEntryLimit, defaultRecentEntryMaxBytes)
		entryBuffer.Store(buffer)
	}
	return buffer
}

func newEntryRingBuffer(limit, maxBytes int) *entryRingBuffer {
	if limit <= 0 {
		limit = defaultRecentEntryLimit
	}
	if maxBytes <= 0 {
		maxBytes = defaultRecentEntryMaxBytes
	}
	return &entryRingBuffer{
		entries:    make([]Entry, limit),
		entrySizes: make([]int, limit),
		limit:      limit,
		maxBytes:   maxBytes,
		nextSeq:    1,
	}
}

func (buffer *entryRingBuffer) append(entry Entry) (Entry, bool) {
	buffer.mu.Lock()

	if entry.Seq == 0 {
		entry.Seq = buffer.nextSeq
		buffer.nextSeq++
	} else if entry.Seq >= buffer.nextSeq {
		buffer.nextSeq = entry.Seq + 1
	}

	entrySize := estimateEntrySize(entry)
	if entrySize > buffer.maxBytes {
		buffer.mu.Unlock()
		return Entry{}, false
	}
	if buffer.count == buffer.limit {
		buffer.evictOldestLocked()
	}

	insertIndex := (buffer.start + buffer.count) % buffer.limit
	buffer.entries[insertIndex] = entry
	buffer.entrySizes[insertIndex] = entrySize
	buffer.count++
	buffer.totalBytes += entrySize

	for buffer.count > 1 && buffer.totalBytes > buffer.maxBytes {
		buffer.evictOldestLocked()
	}
	buffer.mu.Unlock()
	return entry, true
}

func appendRecentEntry(entry Entry) {
	buffer := currentEntryBuffer()
	appendedEntry, appended := buffer.append(entry)
	if !appended {
		return
	}
	realtime.PublishLog(realtime.LogEntry{
		Seq:   appendedEntry.Seq,
		Time:  appendedEntry.Time,
		Level: appendedEntry.Level,
		Msg:   appendedEntry.Msg,
		Attrs: appendedEntry.Attrs,
	})
}

func (buffer *entryRingBuffer) evictOldestLocked() {
	if buffer.count == 0 {
		return
	}

	buffer.totalBytes -= buffer.entrySizes[buffer.start]
	buffer.entries[buffer.start] = Entry{}
	buffer.entrySizes[buffer.start] = 0
	buffer.start = (buffer.start + 1) % buffer.limit
	buffer.count--
}

func estimateEntrySize(entry Entry) int {
	estimatedSize := len(entry.Time) + len(entry.Level) + len(entry.Msg)
	for key, value := range entry.Attrs {
		estimatedSize += len(key) + estimateAnySize(value) + 8
	}
	return estimatedSize
}

func estimateAnySize(value any) int {
	switch typed := value.(type) {
	case nil:
		return 4
	case string:
		return len(typed)
	case bool:
		if typed {
			return 4
		}
		return 5
	case int:
		return len(strconv.Itoa(typed))
	case int8, int16, int32, int64:
		return len(fmt.Sprint(typed))
	case uint, uint8, uint16, uint32, uint64:
		return len(fmt.Sprint(typed))
	case float32, float64:
		return len(fmt.Sprint(typed))
	case []any:
		size := 2
		for _, item := range typed {
			size += estimateAnySize(item) + 1
		}
		return size
	case map[string]any:
		size := 2
		for key, item := range typed {
			size += len(key) + estimateAnySize(item) + 4
		}
		return size
	default:
		return len(fmt.Sprint(typed))
	}
}

func (buffer *entryRingBuffer) snapshot(limit int) []Entry {
	buffer.mu.RLock()
	defer buffer.mu.RUnlock()

	return buffer.snapshotLocked(limit)
}

func (buffer *entryRingBuffer) snapshotLocked(limit int) []Entry {
	if limit <= 0 || limit > buffer.count {
		limit = buffer.count
	}
	result := make([]Entry, 0, limit)
	startOffset := buffer.count - limit
	for offset := startOffset; offset < buffer.count; offset++ {
		index := (buffer.start + offset) % buffer.limit
		result = append(result, buffer.entries[index])
	}
	return result
}

func (buffer *entryRingBuffer) delta(after uint64, limit int) RecentEntryDelta {
	buffer.mu.RLock()
	defer buffer.mu.RUnlock()

	if buffer.count == 0 {
		gapDetected := after > 0
		return RecentEntryDelta{
			Entries:    make([]Entry, 0),
			NextCursor: 0,
			Gap:        gapDetected,
			Snapshot:   make([]Entry, 0),
		}
	}
	if limit <= 0 || limit > buffer.count {
		limit = buffer.count
	}

	oldestEntry := buffer.entries[buffer.start]
	newestIndex := (buffer.start + buffer.count - 1) % buffer.limit
	newestEntry := buffer.entries[newestIndex]

	if after == 0 {
		entries := buffer.snapshotLocked(limit)
		return RecentEntryDelta{
			Entries:    entries,
			NextCursor: newestEntry.Seq,
			Gap:        false,
			Snapshot:   make([]Entry, 0),
		}
	}
	if after > newestEntry.Seq {
		snapshot := buffer.snapshotLocked(limit)
		return RecentEntryDelta{
			Entries:    make([]Entry, 0),
			NextCursor: newestEntry.Seq,
			Gap:        true,
			Snapshot:   snapshot,
		}
	}
	if after == newestEntry.Seq {
		return RecentEntryDelta{
			Entries:    make([]Entry, 0),
			NextCursor: newestEntry.Seq,
			Gap:        false,
			Snapshot:   make([]Entry, 0),
		}
	}
	if after+1 < oldestEntry.Seq {
		snapshot := buffer.snapshotLocked(limit)
		return RecentEntryDelta{
			Entries:    make([]Entry, 0),
			NextCursor: newestEntry.Seq,
			Gap:        true,
			Snapshot:   snapshot,
		}
	}

	entries := make([]Entry, 0, limit)
	for offset := 0; offset < buffer.count; offset++ {
		index := (buffer.start + offset) % buffer.limit
		entry := buffer.entries[index]
		if entry.Seq <= after {
			continue
		}
		entries = append(entries, entry)
		if len(entries) >= limit {
			break
		}
	}

	nextCursor := newestEntry.Seq
	if len(entries) > 0 {
		nextCursor = entries[len(entries)-1].Seq
	}
	return RecentEntryDelta{
		Entries:    entries,
		NextCursor: nextCursor,
		Gap:        false,
		Snapshot:   make([]Entry, 0),
	}
}

type RecentEntryHandler struct {
	nextHandler  slog.Handler
	fixedAttrs   []slog.Attr
	activeGroups []string
}

func NewRecentEntryHandler(nextHandler slog.Handler) *RecentEntryHandler {
	return &RecentEntryHandler{
		nextHandler:  nextHandler,
		fixedAttrs:   make([]slog.Attr, 0),
		activeGroups: make([]string, 0),
	}
}

func (handler *RecentEntryHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return handler.nextHandler.Enabled(ctx, level)
}

func (handler *RecentEntryHandler) Handle(ctx context.Context, record slog.Record) error {
	attributes := make(map[string]any)
	for _, attr := range handler.fixedAttrs {
		appendAttribute(attributes, handler.activeGroups, attr)
	}
	record.Attrs(func(attr slog.Attr) bool {
		appendAttribute(attributes, handler.activeGroups, attr)
		return true
	})

	entry := Entry{
		Time:  record.Time.Format(time.RFC3339Nano),
		Level: record.Level.String(),
		Msg:   record.Message,
	}
	if len(attributes) > 0 {
		entry.Attrs = attributes
	}
	appendRecentEntry(entry)
	return handler.nextHandler.Handle(ctx, record)
}

func (handler *RecentEntryHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	clonedAttrs := make([]slog.Attr, 0, len(handler.fixedAttrs)+len(attrs))
	clonedAttrs = append(clonedAttrs, handler.fixedAttrs...)
	clonedAttrs = append(clonedAttrs, attrs...)

	clonedGroups := make([]string, len(handler.activeGroups))
	copy(clonedGroups, handler.activeGroups)

	return &RecentEntryHandler{
		nextHandler:  handler.nextHandler.WithAttrs(attrs),
		fixedAttrs:   clonedAttrs,
		activeGroups: clonedGroups,
	}
}

func (handler *RecentEntryHandler) WithGroup(name string) slog.Handler {
	clonedAttrs := make([]slog.Attr, len(handler.fixedAttrs))
	copy(clonedAttrs, handler.fixedAttrs)

	clonedGroups := make([]string, 0, len(handler.activeGroups)+1)
	clonedGroups = append(clonedGroups, handler.activeGroups...)
	if name != "" {
		clonedGroups = append(clonedGroups, name)
	}

	return &RecentEntryHandler{
		nextHandler:  handler.nextHandler.WithGroup(name),
		fixedAttrs:   clonedAttrs,
		activeGroups: clonedGroups,
	}
}

func appendAttribute(target map[string]any, groups []string, attr slog.Attr) {
	resolved := attr.Value.Resolve()
	if attr.Key == "" && resolved.Kind() == slog.KindGroup {
		for _, childAttr := range resolved.Group() {
			appendAttribute(target, groups, childAttr)
		}
		return
	}

	groupTarget := target
	for _, groupName := range groups {
		nested, exists := groupTarget[groupName]
		if !exists {
			created := make(map[string]any)
			groupTarget[groupName] = created
			groupTarget = created
			continue
		}
		nestedMap, ok := nested.(map[string]any)
		if !ok {
			nestedMap = make(map[string]any)
			groupTarget[groupName] = nestedMap
		}
		groupTarget = nestedMap
	}

	if resolved.Kind() == slog.KindGroup {
		childTarget := make(map[string]any)
		for _, childAttr := range resolved.Group() {
			appendAttribute(childTarget, nil, childAttr)
		}
		groupTarget[attr.Key] = childTarget
		return
	}

	groupTarget[attr.Key] = slogValueToAny(resolved)
}

func slogValueToAny(value slog.Value) any {
	switch value.Kind() {
	case slog.KindBool:
		return value.Bool()
	case slog.KindDuration:
		return value.Duration().String()
	case slog.KindFloat64:
		return value.Float64()
	case slog.KindInt64:
		return value.Int64()
	case slog.KindString:
		return value.String()
	case slog.KindTime:
		return value.Time().Format(time.RFC3339Nano)
	case slog.KindUint64:
		return value.Uint64()
	default:
		return value.Any()
	}
}
