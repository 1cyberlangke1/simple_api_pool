package keyring

import (
	"math"
	"strings"
	"sync"
	"time"

	"simple-api-pool/config"
)

type roundRobinState struct {
	counter   uint64
	signature string
}

type KeyRing struct {
	cfg    *config.Config
	mu     sync.Mutex
	states map[string]*roundRobinState
}

func New(cfg *config.Config) *KeyRing {
	return &KeyRing{
		cfg:    cfg,
		states: make(map[string]*roundRobinState),
	}
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
		idx := k.nextRoundRobinIndex(providerName, p.Keys, available)
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

func (k *KeyRing) nextRoundRobinIndex(providerName string, keys []config.Key, available []int) int {
	signature := buildAvailabilitySignature(keys, available)

	k.mu.Lock()
	defer k.mu.Unlock()

	state, ok := k.states[providerName]
	if !ok {
		state = &roundRobinState{}
		k.states[providerName] = state
	}
	if state.signature != signature {
		state.signature = signature
		state.counter = 0
	}

	idx := int(state.counter % uint64(len(available)))
	state.counter++
	return idx
}

func buildAvailabilitySignature(keys []config.Key, available []int) string {
	var builder strings.Builder
	for _, index := range available {
		builder.WriteString(keys[index].Value)
		builder.WriteByte('\n')
	}
	return builder.String()
}
