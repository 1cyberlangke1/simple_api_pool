package config

import (
	"os"
	"strings"
)

type KeyAction string

const (
	// KeyActionEnable clears disable state and failure counters for selected keys.
	KeyActionEnable KeyAction = "enable"
	// KeyActionDisableUntil disables selected keys until the provided Unix timestamp.
	KeyActionDisableUntil KeyAction = "disable_until"
	// KeyActionDisableForever disables selected keys with a permanent sentinel timestamp.
	KeyActionDisableForever KeyAction = "disable_forever"
	// KeyActionDelete removes selected keys from the provider.
	KeyActionDelete KeyAction = "delete"
)

type KeyActionRequest struct {
	Action        KeyAction `json:"action"`
	Keys          []string  `json:"keys"`
	DisabledUntil int64     `json:"disabled_until"`
}

func parseLegacyKeyAction(action string) (KeyAction, bool) {
	switch action {
	case string(KeyActionDelete):
		return KeyActionDelete, true
	case "disable":
		return KeyActionDisableForever, true
	case string(KeyActionEnable):
		return KeyActionEnable, true
	default:
		return "", false
	}
}

func (c *Config) ApplyStructuredKeyAction(providerName string, request KeyActionRequest) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	targetKeys := make(map[string]struct{}, len(request.Keys))
	for _, keyValue := range request.Keys {
		trimmedKeyValue := strings.TrimSpace(keyValue)
		if trimmedKeyValue == "" {
			continue
		}
		targetKeys[trimmedKeyValue] = struct{}{}
	}
	if len(targetKeys) == 0 {
		return os.ErrInvalid
	}

	for providerIndex, provider := range c.state.Providers {
		if provider.Name != providerName {
			continue
		}

		switch request.Action {
		case KeyActionDelete:
			filteredKeys := make([]Key, 0, len(provider.Keys))
			for _, existingKey := range provider.Keys {
				if _, shouldDelete := targetKeys[existingKey.Value]; shouldDelete {
					continue
				}
				filteredKeys = append(filteredKeys, existingKey)
			}
			c.state.Providers[providerIndex].Keys = filteredKeys
		case KeyActionDisableForever:
			for keyIndex, existingKey := range provider.Keys {
				if _, shouldDisable := targetKeys[existingKey.Value]; !shouldDisable {
					continue
				}
				c.state.Providers[providerIndex].Keys[keyIndex].DisabledUntil = KeyPermanentlyDisabled
			}
		case KeyActionDisableUntil:
			if request.DisabledUntil <= 0 {
				return os.ErrInvalid
			}
			for keyIndex, existingKey := range provider.Keys {
				if _, shouldDisable := targetKeys[existingKey.Value]; !shouldDisable {
					continue
				}
				c.state.Providers[providerIndex].Keys[keyIndex].DisabledUntil = request.DisabledUntil
			}
		case KeyActionEnable:
			for keyIndex, existingKey := range provider.Keys {
				if _, shouldEnable := targetKeys[existingKey.Value]; !shouldEnable {
					continue
				}
				c.state.Providers[providerIndex].Keys[keyIndex].DisabledUntil = 0
				c.state.Providers[providerIndex].Keys[keyIndex].ConsecutiveFails = 0
			}
		default:
			return os.ErrInvalid
		}

		return c.save()
	}

	return os.ErrNotExist
}
