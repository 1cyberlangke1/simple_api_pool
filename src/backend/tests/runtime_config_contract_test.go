package tests

import (
	"testing"

	"simple-api-pool/config"
)

func TestRuntimeConfigParsesEnvOverrides(t *testing.T) {
	t.Setenv("PORT", "19095")
	t.Setenv("UPSTREAM_RESPONSE_LIMIT_BYTES", "262144")
	t.Setenv("CACHEABLE_REQUEST_BODY_LIMIT_BYTES", "1048576")
	t.Setenv("PROXY_CONCURRENCY", "88")
	t.Setenv("CACHEABLE_STREAM_RESPONSE_LIMIT_BYTES", "1572864")

	runtimeConfig := config.LoadRuntime()

	if runtimeConfig.ListenAddr != ":19095" {
		t.Fatalf("期望监听地址为 :19095，实际是 %q", runtimeConfig.ListenAddr)
	}
	if runtimeConfig.UpstreamResponseLimitBytes != 262144 {
		t.Fatalf("期望上游响应上限为 262144，实际是 %d", runtimeConfig.UpstreamResponseLimitBytes)
	}
	if runtimeConfig.CacheableRequestBodyLimitBytes != 1048576 {
		t.Fatalf("期望可缓存请求体上限为 1048576，实际是 %d", runtimeConfig.CacheableRequestBodyLimitBytes)
	}
	if runtimeConfig.ProxyConcurrency != 88 {
		t.Fatalf("期望代理并发为 88，实际是 %d", runtimeConfig.ProxyConcurrency)
	}
	if runtimeConfig.CacheableStreamResponseLimitBytes != 1572864 {
		t.Fatalf("期望流式缓存累计上限为 1572864，实际是 %d", runtimeConfig.CacheableStreamResponseLimitBytes)
	}
}

func TestRuntimeConfigFallsBackToDefaultsForInvalidEnv(t *testing.T) {
	t.Setenv("PORT", " ")
	t.Setenv("UPSTREAM_RESPONSE_LIMIT_BYTES", "-1")
	t.Setenv("CACHEABLE_REQUEST_BODY_LIMIT_BYTES", "0")
	t.Setenv("PROXY_CONCURRENCY", "-5")
	t.Setenv("CACHEABLE_STREAM_RESPONSE_LIMIT_BYTES", "0")

	runtimeConfig := config.LoadRuntime()

	if runtimeConfig.ListenAddr != ":18080" {
		t.Fatalf("期望默认监听地址为 :18080，实际是 %q", runtimeConfig.ListenAddr)
	}
	if runtimeConfig.UpstreamResponseLimitBytes != config.DefaultUpstreamResponseLimitBytes {
		t.Fatalf("期望回退到默认上游响应上限 %d，实际是 %d", config.DefaultUpstreamResponseLimitBytes, runtimeConfig.UpstreamResponseLimitBytes)
	}
	if runtimeConfig.CacheableRequestBodyLimitBytes != config.DefaultCacheableRequestBodyLimitBytes {
		t.Fatalf("期望回退到默认可缓存请求体上限 %d，实际是 %d", config.DefaultCacheableRequestBodyLimitBytes, runtimeConfig.CacheableRequestBodyLimitBytes)
	}
	if runtimeConfig.ProxyConcurrency != config.DefaultProxyConcurrency {
		t.Fatalf("期望回退到默认代理并发 %d，实际是 %d", config.DefaultProxyConcurrency, runtimeConfig.ProxyConcurrency)
	}
	if runtimeConfig.CacheableStreamResponseLimitBytes != config.DefaultCacheableStreamResponseLimitBytes {
		t.Fatalf("期望回退到默认流式缓存累计上限 %d，实际是 %d", config.DefaultCacheableStreamResponseLimitBytes, runtimeConfig.CacheableStreamResponseLimitBytes)
	}
}
