package domain

import (
	"net/netip"
	"net/url"
	"os"
	"strconv"
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

var blockedUpstreamPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("::/128"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
}

var blockedUpstreamHostnames = map[string]struct{}{
	"localhost":                {},
	"ip6-localhost":            {},
	"metadata.google.internal": {},
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
	if err := validateUpstreamHost(parsedURL); err != nil {
		return "", err
	}

	normalizedValue := strings.TrimRight(parsedURL.String(), "/")
	if normalizedValue == "" {
		return "", os.ErrInvalid
	}
	return normalizedValue, nil
}

func validateUpstreamHost(parsedURL *url.URL) error {
	if parsedURL == nil || allowPrivateUpstreams() {
		return nil
	}

	hostname := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(parsedURL.Hostname())), ".")
	if hostname == "" {
		return os.ErrInvalid
	}
	if _, blocked := blockedUpstreamHostnames[hostname]; blocked || strings.HasSuffix(hostname, ".localhost") {
		return os.ErrInvalid
	}

	ipAddr, err := netip.ParseAddr(hostname)
	if err != nil {
		return nil
	}
	for _, blockedPrefix := range blockedUpstreamPrefixes {
		if blockedPrefix.Contains(ipAddr) {
			return os.ErrInvalid
		}
	}
	return nil
}

func allowPrivateUpstreams() bool {
	rawValue := strings.TrimSpace(os.Getenv("ALLOW_PRIVATE_UPSTREAMS"))
	if rawValue == "" {
		return false
	}
	allowed, err := strconv.ParseBool(rawValue)
	if err != nil {
		return false
	}
	return allowed
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
