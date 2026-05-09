package domain

import (
	"crypto/sha256"
	"encoding/hex"
)

func BuildSecretRef(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:8])
}

func ResolveKeyIdentifier(secretValues []string, identifier string) string {
	for _, secretValue := range secretValues {
		if secretValue == identifier || BuildSecretRef(secretValue) == identifier {
			return secretValue
		}
	}
	return ""
}

func ResolveKeyIdentifiers(secretValues []string, identifiers []string) []string {
	resolvedValues := make([]string, 0, len(identifiers))
	seenValues := make(map[string]struct{}, len(identifiers))
	for _, identifier := range identifiers {
		resolvedValue := ResolveKeyIdentifier(secretValues, identifier)
		if resolvedValue == "" {
			continue
		}
		if _, exists := seenValues[resolvedValue]; exists {
			continue
		}
		seenValues[resolvedValue] = struct{}{}
		resolvedValues = append(resolvedValues, resolvedValue)
	}
	return resolvedValues
}
