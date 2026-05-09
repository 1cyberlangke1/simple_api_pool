package auth

import (
	"net"
	"sync"
	"time"
)

type FailureLimiter struct {
	mu            sync.Mutex
	entries       map[string]failureEntry
	maxFailures   int
	window        time.Duration
	blockDuration time.Duration
	maxEntries    int
	pruneInterval time.Duration
	lastPrune     time.Time
}

type failureEntry struct {
	firstFailure time.Time
	failureCount int
	blockedUntil time.Time
	lastSeen     time.Time
}

func NewFailureLimiter(maxFailures int, window, blockDuration time.Duration) *FailureLimiter {
	if maxFailures <= 0 {
		maxFailures = 10
	}
	if window <= 0 {
		window = time.Minute
	}
	if blockDuration <= 0 {
		blockDuration = 5 * time.Minute
	}
	return &FailureLimiter{
		entries:       make(map[string]failureEntry),
		maxFailures:   maxFailures,
		window:        window,
		blockDuration: blockDuration,
		maxEntries:    4096,
		pruneInterval: 10 * time.Second,
	}
}

func (limiter *FailureLimiter) Allow(remoteAddr string) bool {
	key := limiter.keyForRemoteAddr(remoteAddr)
	now := time.Now()

	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.pruneExpiredEntriesLocked(now)

	entry, exists := limiter.entries[key]
	if !exists {
		return true
	}
	if !entry.blockedUntil.IsZero() && entry.blockedUntil.After(now) {
		entry.lastSeen = now
		limiter.entries[key] = entry
		return false
	}
	if limiter.entryExpired(entry, now) {
		delete(limiter.entries, key)
		return true
	}
	entry.lastSeen = now
	limiter.entries[key] = entry
	return true
}

func (limiter *FailureLimiter) RecordFailure(remoteAddr string) {
	key := limiter.keyForRemoteAddr(remoteAddr)
	now := time.Now()

	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.pruneExpiredEntriesLocked(now)

	entry, exists := limiter.entries[key]
	if entry.firstFailure.IsZero() || now.Sub(entry.firstFailure) > limiter.window {
		entry.firstFailure = now
		entry.failureCount = 0
		entry.blockedUntil = time.Time{}
	}
	entry.failureCount++
	entry.lastSeen = now
	if entry.failureCount >= limiter.maxFailures {
		entry.blockedUntil = now.Add(limiter.blockDuration)
	}
	if !exists && len(limiter.entries) >= limiter.maxEntries {
		limiter.evictOldestEntryLocked()
	}
	limiter.entries[key] = entry
}

func (limiter *FailureLimiter) RecordSuccess(remoteAddr string) {
	key := limiter.keyForRemoteAddr(remoteAddr)
	now := time.Now()
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	entry, exists := limiter.entries[key]
	if !exists {
		return
	}
	if !entry.blockedUntil.IsZero() && entry.blockedUntil.After(now) {
		delete(limiter.entries, key)
		return
	}
	if entry.failureCount <= 1 || limiter.entryExpired(entry, now) {
		delete(limiter.entries, key)
		return
	}
	entry.failureCount--
	entry.lastSeen = now
	limiter.entries[key] = entry
}

func (limiter *FailureLimiter) pruneExpiredEntriesLocked(now time.Time) {
	if !limiter.lastPrune.IsZero() && now.Sub(limiter.lastPrune) < limiter.pruneInterval && len(limiter.entries) < limiter.maxEntries {
		return
	}
	for key, entry := range limiter.entries {
		if limiter.entryExpired(entry, now) {
			delete(limiter.entries, key)
		}
	}
	limiter.lastPrune = now
}

func (limiter *FailureLimiter) entryExpired(entry failureEntry, now time.Time) bool {
	if !entry.blockedUntil.IsZero() {
		return !entry.blockedUntil.After(now)
	}
	return entry.firstFailure.IsZero() || now.Sub(entry.firstFailure) > limiter.window
}

func (limiter *FailureLimiter) evictOldestEntryLocked() {
	var (
		oldestKey  string
		oldestTime time.Time
		hasOldest  bool
	)
	for key, entry := range limiter.entries {
		candidateTime := entry.lastSeen
		if candidateTime.IsZero() {
			candidateTime = entry.firstFailure
		}
		if !hasOldest || candidateTime.Before(oldestTime) {
			oldestKey = key
			oldestTime = candidateTime
			hasOldest = true
		}
	}
	if hasOldest {
		delete(limiter.entries, oldestKey)
	}
}

func (limiter *FailureLimiter) Len() int {
	now := time.Now()
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.pruneExpiredEntriesLocked(now)
	return len(limiter.entries)
}

func (limiter *FailureLimiter) keyForRemoteAddr(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil && host != "" {
		return host
	}
	if remoteAddr == "" {
		return "unknown"
	}
	return remoteAddr
}
