package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

const DefaultListenPort = "18080"
const DefaultUpstreamResponseLimitBytes int64 = 128 << 10
const DefaultCacheableRequestBodyLimitBytes = 512 << 10

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

func CacheableRequestBodyLimitBytes() int {
	rawValue := strings.TrimSpace(os.Getenv("CACHEABLE_REQUEST_BODY_LIMIT_BYTES"))
	if rawValue == "" {
		return DefaultCacheableRequestBodyLimitBytes
	}

	limitBytes, err := strconv.ParseInt(rawValue, 10, 64)
	maxIntValue := int64(int(^uint(0) >> 1))
	if err != nil || limitBytes <= 0 || limitBytes > maxIntValue {
		log.Printf("invalid CACHEABLE_REQUEST_BODY_LIMIT_BYTES=%q, fallback to %d", rawValue, DefaultCacheableRequestBodyLimitBytes)
		return DefaultCacheableRequestBodyLimitBytes
	}
	return int(limitBytes)
}
