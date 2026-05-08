package proxyroute

import (
	"strings"

	"simple-api-pool/config"
)

type PathParts struct {
	UseCache bool
	Provider string
	Suffix   string
}

func ParsePath(path string) PathParts {
	var parts PathParts
	path = strings.TrimPrefix(path, "/")
	if path == "" {
		return parts
	}

	segments := strings.Split(path, "/")
	index := 0
	if len(segments) > index && segments[index] == "cache" {
		parts.UseCache = true
		index++
	}
	if len(segments) > index {
		parts.Provider = segments[index]
		index++
	}
	if len(segments) > index {
		parts.Suffix = "/" + strings.Join(segments[index:], "/")
	}
	return parts
}

func CacheFieldForProviderType(providerType config.ProviderType) string {
	switch providerType {
	case config.OpenAIChat, config.Claude:
		return "messages"
	case config.OpenAIResponses:
		return "input"
	case config.Gemini:
		return "contents"
	default:
		return ""
	}
}
