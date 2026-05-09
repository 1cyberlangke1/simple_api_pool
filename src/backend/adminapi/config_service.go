package adminapi

import (
	"simple-api-pool/config"
	svc "simple-api-pool/service"
)

var ErrAdminKeyRequired = svc.ErrAdminKeyRequired

type ConfigService struct {
	globalConfigService *svc.GlobalConfigService
}

func NewConfigService(cfg *config.Config) *ConfigService {
	return &ConfigService{globalConfigService: svc.NewGlobalConfigService(cfg)}
}

type GlobalConfigUpdateInput struct {
	AdminKey               *string   `json:"admin_key" validate:"omitempty"`
	TokenEstimationEnabled *bool     `json:"token_estimation_enabled" validate:"omitempty"`
	ClientKeys             *[]string `json:"client_keys" validate:"omitempty,dive,required"`
}

func (service *ConfigService) Snapshot() GlobalConfigSnapshot {
	snapshot := service.globalConfigService.Snapshot()
	return GlobalConfigSnapshot(snapshot)
}

func (service *ConfigService) Update(input GlobalConfigUpdateInput) (bool, error) {
	changedAdminKey, err := service.globalConfigService.Update(svc.GlobalConfigUpdateInput{
		AdminKey:               input.AdminKey,
		TokenEstimationEnabled: input.TokenEstimationEnabled,
		ClientKeys:             input.ClientKeys,
	})
	if err != nil {
		return false, err
	}
	snapshot := service.globalConfigService.Snapshot()
	logAdminAudit("global_config_update",
		"admin_key_changed", changedAdminKey,
		"token_estimation_enabled", snapshot.TokenEstimationEnabled,
		"client_key_count", snapshot.ClientKeyCount,
	)
	return changedAdminKey, nil
}
