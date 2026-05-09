package domain

import "math"

type DisablePolicy struct {
	FailThreshold  int
	MinDisableSecs int
	MaxDisableSecs int
}

type KeyState struct {
	DisabledUntil    int64
	ConsecutiveFails int
}

func NextFailureState(nowUnix int64, currentFails int, policy DisablePolicy) KeyState {
	nextFails := currentFails + 1
	if nextFails < policy.FailThreshold {
		return KeyState{
			DisabledUntil:    0,
			ConsecutiveFails: nextFails,
		}
	}

	disableStartFails := policy.FailThreshold
	if disableStartFails < 1 {
		disableStartFails = 1
	}
	delay := float64(policy.MinDisableSecs) * math.Pow(2, float64(nextFails-disableStartFails))
	if delay > float64(policy.MaxDisableSecs) {
		delay = float64(policy.MaxDisableSecs)
	}

	return KeyState{
		DisabledUntil:    nowUnix + int64(delay),
		ConsecutiveFails: nextFails,
	}
}
