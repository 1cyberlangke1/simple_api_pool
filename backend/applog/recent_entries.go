package applog

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/dustin/go-humanize"
)

const defaultRecentEntryLimit = 200
const defaultRecentEntryMaxBytes = 10 * 1024 * 1024

type Entry struct {
	Time  string         `json:"time"`
	Level string         `json:"level"`
	Msg   string         `json:"msg"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

type entryRingBuffer struct {
	mu         sync.RWMutex
	entries    []Entry
	entrySizes []int
	limit      int
	maxBytes   int
	totalBytes int
}

var (
	entryBufferGuard sync.RWMutex
	entryBuffer      = newEntryRingBuffer(loadRecentEntryLimitFromEnv(), loadRecentEntryMaxBytesFromEnv())
)

func RecentEntries(limit int) []Entry {
	return currentEntryBuffer().snapshot(limit)
}

func ReplaceRecentEntriesForTesting(limit int) func() {
	entryBufferGuard.Lock()
	previous := entryBuffer
	entryBuffer = newEntryRingBuffer(limit, defaultRecentEntryMaxBytes)
	entryBufferGuard.Unlock()

	return func() {
		entryBufferGuard.Lock()
		entryBuffer = previous
		entryBufferGuard.Unlock()
	}
}

func ReplaceRecentEntriesForTestingWithBytes(limit, maxBytes int) func() {
	entryBufferGuard.Lock()
	previous := entryBuffer
	entryBuffer = newEntryRingBuffer(limit, maxBytes)
	entryBufferGuard.Unlock()

	return func() {
		entryBufferGuard.Lock()
		entryBuffer = previous
		entryBufferGuard.Unlock()
	}
}

func AppendRecentEntryForTesting(entry Entry) {
	currentEntryBuffer().append(entry)
}

func loadRecentEntryLimitFromEnv() int {
	raw := os.Getenv("LOG_BUFFER_LIMIT")
	if raw == "" {
		return defaultRecentEntryLimit
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
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
		return defaultRecentEntryMaxBytes
	}
	return int(parsed)
}

func currentEntryBuffer() *entryRingBuffer {
	entryBufferGuard.RLock()
	defer entryBufferGuard.RUnlock()
	return entryBuffer
}

func newEntryRingBuffer(limit, maxBytes int) *entryRingBuffer {
	if limit <= 0 {
		limit = defaultRecentEntryLimit
	}
	if maxBytes <= 0 {
		maxBytes = defaultRecentEntryMaxBytes
	}
	return &entryRingBuffer{
		entries:    make([]Entry, 0, limit),
		entrySizes: make([]int, 0, limit),
		limit:      limit,
		maxBytes:   maxBytes,
	}
}

func (buffer *entryRingBuffer) append(entry Entry) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()

	entrySize := estimateEntrySize(entry)
	buffer.entries = append(buffer.entries, entry)
	buffer.entrySizes = append(buffer.entrySizes, entrySize)
	buffer.totalBytes += entrySize

	for len(buffer.entries) > buffer.limit {
		buffer.evictOldest()
	}
	for len(buffer.entries) > 1 && buffer.totalBytes > buffer.maxBytes {
		buffer.evictOldest()
	}
}

func (buffer *entryRingBuffer) evictOldest() {
	if len(buffer.entries) == 0 {
		return
	}

	buffer.totalBytes -= buffer.entrySizes[0]
	buffer.entries = append(buffer.entries[:0], buffer.entries[1:]...)
	buffer.entrySizes = append(buffer.entrySizes[:0], buffer.entrySizes[1:]...)
}

func estimateEntrySize(entry Entry) int {
	estimatedSize := len(entry.Time) + len(entry.Level) + len(entry.Msg)
	if len(entry.Attrs) == 0 {
		return estimatedSize
	}

	attrBytes, err := json.Marshal(entry.Attrs)
	if err != nil {
		return estimatedSize
	}
	return estimatedSize + len(attrBytes)
}

func (buffer *entryRingBuffer) snapshot(limit int) []Entry {
	buffer.mu.RLock()
	defer buffer.mu.RUnlock()

	if limit <= 0 || limit > len(buffer.entries) {
		limit = len(buffer.entries)
	}
	start := len(buffer.entries) - limit
	result := make([]Entry, limit)
	copy(result, buffer.entries[start:])
	return result
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
	currentEntryBuffer().append(entry)
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
