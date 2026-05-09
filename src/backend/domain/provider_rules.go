package domain

import (
	"net/url"
	"os"
	"strings"
)

type ProviderSettings struct {
	Name            string
	ProviderType    string
	BaseURL         string
	KeyStrategy     string
	FailThreshold   int
	MinDisableSecs  int
	MaxDisableSecs  int
	CacheMaxEntries int
}

var reservedProviderNames = map[string]struct{}{
	"api":    {},
	"cache":  {},
	"status": {},
	"admin":  {},
	"assets": {},
}

func DefaultBaseURL(providerType string) string {
	switch providerType {
	case "openai_chat", "openai_responses":
		return "https://api.openai.com"
	case "claude":
		return "https://api.anthropic.com"
	case "gemini":
		return "https://generativelanguage.googleapis.com"
	default:
		return ""
	}
}

func IsReservedProviderName(name string) bool {
	_, exists := reservedProviderNames[name]
	return exists
}

func NormalizeProviderBaseURL(rawValue string) (string, error) {
	trimmedValue := strings.TrimSpace(rawValue)
	if trimmedValue == "" {
		return "", os.ErrInvalid
	}

	parsedURL, err := url.Parse(trimmedValue)
	if err != nil {
		return "", os.ErrInvalid
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return "", os.ErrInvalid
	}
	if parsedURL.Host == "" || parsedURL.User != nil || parsedURL.RawQuery != "" || parsedURL.Fragment != "" {
		return "", os.ErrInvalid
	}

	normalizedValue := strings.TrimRight(parsedURL.String(), "/")
	if normalizedValue == "" {
		return "", os.ErrInvalid
	}
	return normalizedValue, nil
}

func NormalizeProviderSettings(settings ProviderSettings) (ProviderSettings, error) {
	if IsReservedProviderName(settings.Name) {
		return ProviderSettings{}, os.ErrInvalid
	}
	if settings.BaseURL == "" {
		settings.BaseURL = DefaultBaseURL(settings.ProviderType)
	}

	normalizedBaseURL, err := NormalizeProviderBaseURL(settings.BaseURL)
	if err != nil {
		return ProviderSettings{}, err
	}
	settings.BaseURL = normalizedBaseURL

	if settings.KeyStrategy == "" {
		settings.KeyStrategy = "round_robin"
	}
	if settings.FailThreshold == 0 {
		settings.FailThreshold = 3
	}
	if settings.MinDisableSecs == 0 {
		settings.MinDisableSecs = 30
	}
	if settings.MaxDisableSecs == 0 {
		settings.MaxDisableSecs = 43200
	}
	if settings.CacheMaxEntries == 0 {
		settings.CacheMaxEntries = 1000
	}

	return settings, nil
}
