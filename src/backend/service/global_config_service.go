package service

import (
	"errors"
	"strings"

	"simple-api-pool/config"
)

var ErrAdminKeyRequired = errors.New("admin key required")

type GlobalConfigUpdateInput struct {
	AdminKey               *string
	TokenEstimationEnabled *bool
	ClientKeys             *[]string
}

type GlobalConfigService struct {
	cfg *config.Config
}

type GlobalConfigDetailSnapshot struct {
	AdminKeyConfigured     bool     `json:"admin_key_configured"`
	TokenEstimationEnabled bool     `json:"token_estimation_enabled"`
	ClientKeyCount         int      `json:"client_key_count"`
	ClientKeys             []string `json:"client_keys"`
}

func NewGlobalConfigService(cfg *config.Config) *GlobalConfigService {
	return &GlobalConfigService{cfg: cfg}
}

func (service *GlobalConfigService) Snapshot() GlobalConfigSnapshot {
	detail := service.DetailSnapshot()
	return GlobalConfigSnapshot{
		AdminKeyConfigured:     detail.AdminKeyConfigured,
		TokenEstimationEnabled: detail.TokenEstimationEnabled,
		ClientKeyCount:         detail.ClientKeyCount,
	}
}

func (service *GlobalConfigService) DetailSnapshot() GlobalConfigDetailSnapshot {
	globalConfig := service.cfg.AdminSettings()
	clientKeys := append([]string(nil), globalConfig.ClientKeys...)
	return GlobalConfigDetailSnapshot{
		AdminKeyConfigured:     globalConfig.AdminKey != "",
		TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
		ClientKeyCount:         len(globalConfig.ClientKeys),
		ClientKeys:             clientKeys,
	}
}

func (service *GlobalConfigService) Update(input GlobalConfigUpdateInput) (bool, error) {
	if input.AdminKey != nil && strings.TrimSpace(*input.AdminKey) == "" {
		return false, ErrAdminKeyRequired
	}
	if err := service.cfg.PatchGlobalConfig(input.AdminKey, input.TokenEstimationEnabled, input.ClientKeys); err != nil {
		return false, err
	}
	return input.AdminKey != nil, nil
}
