package proxyapi

import (
	"encoding/json"
	"math/rand"
	"os"
	"strings"

	"simple-api-pool/config"
	"simple-api-pool/providerapi"
)

func buildGroupModelDiscoveryResponse(group config.Group) ([]byte, error) {
	switch group.Type {
	case config.OpenAIChat, config.OpenAIResponses:
		type openAIModel struct {
			ID      string `json:"id"`
			Object  string `json:"object"`
			OwnedBy string `json:"owned_by"`
		}
		response := struct {
			Object string        `json:"object"`
			Data   []openAIModel `json:"data"`
		}{
			Object: "list",
			Data:   make([]openAIModel, 0, len(group.Collections)),
		}
		for _, collection := range group.Collections {
			response.Data = append(response.Data, openAIModel{
				ID:      collection.Name,
				Object:  "model",
				OwnedBy: "group:" + group.Name,
			})
		}
		return json.Marshal(response)
	case config.Claude:
		type claudeModel struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		}
		response := struct {
			Data []claudeModel `json:"data"`
		}{
			Data: make([]claudeModel, 0, len(group.Collections)),
		}
		for _, collection := range group.Collections {
			response.Data = append(response.Data, claudeModel{
				ID:   collection.Name,
				Type: "model",
			})
		}
		return json.Marshal(response)
	case config.Gemini:
		type geminiModel struct {
			Name string `json:"name"`
		}
		response := struct {
			Models []geminiModel `json:"models"`
		}{
			Models: make([]geminiModel, 0, len(group.Collections)),
		}
		for _, collection := range group.Collections {
			response.Models = append(response.Models, geminiModel{
				Name: "models/" + collection.Name,
			})
		}
		return json.Marshal(response)
	default:
		return nil, os.ErrInvalid
	}
}

func buildGroupCandidates(cfg *config.Config, group config.Group, suffix, rawQuery, logicalModel string, requestBody []byte) ([]upstreamCandidate, error) {
	collection := findGroupCollection(group.Collections, logicalModel)
	if collection == nil {
		return nil, os.ErrNotExist
	}

	switch collection.Strategy {
	case config.GroupStrategyFailover:
		candidates := make([]upstreamCandidate, 0, len(collection.Entries))
		for _, entry := range collection.Entries {
			candidate, err := buildGroupCandidate(cfg, group.Type, suffix, rawQuery, logicalModel, requestBody, entry)
			if err != nil {
				return nil, err
			}
			candidates = append(candidates, candidate)
		}
		return candidates, nil
	default:
		entry, ok := chooseWeightedGroupEntry(collection.Entries)
		if !ok {
			return nil, os.ErrInvalid
		}
		candidate, err := buildGroupCandidate(cfg, group.Type, suffix, rawQuery, logicalModel, requestBody, entry)
		if err != nil {
			return nil, err
		}
		return []upstreamCandidate{candidate}, nil
	}
}

func findGroupCollection(collections []config.GroupCollection, logicalModel string) *config.GroupCollection {
	for index := range collections {
		if collections[index].Name == logicalModel {
			return &collections[index]
		}
	}
	return nil
}

func chooseWeightedGroupEntry(entries []config.GroupEntry) (config.GroupEntry, bool) {
	totalWeight := 0
	for _, entry := range entries {
		if entry.Weight > 0 {
			totalWeight += entry.Weight
		}
	}
	if totalWeight <= 0 {
		return config.GroupEntry{}, false
	}
	choice := rand.Intn(totalWeight)
	for _, entry := range entries {
		weight := entry.Weight
		if weight <= 0 {
			continue
		}
		if choice < weight {
			return entry, true
		}
		choice -= weight
	}
	return config.GroupEntry{}, false
}

func buildGroupCandidate(cfg *config.Config, providerType config.ProviderType, suffix, rawQuery, logicalModel string, requestBody []byte, entry config.GroupEntry) (upstreamCandidate, error) {
	if cfg == nil {
		return upstreamCandidate{}, os.ErrInvalid
	}
	provider, providerIndex := cfg.Provider(entry.Provider)
	if providerIndex < 0 || provider == nil {
		return upstreamCandidate{}, os.ErrInvalid
	}
	rewrittenSuffix := rewriteGroupSuffix(providerType, suffix, logicalModel, entry.Model)
	targetURL := buildTargetURL(providerType, provider.BaseURL, rewrittenSuffix, rawQuery)
	if targetURL == "" {
		return upstreamCandidate{}, os.ErrInvalid
	}
	rewrittenRequestBody, err := rewriteGroupRequestBody(providerType, requestBody, entry.Model)
	if err != nil {
		return upstreamCandidate{}, err
	}
	return upstreamCandidate{
		provider: config.Provider{
			Name:    provider.Name,
			Type:    provider.Type,
			BaseURL: provider.BaseURL,
		},
		targetURL:   targetURL,
		requestBody: rewrittenRequestBody,
	}, nil
}

func rewriteGroupSuffix(providerType config.ProviderType, suffix, logicalModel, targetModel string) string {
	if providerType != config.Gemini {
		return suffix
	}
	if targetModel == "" {
		return suffix
	}
	currentModel := providerapi.ExtractGeminiModelFromSuffix(suffix)
	if currentModel == "" {
		currentModel = logicalModel
	}
	if currentModel == "" {
		return suffix
	}
	return strings.Replace(suffix, currentModel, targetModel, 1)
}

func rewriteGroupRequestBody(providerType config.ProviderType, requestBody []byte, targetModel string) ([]byte, error) {
	if len(requestBody) == 0 {
		return requestBody, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(requestBody, &payload); err != nil {
		return nil, err
	}

	if providerType == config.Gemini {
		delete(payload, "model")
	} else {
		payload["model"] = targetModel
	}

	rewrittenBody, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return rewrittenBody, nil
}
