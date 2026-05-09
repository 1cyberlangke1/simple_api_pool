package adminapi

import (
	"os"
	"time"

	"simple-api-pool/config"
)

type KeyActionInput struct {
	Action         string   `json:"action"`
	Keys           []string `json:"keys"`
	DisabledUntil  int64    `json:"disabled_until"`
	DisableSeconds int64    `json:"disable_seconds"`
}

type KeyActionService struct {
	cfg *config.Config
}

func NewKeyActionService(cfg *config.Config) *KeyActionService {
	return &KeyActionService{cfg: cfg}
}

func (service *KeyActionService) Apply(providerName string, input KeyActionInput) error {
	if service == nil || service.cfg == nil {
		return os.ErrInvalid
	}

	request := config.KeyActionRequest{
		Keys: input.Keys,
	}
	switch input.Action {
	case "enable":
		request.Action = config.KeyActionEnable
	case "delete":
		request.Action = config.KeyActionDelete
	case "disable", "disable_forever":
		request.Action = config.KeyActionDisableForever
	case "disable_until":
		request.Action = config.KeyActionDisableUntil
		request.DisabledUntil = input.DisabledUntil
		if request.DisabledUntil <= 0 && input.DisableSeconds > 0 {
			request.DisabledUntil = time.Now().Unix() + input.DisableSeconds
		}
	default:
		return os.ErrInvalid
	}

	if err := service.cfg.ApplyStructuredKeyAction(providerName, request); err != nil {
		return err
	}
	logAdminAudit("key_action",
		"provider", providerName,
		"action", string(request.Action),
		"key_count", len(request.Keys),
	)
	return nil
}
