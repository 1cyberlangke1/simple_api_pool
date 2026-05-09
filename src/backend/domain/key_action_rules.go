package domain

import (
	"os"
	"strings"
)

type KeyActionInput struct {
	Action         string
	Keys           []string
	DisabledUntil  int64
	DisableSeconds int64
}

type NormalizedKeyAction struct {
	Action        string
	DisabledUntil int64
	Keys          []string
}

func NormalizeKeyActionInput(input KeyActionInput, nowUnix int64) (NormalizedKeyAction, error) {
	normalizedKeys := make([]string, 0, len(input.Keys))
	seenKeys := make(map[string]struct{}, len(input.Keys))
	for _, keyValue := range input.Keys {
		trimmedKeyValue := strings.TrimSpace(keyValue)
		if trimmedKeyValue == "" {
			continue
		}
		if _, exists := seenKeys[trimmedKeyValue]; exists {
			continue
		}
		seenKeys[trimmedKeyValue] = struct{}{}
		normalizedKeys = append(normalizedKeys, trimmedKeyValue)
	}
	if len(normalizedKeys) == 0 {
		return NormalizedKeyAction{}, os.ErrInvalid
	}

	action := strings.TrimSpace(input.Action)
	switch action {
	case "enable", "delete", "disable_forever":
		return NormalizedKeyAction{
			Action: action,
			Keys:   normalizedKeys,
		}, nil
	case "disable":
		return NormalizedKeyAction{
			Action: "disable_forever",
			Keys:   normalizedKeys,
		}, nil
	case "disable_until":
		disabledUntil := input.DisabledUntil
		if disabledUntil <= 0 && input.DisableSeconds > 0 {
			disabledUntil = nowUnix + input.DisableSeconds
		}
		if disabledUntil <= 0 {
			return NormalizedKeyAction{}, os.ErrInvalid
		}
		return NormalizedKeyAction{
			Action:        action,
			DisabledUntil: disabledUntil,
			Keys:          normalizedKeys,
		}, nil
	default:
		return NormalizedKeyAction{}, os.ErrInvalid
	}
}
