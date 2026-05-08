package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

const DefaultListenPort = "18080"
const DefaultUpstreamResponseLimitBytes int64 = 8 << 20

func ListenAddr() string {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = DefaultListenPort
	}
	return ":" + port
}

func UpstreamResponseLimitBytes() int64 {
	rawValue := strings.TrimSpace(os.Getenv("UPSTREAM_RESPONSE_LIMIT_BYTES"))
	if rawValue == "" {
		return DefaultUpstreamResponseLimitBytes
	}

	limitBytes, err := strconv.ParseInt(rawValue, 10, 64)
	if err != nil || limitBytes <= 0 {
		log.Printf("invalid UPSTREAM_RESPONSE_LIMIT_BYTES=%q, fallback to %d", rawValue, DefaultUpstreamResponseLimitBytes)
		return DefaultUpstreamResponseLimitBytes
	}
	return limitBytes
}
