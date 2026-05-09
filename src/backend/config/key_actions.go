package config

import (
	"os"
	"strings"
)

type KeyAction string

const (
	KeyActionEnable         KeyAction = "enable"
	KeyActionDisableUntil   KeyAction = "disable_until"
	KeyActionDisableForever KeyAction = "disable_forever"
	KeyActionDelete         KeyAction = "delete"
)

type KeyActionRequest struct {
	Action        KeyAction `json:"action"`
	Keys          []string  `json:"keys"`
	DisabledUntil int64     `json:"disabled_until"`
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
