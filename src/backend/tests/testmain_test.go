package tests

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	previousValue, hadPreviousValue := os.LookupEnv("ALLOW_PRIVATE_UPSTREAMS")
	_ = os.Setenv("ALLOW_PRIVATE_UPSTREAMS", "true")

	exitCode := m.Run()

	if hadPreviousValue {
		_ = os.Setenv("ALLOW_PRIVATE_UPSTREAMS", previousValue)
	} else {
		_ = os.Unsetenv("ALLOW_PRIVATE_UPSTREAMS")
	}
	os.Exit(exitCode)
}
