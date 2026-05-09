package keyring

import (
	"errors"
	"hash/fnv"
	"log/slog"
	"math"
	"sync"
	"time"

	"simple-api-pool/applog"
	"simple-api-pool/config"
)

type roundRobinState struct {
	counter     uint64
	fingerprint uint64
}

var (
	ErrProviderNotFound = errors.New("provider not found")
	ErrNoKeysConfigured = errors.New("no keys configured")
	ErrAllKeysExhausted = errors.New("all keys exhausted")
)

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
		return "", ErrProviderNotFound
	}
	if len(p.Keys) == 0 {
		return "", ErrNoKeysConfigured
	}

	now := time.Now().Unix()
	available := make([]int, 0, len(p.Keys))

	for i := range p.Keys {
		if p.Keys[i].DisabledUntil >= now && p.Keys[i].DisabledUntil > 0 {
			continue
		}
		available = append(available, i)
	}

	if len(available) == 0 {
		return "", ErrAllKeysExhausted
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
	disabledUntil := int64(0)
	provider, _ := k.cfg.Provider(providerName)
	if provider != nil {
		for _, existingKey := range provider.Keys {
			if existingKey.Value != keyValue {
				continue
			}
			if existingKey.DisabledUntil == config.KeyPermanentlyDisabled {
				disabledUntil = config.KeyPermanentlyDisabled
			}
			break
		}
	}

	if err := k.cfg.UpdateKeyState(providerName, keyValue, disabledUntil, 0); err != nil {
		slog.Default().Error("update_key_state_failed", "provider", providerName, "key_ref", applog.MaskSecret(keyValue), "error", err)
	}
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
				disableStartFails := p.FailThreshold
				if disableStartFails < 1 {
					disableStartFails = 1
				}
				delay := float64(p.MinDisableSecs) * math.Pow(2, float64(fails-disableStartFails))
				if delay > float64(p.MaxDisableSecs) {
					delay = float64(p.MaxDisableSecs)
				}
				if err := k.cfg.UpdateKeyState(providerName, keyValue, time.Now().Unix()+int64(delay), fails); err != nil {
					slog.Default().Error("update_key_state_failed", "provider", providerName, "key_ref", applog.MaskSecret(keyValue), "error", err)
				}
			} else {
				if err := k.cfg.UpdateKeyState(providerName, keyValue, 0, fails); err != nil {
					slog.Default().Error("update_key_state_failed", "provider", providerName, "key_ref", applog.MaskSecret(keyValue), "error", err)
				}
			}
			return
		}
	}
}

func (k *KeyRing) nextRoundRobinIndex(providerName string, keys []config.Key, available []int) int {
	fingerprint := buildAvailabilityFingerprint(keys, available)

	k.mu.Lock()
	defer k.mu.Unlock()

	state, ok := k.states[providerName]
	if !ok {
		state = &roundRobinState{}
		k.states[providerName] = state
	}
	if state.fingerprint != fingerprint {
		state.fingerprint = fingerprint
		state.counter = 0
	}

	idx := int(state.counter % uint64(len(available)))
	state.counter++
	return idx
}

func buildAvailabilityFingerprint(_ []config.Key, available []int) uint64 {
	hasher := fnv.New64a()
	for _, index := range available {
		_, _ = hasher.Write([]byte{byte(index >> 24), byte(index >> 16), byte(index >> 8), byte(index)})
	}
	return hasher.Sum64()
}
