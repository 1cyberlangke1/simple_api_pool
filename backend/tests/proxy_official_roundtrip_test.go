package tests

import "testing"

func TestOfficialProviderRoundTripAndCacheHit(t *testing.T) {
	for _, tc := range buildOfficialRoundTripCases() {
		t.Run(tc.Name, func(t *testing.T) {
			harness := newOfficialProviderHarness(t, tc)
			defer harness.Close()

			first := runProxyScenario(t, harness.proxy, tc.Request)
			tc.AssertFirstResponse(t, first)

			second := runProxyScenario(t, harness.proxy, tc.Request)
			tc.AssertCachedResponse(t, second)

			if got := harness.UpstreamCalls(); got != 1 {
				t.Fatalf("期望第二次相同缓存请求不再访问上游，实际上游调用次数是 %d", got)
			}
			tc.AssertUpstreamRequest(t, harness.LastObservedRequest())
		})
	}
}
