package token

import (
	"simple-api-pool/config"
	"simple-api-pool/providerapi"
)

type Usage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	CacheTokens  int64 `json:"cache_tokens"`
}

func Extract(providerType string, body []byte, estimateEnabled bool) Usage {
	u := fromProviderUsage(providerapi.ExtractResponseUsage(config.ProviderType(providerType), body))
	if u.InputTokens == 0 && u.OutputTokens == 0 {
		return estimateUsage(body, estimateEnabled)
	}
	return u
}

func fromProviderUsage(usage providerapi.Usage) Usage {
	return Usage{
		InputTokens:  usage.InputTokens,
		OutputTokens: usage.OutputTokens,
		CacheTokens:  usage.CacheTokens,
	}
}
