package stats

import (
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"simple-api-pool/store"
)

type ProviderStats struct {
	SuccessCount atomic.Int64 `json:"success_count"`
	ErrorCount   atomic.Int64 `json:"error_count"`
	InputTokens  atomic.Int64 `json:"input_tokens"`
	OutputTokens atomic.Int64 `json:"output_tokens"`
	CacheTokens  atomic.Int64 `json:"cache_tokens"`
	CacheHits    atomic.Int64 `json:"cache_hits"`
	errorTypesMu sync.Mutex
	ErrorTypes   map[string]int64
}

func (s *ProviderStats) Snapshot() Snapshot {
	s.errorTypesMu.Lock()
	errorTypes := make(map[string]int64, len(s.ErrorTypes))
	for code, count := range s.ErrorTypes {
		errorTypes[code] = count
	}
	s.errorTypesMu.Unlock()

	return Snapshot{
		SuccessCount: s.SuccessCount.Load(),
		ErrorCount:   s.ErrorCount.Load(),
		InputTokens:  s.InputTokens.Load(),
		OutputTokens: s.OutputTokens.Load(),
		CacheTokens:  s.CacheTokens.Load(),
		CacheHits:    s.CacheHits.Load(),
		ErrorTypes:   errorTypes,
	}
}

type Snapshot struct {
	SuccessCount int64            `json:"success_count"`
	ErrorCount   int64            `json:"error_count"`
	InputTokens  int64            `json:"input_tokens"`
	OutputTokens int64            `json:"output_tokens"`
	CacheTokens  int64            `json:"cache_tokens"`
	CacheHits    int64            `json:"cache_hits"`
	ErrorTypes   map[string]int64 `json:"error_types,omitempty"`
}

type Manager struct {
	st          *store.Store
	mu          sync.RWMutex
	stats       map[string]*ProviderStats
	stopCh      chan struct{}
	flushSignal chan struct{}
	stopMu      sync.Once
	wg          sync.WaitGroup
}

func NewManager(st *store.Store) *Manager {
	m := &Manager{
		st:          st,
		stats:       make(map[string]*ProviderStats),
		stopCh:      make(chan struct{}),
		flushSignal: make(chan struct{}, 1),
	}
	m.load()
	m.wg.Add(1)
	go m.flusher()
	return m
}

func (m *Manager) load() {
	var data map[string]Snapshot
	if err := m.st.Load("stats/all.json", &data); err == nil {
		m.mu.Lock()
		defer m.mu.Unlock()
		for name, snap := range data {
			ps := &ProviderStats{}
			ps.SuccessCount.Store(snap.SuccessCount)
			ps.ErrorCount.Store(snap.ErrorCount)
			ps.InputTokens.Store(snap.InputTokens)
			ps.OutputTokens.Store(snap.OutputTokens)
			ps.CacheTokens.Store(snap.CacheTokens)
			ps.CacheHits.Store(snap.CacheHits)
			ps.ErrorTypes = make(map[string]int64, len(snap.ErrorTypes))
			for code, count := range snap.ErrorTypes {
				ps.ErrorTypes[code] = count
			}
			m.stats[name] = ps
		}
	}
}

func (m *Manager) flusher() {
	defer m.wg.Done()
	periodicTicker := time.NewTicker(30 * time.Second)
	defer periodicTicker.Stop()

	var (
		debounceTimer *time.Timer
		debounceC     <-chan time.Time
	)
	for {
		select {
		case <-periodicTicker.C:
			m.flush()
		case <-m.flushSignal:
			if debounceTimer == nil {
				debounceTimer = time.NewTimer(time.Second)
			} else {
				if !debounceTimer.Stop() {
					select {
					case <-debounceTimer.C:
					default:
					}
				}
				debounceTimer.Reset(time.Second)
			}
			debounceC = debounceTimer.C
		case <-debounceC:
			m.flush()
			debounceC = nil
		case <-m.stopCh:
			if debounceTimer != nil && !debounceTimer.Stop() {
				select {
				case <-debounceTimer.C:
				default:
				}
			}
			m.flush()
			return
		}
	}
}

func (m *Manager) flush() {
	data := m.Snapshot()
	if len(data) > 0 {
		m.st.Save("stats/all.json", &data)
	}
}

func (m *Manager) Stop() {
	m.stopMu.Do(func() {
		close(m.stopCh)
	})
	m.wg.Wait()
}

func (m *Manager) getOrCreate(name string) *ProviderStats {
	m.mu.RLock()
	if s, ok := m.stats[name]; ok {
		m.mu.RUnlock()
		return s
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.stats[name]; ok {
		return s
	}
	s := &ProviderStats{ErrorTypes: make(map[string]int64)}
	m.stats[name] = s
	return s
}

func (m *Manager) RecordSuccess(provider string, input, output int64) {
	s := m.getOrCreate(provider)
	s.SuccessCount.Add(1)
	s.InputTokens.Add(input)
	s.OutputTokens.Add(output)
	m.markDirty()
}

func (m *Manager) RecordCacheTokens(provider string, tokens int64) {
	if tokens <= 0 {
		return
	}
	s := m.getOrCreate(provider)
	s.CacheTokens.Add(tokens)
	m.markDirty()
}

func (m *Manager) RecordError(provider string, statusCode int) {
	s := m.getOrCreate(provider)
	s.ErrorCount.Add(1)
	if statusCode <= 0 {
		m.markDirty()
		return
	}
	code := strconv.Itoa(statusCode)
	s.errorTypesMu.Lock()
	s.ErrorTypes[code]++
	s.errorTypesMu.Unlock()
	m.markDirty()
}

func (m *Manager) RecordCacheHit(provider string, tokens int64) {
	s := m.getOrCreate(provider)
	s.CacheHits.Add(1)
	s.CacheTokens.Add(tokens)
	m.markDirty()
}

func (m *Manager) Snapshot() map[string]Snapshot {
	m.mu.RLock()
	providers := make(map[string]*ProviderStats, len(m.stats))
	for name, ps := range m.stats {
		providers[name] = ps
	}
	m.mu.RUnlock()

	out := make(map[string]Snapshot, len(providers))
	for name, ps := range providers {
		out[name] = ps.Snapshot()
	}
	return out
}

func (m *Manager) markDirty() {
	select {
	case m.flushSignal <- struct{}{}:
	default:
	}
}
