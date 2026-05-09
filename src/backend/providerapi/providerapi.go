package providerapi

import (
	"net/http"
	"net/url"
	"strings"

	"simple-api-pool/config"
)

type Capability interface {
	ProviderType() config.ProviderType
	CacheField() string
	SanitizeClientAuthQuery(values url.Values)
	ExtractClientCredential(req *http.Request) string
	ApplyUpstreamAuth(req *http.Request, key string)
	ExtractRequestModel(suffix string, body []byte) string
	IsModelDiscoveryRequest(method, suffix string) bool
	ExtractResponseUsage(body []byte) Usage
	ExtractStreamUsage(body []byte) Usage
	DecorateCachedResponse(responseBody []byte, inputTokens, outputTokens int64) []byte
	BuildCachedStreamBody(responseBody []byte) ([]byte, bool)
	DecorateCachedStreamBody(streamBody []byte, inputTokens, outputTokens int64) []byte
}

type capability struct {
	providerType             config.ProviderType
	cacheField               string
	sanitizeFunc             func(values url.Values)
	clientKeyFunc            func(req *http.Request) string
	authFunc                 func(req *http.Request, key string)
	modelFunc                func(suffix string, body []byte) string
	discoveryFunc            func(method, suffix string) bool
	responseUsageFunc        func(body []byte) Usage
	streamUsageFunc          func(body []byte) Usage
	decorateCachedResponse   func(responseBody []byte, inputTokens, outputTokens int64) []byte
	buildCachedStreamBody    func(responseBody []byte) ([]byte, bool)
	decorateCachedStreamBody func(streamBody []byte, inputTokens, outputTokens int64) []byte
}

func (c capability) ProviderType() config.ProviderType { return c.providerType }
func (c capability) CacheField() string                { return c.cacheField }
func (c capability) SanitizeClientAuthQuery(values url.Values) {
	if c.sanitizeFunc != nil {
		c.sanitizeFunc(values)
	}
}
func (c capability) ExtractClientCredential(req *http.Request) string {
	if c.clientKeyFunc == nil {
		return ""
	}
	return c.clientKeyFunc(req)
}
func (c capability) ApplyUpstreamAuth(req *http.Request, key string) {
	if c.authFunc != nil {
		c.authFunc(req, key)
	}
}
func (c capability) ExtractRequestModel(suffix string, body []byte) string {
	if c.modelFunc == nil {
		return ""
	}
	return c.modelFunc(suffix, body)
}
func (c capability) IsModelDiscoveryRequest(method, suffix string) bool {
	if c.discoveryFunc == nil {
		return false
	}
	return c.discoveryFunc(method, suffix)
}
func (c capability) ExtractResponseUsage(body []byte) Usage {
	if c.responseUsageFunc == nil {
		return Usage{}
	}
	return c.responseUsageFunc(body)
}
func (c capability) ExtractStreamUsage(body []byte) Usage {
	if c.streamUsageFunc == nil {
		return Usage{}
	}
	return c.streamUsageFunc(body)
}
func (c capability) DecorateCachedResponse(responseBody []byte, inputTokens, outputTokens int64) []byte {
	if c.decorateCachedResponse == nil {
		return append([]byte(nil), responseBody...)
	}
	return c.decorateCachedResponse(responseBody, inputTokens, outputTokens)
}
func (c capability) BuildCachedStreamBody(responseBody []byte) ([]byte, bool) {
	if c.buildCachedStreamBody == nil {
		return buildGenericCachedStreamBody(responseBody)
	}
	return c.buildCachedStreamBody(responseBody)
}
func (c capability) DecorateCachedStreamBody(streamBody []byte, inputTokens, outputTokens int64) []byte {
	if c.decorateCachedStreamBody == nil {
		return append([]byte(nil), streamBody...)
	}
	return c.decorateCachedStreamBody(streamBody, inputTokens, outputTokens)
}

var fallbackCapability = capability{
	providerType:  config.ProviderType("unknown"),
	clientKeyFunc: extractAuthorizationCredential,
}

var capabilityRegistry = map[config.ProviderType]Capability{
	config.OpenAIChat:      newOpenAIChatCapability(),
	config.OpenAIResponses: newOpenAIResponsesCapability(),
	config.Claude:          newClaudeCapability(),
	config.Gemini:          newGeminiCapability(),
}

func CapabilityForType(providerType config.ProviderType) Capability {
	if capabilityEntry, ok := capabilityRegistry[providerType]; ok {
		return capabilityEntry
	}
	return fallbackCapability
}

func CacheField(providerType config.ProviderType) string {
	return CapabilityForType(providerType).CacheField()
}

func SanitizeClientAuthQuery(values url.Values, providerType config.ProviderType) {
	CapabilityForType(providerType).SanitizeClientAuthQuery(values)
}

func ApplyUpstreamAuth(req *http.Request, providerType config.ProviderType, key string) {
	CapabilityForType(providerType).ApplyUpstreamAuth(req, key)
}

func ExtractClientCredential(req *http.Request, providerType config.ProviderType) string {
	return CapabilityForType(providerType).ExtractClientCredential(req)
}

func ExtractRequestModel(providerType config.ProviderType, suffix string, body []byte) string {
	return CapabilityForType(providerType).ExtractRequestModel(suffix, body)
}

func IsModelDiscoveryRequest(method, suffix string) bool {
	if CapabilityForType(config.Gemini).IsModelDiscoveryRequest(method, suffix) {
		return true
	}
	return false
}

func ExtractResponseUsage(providerType config.ProviderType, body []byte) Usage {
	return CapabilityForType(providerType).ExtractResponseUsage(body)
}

func ExtractStreamUsage(providerType config.ProviderType, body []byte) Usage {
	return CapabilityForType(providerType).ExtractStreamUsage(body)
}

func DecorateCachedResponse(providerType config.ProviderType, responseBody []byte, inputTokens, outputTokens int64) []byte {
	return CapabilityForType(providerType).DecorateCachedResponse(responseBody, inputTokens, outputTokens)
}

func BuildCachedStreamBody(providerType config.ProviderType, responseBody []byte) ([]byte, bool) {
	return CapabilityForType(providerType).BuildCachedStreamBody(responseBody)
}

func DecorateCachedStreamBody(providerType config.ProviderType, streamBody []byte, inputTokens, outputTokens int64) []byte {
	return CapabilityForType(providerType).DecorateCachedStreamBody(streamBody, inputTokens, outputTokens)
}

func extractAuthorizationCredential(req *http.Request) string {
	if req == nil {
		return ""
	}

	authorization := strings.TrimSpace(req.Header.Get("Authorization"))
	if authorization == "" {
		return ""
	}
	if strings.HasPrefix(authorization, "Bearer ") {
		return strings.TrimSpace(authorization[len("Bearer "):])
	}
	if strings.Contains(authorization, " ") {
		return ""
	}
	return authorization
}
