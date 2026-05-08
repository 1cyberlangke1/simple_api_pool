package tests

import "testing"

func TestProxyCacheEvictionRemovesOldestDeterministicEntries(t *testing.T) {
	harness := newOpenAICacheEvictionHarness(t, 3)
	defer harness.Close()

	requests := buildDeterministicOpenAIChatRequests(20260508, 5)
	for _, request := range requests {
		recorder := runProxyScenario(t, harness.proxy, request)
		assertProxySuccess(t, recorder)
	}

	if got := harness.UpstreamCalls(); got != len(requests) {
		t.Fatalf("期望首次写入 %d 个不同请求时全部访问上游，实际是 %d", len(requests), got)
	}

	latestHit := runProxyScenario(t, harness.proxy, requests[len(requests)-1])
	assertProxySuccess(t, latestHit)
	if got := harness.UpstreamCalls(); got != len(requests) {
		t.Fatalf("期望最新条目仍然命中缓存，实际上游调用次数是 %d", got)
	}

	oldestMiss := runProxyScenario(t, harness.proxy, requests[0])
	assertProxySuccess(t, oldestMiss)
	if got := harness.UpstreamCalls(); got != len(requests)+1 {
		t.Fatalf("期望最旧条目已被淘汰并重新回源，实际上游调用次数是 %d", got)
	}

	if got := harness.CacheEntryCount(t); got != 3 {
		t.Fatalf("期望缓存最终条目数等于上限 3，实际是 %d", got)
	}
}
