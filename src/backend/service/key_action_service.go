package service

import (
	"os"
	"time"

	"simple-api-pool/config"
	"simple-api-pool/domain"
)

type KeyActionInput struct {
	Action         string
	Keys           []string
	DisabledUntil  int64
	DisableSeconds int64
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

	normalizedAction, err := domain.NormalizeKeyActionInput(domain.KeyActionInput{
		Action:         input.Action,
		Keys:           input.Keys,
		DisabledUntil:  input.DisabledUntil,
		DisableSeconds: input.DisableSeconds,
	}, time.Now().Unix())
	if err != nil {
		return err
	}

	request := config.KeyActionRequest{
		Keys:          normalizedAction.Keys,
		DisabledUntil: normalizedAction.DisabledUntil,
	}
	switch normalizedAction.Action {
	case "enable":
		request.Action = config.KeyActionEnable
	case "delete":
		request.Action = config.KeyActionDelete
	case "disable_forever":
		request.Action = config.KeyActionDisableForever
	case "disable_until":
		request.Action = config.KeyActionDisableUntil
	default:
		return os.ErrInvalid
	}

	return service.cfg.ApplyStructuredKeyAction(providerName, request)
}
