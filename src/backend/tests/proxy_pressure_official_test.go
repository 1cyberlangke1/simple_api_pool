package tests

import (
	"fmt"
	"testing"
)

func TestDeterministicRandomOfficialTrafficThroughProxy(t *testing.T) {
	const (
		seed      = int64(20260508)
		scenarios = 128
	)

	traffic := buildDeterministicRandomTrafficCases(seed, scenarios)
	concurrentRequests := len(traffic) - randomTrafficWarmupCount(len(traffic))
	if concurrentRequests < 100 {
		t.Fatalf("期望至少发起 100 个并发请求，实际只有 %d", concurrentRequests)
	}
	harness := newRandomTrafficHarness(t, traffic)
	defer harness.Close()

	runRandomTrafficConcurrently(t, harness.proxy, traffic)

	if got := harness.TotalUpstreamCalls(); got >= len(traffic) {
		t.Fatalf("期望缓存流量让总上游调用次数低于总请求数，实际 calls=%d requests=%d", got, len(traffic))
	}

	snapshot := harness.stats.Snapshot()
	for _, routeName := range harness.RouteNames() {
		stat, ok := snapshot[routeName]
		if !ok {
			t.Fatalf("期望路由 %s 产生统计数据", routeName)
		}
		if stat.SuccessCount == 0 {
			t.Fatalf("期望路由 %s 至少成功处理一条请求", routeName)
		}
	}

	if got := harness.TotalCacheEntries(t); got == 0 {
		t.Fatal("期望压力流量后至少写入一条缓存")
	}

	if got := harness.TotalCacheEntries(t); got > harness.TotalCacheLimit() {
		t.Fatalf("期望总缓存条目数不超过配置上限，实际是 %d", got)
	}

	if got := harness.TotalCacheHitCount(); got == 0 {
		t.Fatalf("期望固定 seed=%d 的重复缓存流量至少产生一次缓存命中", seed)
	}

	t.Logf("seed=%d scenarios=%d concurrent_requests=%d upstream_calls=%d cache_entries=%d cache_hits=%d", seed, len(traffic), concurrentRequests, harness.TotalUpstreamCalls(), harness.TotalCacheEntries(t), harness.TotalCacheHitCount())
}

func TestDeterministicRandomOfficialTrafficThroughGroupProxy(t *testing.T) {
	const (
		seed      = int64(20260511)
		scenarios = 128
	)

	traffic := buildDeterministicRandomGroupTrafficCases(seed, scenarios)
	concurrentRequests := len(traffic) - randomTrafficWarmupCount(len(traffic))
	if concurrentRequests < 100 {
		t.Fatalf("期望至少发起 100 个并发请求，实际只有 %d", concurrentRequests)
	}
	harness := newRandomTrafficHarness(t, traffic)
	defer harness.Close()

	runRandomTrafficConcurrently(t, harness.proxy, traffic)

	if got := harness.TotalUpstreamCalls(); got >= len(traffic) {
		t.Fatalf("期望分组缓存流量让总上游调用次数低于总请求数，实际 calls=%d requests=%d", got, len(traffic))
	}

	snapshot := harness.stats.Snapshot()
	for _, routeName := range harness.RouteNames() {
		stat, ok := snapshot[routeName]
		if !ok {
			t.Fatalf("期望分组路由 %s 产生统计数据", routeName)
		}
		if stat.SuccessCount == 0 {
			t.Fatalf("期望分组路由 %s 至少成功处理一条请求", routeName)
		}
	}

	if got := harness.TotalCacheEntries(t); got == 0 {
		t.Fatal("期望分组压力流量后至少写入一条缓存")
	}

	if got := harness.TotalCacheEntries(t); got > harness.TotalCacheLimit() {
		t.Fatalf("期望分组总缓存条目数不超过配置上限，实际是 %d", got)
	}

	if got := harness.TotalCacheHitCount(); got == 0 {
		t.Fatalf("期望固定 seed=%d 的分组重复缓存流量至少产生一次缓存命中", seed)
	}

	t.Logf("seed=%d scenarios=%d concurrent_requests=%d upstream_calls=%d cache_entries=%d cache_hits=%d", seed, len(traffic), concurrentRequests, harness.TotalUpstreamCalls(), harness.TotalCacheEntries(t), harness.TotalCacheHitCount())
}

func assertProxySuccess(t *testing.T, recorder proxyScenarioResult) {
	t.Helper()
	if recorder.StatusCode != 200 {
		t.Fatalf("期望代理返回 200，实际是 %d，响应体: %s", recorder.StatusCode, recorder.Body)
	}
	if recorder.Body == "" {
		t.Fatal("期望代理返回非空响应体")
	}
}

func (r proxyScenarioResult) String() string {
	return fmt.Sprintf("code=%d body=%s", r.StatusCode, r.Body)
}
