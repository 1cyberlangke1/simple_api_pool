package stats

import (
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
}

func (s *ProviderStats) Snapshot() Snapshot {
	return Snapshot{
		SuccessCount: s.SuccessCount.Load(),
		ErrorCount:   s.ErrorCount.Load(),
		InputTokens:  s.InputTokens.Load(),
		OutputTokens: s.OutputTokens.Load(),
		CacheTokens:  s.CacheTokens.Load(),
		CacheHits:    s.CacheHits.Load(),
	}
}

type Snapshot struct {
	SuccessCount int64 `json:"success_count"`
	ErrorCount   int64 `json:"error_count"`
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	CacheTokens  int64 `json:"cache_tokens"`
	CacheHits    int64 `json:"cache_hits"`
}

type Manager struct {
	st     *store.Store
	stats  map[string]*ProviderStats
	stopCh chan struct{}
	stopMu sync.Once
	wg     sync.WaitGroup
}

func NewManager(st *store.Store) *Manager {
	m := &Manager{
		st:     st,
		stats:  make(map[string]*ProviderStats),
		stopCh: make(chan struct{}),
	}
	m.load()
	m.wg.Add(1)
	go m.flusher()
	return m
}

func (m *Manager) load() {
	var data map[string]Snapshot
	if err := m.st.Load("stats/all.json", &data); err == nil {
		for name, snap := range data {
			ps := &ProviderStats{}
			ps.SuccessCount.Store(snap.SuccessCount)
			ps.ErrorCount.Store(snap.ErrorCount)
			ps.InputTokens.Store(snap.InputTokens)
			ps.OutputTokens.Store(snap.OutputTokens)
			ps.CacheTokens.Store(snap.CacheTokens)
			ps.CacheHits.Store(snap.CacheHits)
			m.stats[name] = ps
		}
	}
}

func (m *Manager) flusher() {
	defer m.wg.Done()
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			m.flush()
		case <-m.stopCh:
			m.flush()
			return
		}
	}
}

func (m *Manager) flush() {
	data := make(map[string]Snapshot)
	for name, ps := range m.stats {
		data[name] = ps.Snapshot()
	}
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
	if s, ok := m.stats[name]; ok {
		return s
	}
	s := &ProviderStats{}
	m.stats[name] = s
	return s
}

func (m *Manager) RecordSuccess(provider string, input, output int64) {
	s := m.getOrCreate(provider)
	s.SuccessCount.Add(1)
	s.InputTokens.Add(input)
	s.OutputTokens.Add(output)
}

func (m *Manager) RecordError(provider string) {
	s := m.getOrCreate(provider)
	s.ErrorCount.Add(1)
}

func (m *Manager) RecordCacheHit(provider string, tokens int64) {
	s := m.getOrCreate(provider)
	s.CacheHits.Add(1)
	s.CacheTokens.Add(tokens)
}

func (m *Manager) Snapshot() map[string]Snapshot {
	out := make(map[string]Snapshot)
	for name, ps := range m.stats {
		out[name] = ps.Snapshot()
	}
	return out
}
