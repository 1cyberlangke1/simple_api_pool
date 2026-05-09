package tests

import (
	"net/http"
	"testing"

	"simple-api-pool/adminapi"
)

func TestParseAdminRouteDistinguishesBulkKeysAndCachePaths(t *testing.T) {
	cases := []struct {
		name          string
		method        string
		path          string
		wantOperation adminapi.RouteOperation
		wantProvider  string
		wantKey       string
	}{
		{
			name:          "bulk keys",
			method:        http.MethodPost,
			path:          "/api/admin/providers/openai/keys/bulk",
			wantOperation: adminapi.RouteOperationProviderKeysBulk,
			wantProvider:  "openai",
		},
		{
			name:          "provider cache",
			method:        http.MethodDelete,
			path:          "/api/admin/providers/openai/cache",
			wantOperation: adminapi.RouteOperationProviderCache,
			wantProvider:  "openai",
		},
		{
			name:          "single key delete",
			method:        http.MethodDelete,
			path:          "/api/admin/providers/openai/key-1",
			wantOperation: adminapi.RouteOperationProviderKey,
			wantProvider:  "openai",
			wantKey:       "key-1",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			route, err := adminapi.ParseRoute(tc.method, tc.path)
			if err != nil {
				t.Fatalf("解析路由失败: %v", err)
			}
			if route.Operation != tc.wantOperation {
				t.Fatalf("期望操作 %q，实际是 %q", tc.wantOperation, route.Operation)
			}
			if route.ProviderName != tc.wantProvider {
				t.Fatalf("期望 provider=%q，实际是 %q", tc.wantProvider, route.ProviderName)
			}
			if route.KeyName != tc.wantKey {
				t.Fatalf("期望 key=%q，实际是 %q", tc.wantKey, route.KeyName)
			}
		})
	}
}
