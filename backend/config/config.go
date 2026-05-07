package config

import (
	"os"
	"strings"
	"sync"

	"simple-api-pool/store"
)

type ProviderType string

const (
	OpenAIChat      ProviderType = "openai_chat"
	OpenAIResponses ProviderType = "openai_responses"
	Claude          ProviderType = "claude"
	Gemini          ProviderType = "gemini"
)

var ReservedNames = map[string]bool{"api": true, "cache": true, "status": true, "admin": true}

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

type FileConfig struct {
	AdminKey               string     `json:"admin_key"`
	TokenEstimationEnabled bool       `json:"token_estimation_enabled"`
	ClientKeys             []string   `json:"client_keys"`
	Providers              []Provider `json:"providers"`
}

type Config struct {
	mu    sync.RWMutex
	st    *store.Store
	state FileConfig
}

func DefaultBaseURL(t ProviderType) string {
	switch t {
	case OpenAIChat:
		return "https://api.openai.com"
	case OpenAIResponses:
		return "https://api.openai.com"
	case Claude:
		return "https://api.anthropic.com"
	case Gemini:
		return "https://generativelanguage.googleapis.com"
	default:
		return ""
	}
}

func New(st *store.Store) *Config {
	c := &Config{st: st}
	if err := st.Load("config.json", &c.state); err != nil {
		c.state = FileConfig{
			Providers:  make([]Provider, 0),
			ClientKeys: make([]string, 0),
		}
	}

	if v := os.Getenv("ADMIN_KEY"); v != "" {
		c.state.AdminKey = v
	}
	if v := os.Getenv("CLIENT_KEYS"); v != "" {
		c.state.ClientKeys = parseCommaSep(v)
	}

	return c
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

func (c *Config) save() {
	c.st.Save("config.json", &c.state)
}

func (c *Config) Providers() []Provider {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cp := make([]Provider, len(c.state.Providers))
	copy(cp, c.state.Providers)
	return cp
}

func (c *Config) Provider(name string) (*Provider, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for i, p := range c.state.Providers {
		if p.Name == name {
			cp := p
			return &cp, i
		}
	}
	return nil, -1
}

func (c *Config) SaveProvider(p Provider) error {
	if ReservedNames[p.Name] {
		return os.ErrInvalid
	}
	if p.BaseURL == "" {
		p.BaseURL = DefaultBaseURL(p.Type)
	}
	if p.KeyStrategy == "" {
		p.KeyStrategy = "round_robin"
	}
	if p.FailThreshold == 0 {
		p.FailThreshold = 3
	}
	if p.MinDisableSecs == 0 {
		p.MinDisableSecs = 30
	}
	if p.MaxDisableSecs == 0 {
		p.MaxDisableSecs = 3600
	}
	if p.CacheMaxEntries == 0 {
		p.CacheMaxEntries = 1000
	}
	if p.Keys == nil {
		p.Keys = make([]Key, 0)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	for i, existing := range c.state.Providers {
		if existing.Name == p.Name {
			p.Keys = existing.Keys
			c.state.Providers[i] = p
			c.save()
			return nil
		}
	}
	c.state.Providers = append(c.state.Providers, p)
	c.save()
	return nil
}

func (c *Config) DeleteProvider(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, p := range c.state.Providers {
		if p.Name == name {
			c.state.Providers = append(c.state.Providers[:i], c.state.Providers[i+1:]...)
			c.save()
			return
		}
	}
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
			c.save()
			return nil
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
					c.save()
					return nil
				}
			}
		}
	}
	return os.ErrNotExist
}

func (c *Config) UpdateKeyState(providerName, keyValue string, disabledUntil int64, fails int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, p := range c.state.Providers {
		if p.Name == providerName {
			for j, k := range p.Keys {
				if k.Value == keyValue {
					c.state.Providers[i].Keys[j].DisabledUntil = disabledUntil
					c.state.Providers[i].Keys[j].ConsecutiveFails = fails
					return
				}
			}
		}
	}
}

func (c *Config) GlobalConfig() FileConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cfg := c.state
	cfg.Providers = nil
	return cfg
}

func (c *Config) UpdateGlobalConfig(adminKey string, tokenEst bool, clientKeys []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state.AdminKey = adminKey
	c.state.TokenEstimationEnabled = tokenEst
	c.state.ClientKeys = clientKeys
	c.save()
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
