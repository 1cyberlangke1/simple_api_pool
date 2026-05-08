package applog

import (
	"net/url"
	"strings"
)

func SanitizeQuery(rawQuery string) string {
	if strings.TrimSpace(rawQuery) == "" {
		return ""
	}

	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return "[unparseable]"
	}

	changed := false
	for key, keyValues := range values {
		if !isSensitiveQueryKey(key) {
			continue
		}
		for index := range keyValues {
			keyValues[index] = "[redacted]"
		}
		values[key] = keyValues
		changed = true
	}
	if !changed {
		return rawQuery
	}
	return values.Encode()
}

func isSensitiveQueryKey(key string) bool {
	normalizedKey := strings.ToLower(strings.TrimSpace(key))
	switch normalizedKey {
	case "key", "token", "auth", "authorization", "api-key", "api_key", "x-api-key", "x-goog-api-key", "access_token", "refresh_token", "admin_key", "client_key":
		return true
	}
	return strings.HasSuffix(normalizedKey, "_key") || strings.HasSuffix(normalizedKey, "_token") || strings.HasSuffix(normalizedKey, "_secret")
}
