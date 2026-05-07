package config

import (
	"os"
	"strconv"
)

const DefaultListenPort = "18080"
const DefaultUpstreamResponseLimitBytes int64 = 8 << 20

func ListenAddr() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultListenPort
	}
	return ":" + port
}

func UpstreamResponseLimitBytes() int64 {
	rawValue := os.Getenv("UPSTREAM_RESPONSE_LIMIT_BYTES")
	if rawValue == "" {
		return DefaultUpstreamResponseLimitBytes
	}

	limitBytes, err := strconv.ParseInt(rawValue, 10, 64)
	if err != nil || limitBytes <= 0 {
		return DefaultUpstreamResponseLimitBytes
	}
	return limitBytes
}
