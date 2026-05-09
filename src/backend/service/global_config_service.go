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

func NewGlobalConfigService(cfg *config.Config) *GlobalConfigService {
	return &GlobalConfigService{cfg: cfg}
}

func (service *GlobalConfigService) Snapshot() GlobalConfigSnapshot {
	globalConfig := service.cfg.AdminSettings()
	return GlobalConfigSnapshot{
		AdminKeyConfigured:     globalConfig.AdminKey != "",
		TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
		ClientKeyCount:         len(globalConfig.ClientKeys),
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
