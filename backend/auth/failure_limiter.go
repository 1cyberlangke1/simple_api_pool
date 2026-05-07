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
}

type failureEntry struct {
	firstFailure time.Time
	failureCount int
	blockedUntil time.Time
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
		return false
	}
	if !entry.blockedUntil.IsZero() && !entry.blockedUntil.After(now) {
		delete(limiter.entries, key)
	}
	return true
}

func (limiter *FailureLimiter) RecordFailure(remoteAddr string) {
	key := limiter.keyForRemoteAddr(remoteAddr)
	now := time.Now()

	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	limiter.pruneExpiredEntriesLocked(now)

	entry := limiter.entries[key]
	if entry.firstFailure.IsZero() || now.Sub(entry.firstFailure) > limiter.window {
		entry.firstFailure = now
		entry.failureCount = 0
		entry.blockedUntil = time.Time{}
	}
	entry.failureCount++
	if entry.failureCount >= limiter.maxFailures {
		entry.blockedUntil = now.Add(limiter.blockDuration)
	}
	limiter.entries[key] = entry
}

func (limiter *FailureLimiter) RecordSuccess(remoteAddr string) {
	key := limiter.keyForRemoteAddr(remoteAddr)
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	delete(limiter.entries, key)
}

func (limiter *FailureLimiter) pruneExpiredEntriesLocked(now time.Time) {
	for key, entry := range limiter.entries {
		if !entry.blockedUntil.IsZero() {
			if entry.blockedUntil.After(now) {
				continue
			}
			delete(limiter.entries, key)
			continue
		}
		if entry.firstFailure.IsZero() || now.Sub(entry.firstFailure) > limiter.window {
			delete(limiter.entries, key)
		}
	}
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
