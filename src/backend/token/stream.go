package token

import (
	"simple-api-pool/config"
	"simple-api-pool/providerapi"
)

// ExtractFromStream tries to extract token usage from accumulated streamed response bytes
func ExtractFromStream(providerType string, body []byte, estimateEnabled bool) Usage {
	u := fromProviderUsage(providerapi.ExtractStreamUsage(config.ProviderType(providerType), body))
	if u.InputTokens == 0 && u.OutputTokens == 0 {
		return estimateUsage(body, estimateEnabled)
	}
	return u
}
