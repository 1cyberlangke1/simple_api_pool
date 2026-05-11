package config

import (
	"os"
	"sort"
	"strings"
)

const (
	GroupStrategyWeightedRandom = "weighted_random"
	GroupStrategyFailover       = "failover"
)

func normalizeGroupForPersistence(group Group, providers []Provider) (Group, error) {
	group.Name = strings.TrimSpace(group.Name)
	if group.Name == "" || IsReservedName(group.Name) {
		return Group{}, os.ErrInvalid
	}
	if !isSupportedProviderType(group.Type) {
		return Group{}, os.ErrInvalid
	}
	if group.CacheMaxEntries <= 0 {
		group.CacheMaxEntries = 1000
	}
	if group.Collections == nil {
		group.Collections = make([]GroupCollection, 0)
	}

	providersByName := make(map[string]Provider, len(providers))
	for _, provider := range providers {
		providersByName[provider.Name] = provider
	}

	seenCollections := make(map[string]struct{}, len(group.Collections))
	normalizedCollections := make([]GroupCollection, 0, len(group.Collections))
	for collectionIndex, collection := range group.Collections {
		normalizedCollection, err := normalizeGroupCollectionForPersistence(collection, collectionIndex, group.Type, providersByName)
		if err != nil {
			return Group{}, err
		}
		if _, exists := seenCollections[normalizedCollection.Name]; exists {
			return Group{}, os.ErrInvalid
		}
		seenCollections[normalizedCollection.Name] = struct{}{}
		normalizedCollections = append(normalizedCollections, normalizedCollection)
	}
	group.Collections = normalizedCollections
	return group, nil
}

func normalizeGroupCollectionForPersistence(collection GroupCollection, collectionIndex int, groupType ProviderType, providersByName map[string]Provider) (GroupCollection, error) {
	collection.Name = strings.TrimSpace(collection.Name)
	if collection.Name == "" {
		return GroupCollection{}, os.ErrInvalid
	}
	collection.Strategy = strings.TrimSpace(collection.Strategy)
	if collection.Strategy == "" {
		collection.Strategy = GroupStrategyWeightedRandom
	}
	if collection.Strategy != GroupStrategyWeightedRandom && collection.Strategy != GroupStrategyFailover {
		return GroupCollection{}, os.ErrInvalid
	}
	if len(collection.Entries) == 0 {
		return GroupCollection{}, os.ErrInvalid
	}

	normalizedEntries := make([]GroupEntry, 0, len(collection.Entries))
	for entryIndex, entry := range collection.Entries {
		normalizedEntry, err := normalizeGroupEntryForPersistence(entry, entryIndex, groupType, providersByName)
		if err != nil {
			return GroupCollection{}, err
		}
		normalizedEntries = append(normalizedEntries, normalizedEntry)
	}

	if collection.Strategy == GroupStrategyFailover {
		sort.SliceStable(normalizedEntries, func(left, right int) bool {
			if normalizedEntries[left].Priority != normalizedEntries[right].Priority {
				return normalizedEntries[left].Priority < normalizedEntries[right].Priority
			}
			return left < right
		})
	}

	collection.Entries = normalizedEntries
	_ = collectionIndex
	return collection, nil
}

func normalizeGroupEntryForPersistence(entry GroupEntry, entryIndex int, groupType ProviderType, providersByName map[string]Provider) (GroupEntry, error) {
	entry.Provider = strings.TrimSpace(entry.Provider)
	entry.Model = strings.TrimSpace(entry.Model)
	if entry.Provider == "" || entry.Model == "" {
		return GroupEntry{}, os.ErrInvalid
	}

	provider, exists := providersByName[entry.Provider]
	if !exists || provider.Type != groupType {
		return GroupEntry{}, os.ErrInvalid
	}

	if entry.Weight <= 0 {
		entry.Weight = 1
	}
	if entry.Priority <= 0 {
		entry.Priority = entryIndex + 1
	}
	return entry, nil
}

func groupReferencesProvider(groups []Group, providerName string) bool {
	for _, group := range groups {
		for _, collection := range group.Collections {
			for _, entry := range collection.Entries {
				if entry.Provider == providerName {
					return true
				}
			}
		}
	}
	return false
}

func isSupportedProviderType(providerType ProviderType) bool {
	switch providerType {
	case OpenAIChat, OpenAIResponses, Claude, Gemini:
		return true
	default:
		return false
	}
}
