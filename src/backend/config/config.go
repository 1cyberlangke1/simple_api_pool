package config

import (
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"strings"
	"sync"

	"simple-api-pool/domain"
	"simple-api-pool/store"
)

type ProviderType string

const (
	OpenAIChat      ProviderType = "openai_chat"
	OpenAIResponses ProviderType = "openai_responses"
	Claude          ProviderType = "claude"
	Gemini          ProviderType = "gemini"
)

const KeyPermanentlyDisabled int64 = math.MaxInt64

type Key struct {
	Value            string `json:"value"`
	DisabledUntil    int64  `json:"disabled_until"`
	ConsecutiveFails int    `json:"consecutive_fails"`
}

type Provider struct {
	Name            string       `json:"name"`
	Type            ProviderType `json:"type"`
	BaseURL         string       `json:"base_url"`
	Keys            []Key        `json:"keys"`
	CacheEnabled    bool         `json:"cache_enabled"`
	CacheMaxEntries int          `json:"cache_max_entries"`
	KeyStrategy     string       `json:"key_strategy"`
	FailThreshold   int          `json:"fail_threshold"`
	MinDisableSecs  int          `json:"min_disable_secs"`
	MaxDisableSecs  int          `json:"max_disable_secs"`
}

type GroupEntry struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
	Weight   int    `json:"weight"`
	Priority int    `json:"priority"`
}

type GroupCollection struct {
	Name     string       `json:"name"`
	Strategy string       `json:"strategy"`
	Entries  []GroupEntry `json:"entries"`
}

type Group struct {
	Name            string            `json:"name"`
	Type            ProviderType      `json:"type"`
	CacheEnabled    bool              `json:"cache_enabled"`
	CacheMaxEntries int               `json:"cache_max_entries"`
	Collections     []GroupCollection `json:"collections"`
}

type FileConfig struct {
	AdminKey               string     `json:"admin_key"`
	TokenEstimationEnabled bool       `json:"token_estimation_enabled"`
	ClientKeys             []string   `json:"client_keys"`
	Providers              []Provider `json:"providers"`
	Groups                 []Group    `json:"groups"`
}

type Config struct {
	mu    sync.RWMutex
	st    *store.Store
	state FileConfig
	err   error
}

func DefaultBaseURL(t ProviderType) string {
	return domain.DefaultBaseURL(string(t))
}

func IsReservedName(name string) bool {
	return domain.IsReservedProviderName(name)
}

func New(st *store.Store) *Config {
	c := &Config{
		st: st,
		state: FileConfig{
			Providers:  make([]Provider, 0),
			ClientKeys: make([]string, 0),
			Groups:     make([]Group, 0),
		},
	}
	if err := st.Load("config.json", &c.state); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			log.Printf("load config.json failed: %v", err)
			c.err = err
		}
	}

	return c
}

func (c *Config) Err() error {
	if c == nil {
		return nil
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.err
}

func (c *Config) ApplyEnvOverrides() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if v := strings.TrimSpace(os.Getenv("ADMIN_KEY")); v != "" {
		c.state.AdminKey = v
	}
	if v := os.Getenv("CLIENT_KEYS"); v != "" {
		c.state.ClientKeys = parseCommaSep(v)
	}
}

func parseCommaSep(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (c *Config) save() error {
	return c.st.Save("config.json", &c.state)
}

func (c *Config) Providers() []Provider {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cp := make([]Provider, len(c.state.Providers))
	for i := range c.state.Providers {
		cp[i] = cloneProvider(c.state.Providers[i])
	}
	return cp
}

func (c *Config) Provider(name string) (*Provider, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for i, p := range c.state.Providers {
		if p.Name == name {
			cp := cloneProvider(p)
			return &cp, i
		}
	}
	return nil, -1
}

func (c *Config) Groups() []Group {
	c.mu.RLock()
	defer c.mu.RUnlock()
	clonedGroups := make([]Group, len(c.state.Groups))
	for index := range c.state.Groups {
		clonedGroups[index] = cloneGroup(c.state.Groups[index])
	}
	return clonedGroups
}

func (c *Config) Group(name string) (*Group, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for index, group := range c.state.Groups {
		if group.Name == name {
			clonedGroup := cloneGroup(group)
			return &clonedGroup, index
		}
	}
	return nil, -1
}

func (c *Config) SaveProvider(p Provider) error {
	return c.upsertProvider(p, false)
}

func (c *Config) UpdateProviderSettings(p Provider) error {
	return c.upsertProvider(p, true)
}

func (c *Config) upsertProvider(p Provider, preserveKeys bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if group := findGroupByName(c.state.Groups, p.Name); group != nil {
		return os.ErrInvalid
	}

	normalizedProvider, err := normalizeProviderForPersistence(p)
	if err != nil {
		return err
	}
	for i, existing := range c.state.Providers {
		if existing.Name == normalizedProvider.Name {
			if preserveKeys {
				normalizedProvider.Keys = append([]Key(nil), existing.Keys...)
			}
			c.state.Providers[i] = normalizedProvider
			return c.save()
		}
	}
	c.state.Providers = append(c.state.Providers, normalizedProvider)
	return c.save()
}

func (c *Config) SaveGroup(group Group) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if provider := findProviderByName(c.state.Providers, group.Name); provider != nil {
		return os.ErrInvalid
	}

	normalizedGroup, err := normalizeGroupForPersistence(group, c.state.Providers)
	if err != nil {
		return err
	}

	for index, existingGroup := range c.state.Groups {
		if existingGroup.Name == normalizedGroup.Name {
			c.state.Groups[index] = normalizedGroup
			return c.save()
		}
	}
	c.state.Groups = append(c.state.Groups, normalizedGroup)
	return c.save()
}

func (c *Config) DeleteProvider(name string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if groupReferencesProvider(c.state.Groups, name) {
		return os.ErrInvalid
	}
	for i, p := range c.state.Providers {
		if p.Name == name {
			c.state.Providers = append(c.state.Providers[:i], c.state.Providers[i+1:]...)
			return c.save()
		}
	}
	return fmt.Errorf("provider %q: %w", name, os.ErrNotExist)
}

func (c *Config) DeleteGroup(name string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for index, group := range c.state.Groups {
		if group.Name == name {
			c.state.Groups = append(c.state.Groups[:index], c.state.Groups[index+1:]...)
			return c.save()
		}
	}
	return fmt.Errorf("group %q: %w", name, os.ErrNotExist)
}

func (c *Config) AddKeys(providerName string, keys []string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, p := range c.state.Providers {
		if p.Name == providerName {
			seen := make(map[string]struct{}, len(c.state.Providers[i].Keys)+len(keys))
			deduped := make([]Key, 0, len(c.state.Providers[i].Keys)+len(keys))
			for _, existing := range c.state.Providers[i].Keys {
				existing.Value = strings.TrimSpace(existing.Value)
				if existing.Value == "" {
					continue
				}
				if _, ok := seen[existing.Value]; ok {
					continue
				}
				seen[existing.Value] = struct{}{}
				deduped = append(deduped, existing)
			}
			for _, k := range keys {
				k = strings.TrimSpace(k)
				if k == "" {
					continue
				}
				if _, ok := seen[k]; ok {
					continue
				}
				seen[k] = struct{}{}
				deduped = append(deduped, Key{Value: k})
			}
			c.state.Providers[i].Keys = deduped
			return c.save()
		}
	}
	return os.ErrNotExist
}

func (c *Config) DeleteKey(providerName, keyValue string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, p := range c.state.Providers {
		if p.Name == providerName {
			for j, k := range p.Keys {
				if k.Value == keyValue {
					c.state.Providers[i].Keys = append(p.Keys[:j], p.Keys[j+1:]...)
					return c.save()
				}
			}
		}
	}
	return os.ErrNotExist
}

func (c *Config) ApplyKeyAction(providerName, action string, keys []string) error {
	keyAction, ok := parseLegacyKeyAction(action)
	if !ok {
		return os.ErrInvalid
	}
	return c.ApplyStructuredKeyAction(providerName, KeyActionRequest{
		Action: keyAction,
		Keys:   keys,
	})
}

func (c *Config) UpdateKeyState(providerName, keyValue string, disabledUntil int64, fails int) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, p := range c.state.Providers {
		if p.Name == providerName {
			for j, k := range p.Keys {
				if k.Value == keyValue {
					c.state.Providers[i].Keys[j].DisabledUntil = disabledUntil
					c.state.Providers[i].Keys[j].ConsecutiveFails = fails
					return c.save()
				}
			}
		}
	}
	return os.ErrNotExist
}

func (c *Config) AdminSettings() FileConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return FileConfig{
		AdminKey:               c.state.AdminKey,
		TokenEstimationEnabled: c.state.TokenEstimationEnabled,
		ClientKeys:             append([]string(nil), c.state.ClientKeys...),
	}
}

func (c *Config) GlobalConfig() FileConfig {
	return c.AdminSettings()
}

func (c *Config) UpdateGlobalConfig(adminKey string, tokenEst bool, clientKeys []string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state.AdminKey = adminKey
	c.state.TokenEstimationEnabled = tokenEst
	c.state.ClientKeys = clientKeys
	return c.save()
}

func (c *Config) PatchGlobalConfig(adminKey *string, tokenEstimationEnabled *bool, clientKeys *[]string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if adminKey != nil {
		c.state.AdminKey = strings.TrimSpace(*adminKey)
	}
	if tokenEstimationEnabled != nil {
		c.state.TokenEstimationEnabled = *tokenEstimationEnabled
	}
	if clientKeys != nil {
		nextClientKeys := make([]string, 0, len(*clientKeys))
		for _, clientKey := range *clientKeys {
			trimmedClientKey := strings.TrimSpace(clientKey)
			if trimmedClientKey == "" {
				continue
			}
			nextClientKeys = append(nextClientKeys, trimmedClientKey)
		}
		c.state.ClientKeys = nextClientKeys
	}
	return c.save()
}

func (c *Config) AdminKey() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state.AdminKey
}

func (c *Config) ClientKeys() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return append([]string{}, c.state.ClientKeys...)
}

func (c *Config) TokenEstimationEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state.TokenEstimationEnabled
}

func cloneProvider(p Provider) Provider {
	cloned := p
	if p.Keys != nil {
		cloned.Keys = append([]Key(nil), p.Keys...)
	}
	return cloned
}

func cloneGroup(group Group) Group {
	clonedGroup := group
	if group.Collections == nil {
		clonedGroup.Collections = make([]GroupCollection, 0)
		return clonedGroup
	}

	clonedGroup.Collections = make([]GroupCollection, len(group.Collections))
	for collectionIndex, collection := range group.Collections {
		clonedCollection := collection
		if collection.Entries == nil {
			clonedCollection.Entries = make([]GroupEntry, 0)
		} else {
			clonedCollection.Entries = append([]GroupEntry(nil), collection.Entries...)
		}
		clonedGroup.Collections[collectionIndex] = clonedCollection
	}
	return clonedGroup
}

func normalizeProviderBaseURL(rawValue string) (string, error) {
	return domain.NormalizeProviderBaseURL(rawValue)
}

func findProviderByName(providers []Provider, name string) *Provider {
	for index := range providers {
		if providers[index].Name == name {
			return &providers[index]
		}
	}
	return nil
}

func findGroupByName(groups []Group, name string) *Group {
	for index := range groups {
		if groups[index].Name == name {
			return &groups[index]
		}
	}
	return nil
}
