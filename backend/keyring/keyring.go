package keyring

import (
	"math"
	"sync"
	"sync/atomic"
	"time"

	"simple-api-pool/config"
)

type KeyRing struct {
	cfg      *config.Config
	mu       sync.Mutex
	counters map[string]*atomic.Uint64
}

func New(cfg *config.Config) *KeyRing {
	return &KeyRing{
		cfg:      cfg,
		counters: make(map[string]*atomic.Uint64),
	}
}

func (k *KeyRing) getCounter(name string) *atomic.Uint64 {
	k.mu.Lock()
	defer k.mu.Unlock()

	if c, ok := k.counters[name]; ok {
		return c
	}
	c := &atomic.Uint64{}
	k.counters[name] = c
	return c
}

func (k *KeyRing) GetKey(providerName string) (string, error) {
	p, _ := k.cfg.Provider(providerName)
	if p == nil {
		return "", nil
	}

	now := time.Now().Unix()
	var available []int

	for i := range p.Keys {
		if p.Keys[i].DisabledUntil > 0 && p.Keys[i].DisabledUntil > now {
			continue
		}
		available = append(available, i)
	}

	if len(available) == 0 {
		return "", nil
	}

	switch p.KeyStrategy {
	case "fill":
		return p.Keys[available[0]].Value, nil
	default:
		ctr := k.getCounter(providerName)
		idx := ctr.Add(1) % uint64(len(available))
		return p.Keys[available[idx]].Value, nil
	}
}

func (k *KeyRing) RecordSuccess(providerName, keyValue string) {
	k.cfg.UpdateKeyState(providerName, keyValue, 0, 0)
}

func (k *KeyRing) RecordFailure(providerName, keyValue string) {
	p, _ := k.cfg.Provider(providerName)
	if p == nil {
		return
	}

	for _, kk := range p.Keys {
		if kk.Value == keyValue {
			fails := kk.ConsecutiveFails + 1
			if fails >= p.FailThreshold {
				delay := float64(p.MinDisableSecs) * math.Pow(2, float64(fails-p.FailThreshold))
				if delay > float64(p.MaxDisableSecs) {
					delay = float64(p.MaxDisableSecs)
				}
				k.cfg.UpdateKeyState(providerName, keyValue, time.Now().Unix()+int64(delay), fails)
			} else {
				k.cfg.UpdateKeyState(providerName, keyValue, 0, fails)
			}
			return
		}
	}
}
