package adminapi

import (
	"errors"
	"strings"

	"simple-api-pool/config"
)

var ErrAdminKeyRequired = errors.New("admin key required")

type ConfigService struct {
	cfg *config.Config
}

func NewConfigService(cfg *config.Config) *ConfigService {
	return &ConfigService{cfg: cfg}
}

type GlobalConfigUpdateInput struct {
	AdminKey               *string   `json:"admin_key"`
	TokenEstimationEnabled *bool     `json:"token_estimation_enabled"`
	ClientKeys             *[]string `json:"client_keys"`
}

func (service *ConfigService) Snapshot() GlobalConfigSnapshot {
	globalConfig := service.cfg.AdminSettings()
	return GlobalConfigSnapshot{
		AdminKeyConfigured:     globalConfig.AdminKey != "",
		TokenEstimationEnabled: globalConfig.TokenEstimationEnabled,
		ClientKeyCount:         len(globalConfig.ClientKeys),
	}
}

func (service *ConfigService) Update(input GlobalConfigUpdateInput) (bool, error) {
	if input.AdminKey != nil && strings.TrimSpace(*input.AdminKey) == "" {
		return false, ErrAdminKeyRequired
	}
	if err := service.cfg.PatchGlobalConfig(input.AdminKey, input.TokenEstimationEnabled, input.ClientKeys); err != nil {
		return false, err
	}
	snapshot := service.cfg.GlobalConfig()
	logAdminAudit("global_config_update",
		"admin_key_changed", input.AdminKey != nil,
		"token_estimation_enabled", snapshot.TokenEstimationEnabled,
		"client_key_count", len(snapshot.ClientKeys),
	)
	return input.AdminKey != nil, nil
}
