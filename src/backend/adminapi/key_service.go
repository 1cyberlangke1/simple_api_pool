package adminapi

import (
	"simple-api-pool/config"
	svc "simple-api-pool/service"
)

type KeyActionInput struct {
	Action         string   `json:"action" validate:"required"`
	Keys           []string `json:"keys" validate:"required,min=1,dive,required"`
	DisabledUntil  int64    `json:"disabled_until" validate:"omitempty"`
	DisableSeconds int64    `json:"disable_seconds" validate:"omitempty"`
}

type KeyActionService struct {
	keyActionService *svc.KeyActionService
}

func NewKeyActionService(cfg *config.Config) *KeyActionService {
	return &KeyActionService{keyActionService: svc.NewKeyActionService(cfg)}
}

func (service *KeyActionService) Apply(providerName string, input KeyActionInput) error {
	if err := service.keyActionService.Apply(providerName, svc.KeyActionInput{
		Action:         input.Action,
		Keys:           input.Keys,
		DisabledUntil:  input.DisabledUntil,
		DisableSeconds: input.DisableSeconds,
	}); err != nil {
		return err
	}
	logAdminAudit("key_action",
		"provider", providerName,
		"action", input.Action,
		"key_count", len(input.Keys),
	)
	return nil
}
