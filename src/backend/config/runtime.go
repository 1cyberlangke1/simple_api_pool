package config

import (
	"log"
	"math"
	"strings"

	cenv "github.com/caarlos0/env/v11"
)

const DefaultListenPort = "18080"
const DefaultUpstreamResponseLimitBytes int64 = 128 << 10
const DefaultCacheableRequestBodyLimitBytes = 512 << 10
const DefaultProxyConcurrency = 50
const DefaultCacheableStreamResponseLimitBytes = 1 << 20

type RuntimeConfig struct {
	ListenAddr                        string
	UpstreamResponseLimitBytes        int64
	CacheableRequestBodyLimitBytes    int
	ProxyConcurrency                  int
	CacheableStreamResponseLimitBytes int
}

type runtimeEnvConfig struct {
	Port                              string `env:"PORT"`
	UpstreamResponseLimitBytes        int64  `env:"UPSTREAM_RESPONSE_LIMIT_BYTES"`
	CacheableRequestBodyLimitBytes    int64  `env:"CACHEABLE_REQUEST_BODY_LIMIT_BYTES"`
	ProxyConcurrency                  int64  `env:"PROXY_CONCURRENCY"`
	CacheableStreamResponseLimitBytes int64  `env:"CACHEABLE_STREAM_RESPONSE_LIMIT_BYTES"`
}

func LoadRuntime() RuntimeConfig {
	envConfig := runtimeEnvConfig{}
	if err := cenv.Parse(&envConfig); err != nil {
		log.Printf("parse runtime env failed: %v", err)
	}

	return RuntimeConfig{
		ListenAddr:                        normalizeListenAddr(envConfig.Port),
		UpstreamResponseLimitBytes:        normalizeUpstreamResponseLimitBytes(envConfig.UpstreamResponseLimitBytes),
		CacheableRequestBodyLimitBytes:    normalizeCacheableRequestBodyLimitBytes(envConfig.CacheableRequestBodyLimitBytes),
		ProxyConcurrency:                  normalizeProxyConcurrency(envConfig.ProxyConcurrency),
		CacheableStreamResponseLimitBytes: normalizeCacheableStreamResponseLimitBytes(envConfig.CacheableStreamResponseLimitBytes),
	}
}

func ListenAddr() string {
	return LoadRuntime().ListenAddr
}

func UpstreamResponseLimitBytes() int64 {
	return LoadRuntime().UpstreamResponseLimitBytes
}

func CacheableRequestBodyLimitBytes() int {
	return LoadRuntime().CacheableRequestBodyLimitBytes
}

func ProxyConcurrency() int {
	return LoadRuntime().ProxyConcurrency
}

func CacheableStreamResponseLimitBytes() int {
	return LoadRuntime().CacheableStreamResponseLimitBytes
}

func normalizeListenAddr(rawPort string) string {
	port := strings.TrimSpace(rawPort)
	if port == "" {
		port = DefaultListenPort
	}
	return ":" + port
}

func normalizeUpstreamResponseLimitBytes(limitBytes int64) int64 {
	if limitBytes <= 0 {
		return DefaultUpstreamResponseLimitBytes
	}
	return limitBytes
}

func normalizeCacheableRequestBodyLimitBytes(limitBytes int64) int {
	maxIntValue := int64(math.MaxInt)
	if limitBytes <= 0 || limitBytes > maxIntValue {
		return DefaultCacheableRequestBodyLimitBytes
	}
	return int(limitBytes)
}

func normalizeProxyConcurrency(rawValue int64) int {
	maxIntValue := int64(math.MaxInt)
	if rawValue <= 0 || rawValue > maxIntValue {
		return DefaultProxyConcurrency
	}
	return int(rawValue)
}

func normalizeCacheableStreamResponseLimitBytes(limitBytes int64) int {
	maxIntValue := int64(math.MaxInt)
	if limitBytes <= 0 || limitBytes > maxIntValue {
		return DefaultCacheableStreamResponseLimitBytes
	}
	return int(limitBytes)
}
