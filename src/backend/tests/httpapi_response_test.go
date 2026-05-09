package tests

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simple-api-pool/httpapi"
)

func TestWriteJSONResponseReturnsInternalServerErrorWhenPayloadCannotBeEncoded(t *testing.T) {
	recursive := map[string]any{}
	recursive["self"] = recursive

	rec := httptest.NewRecorder()
	httpapi.WriteJSONResponse(rec, http.StatusOK, recursive)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("期望 JSON 编码失败时返回 500，实际是 %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("期望返回 JSON Content-Type，实际是 %q", got)
	}
	if !strings.Contains(rec.Body.String(), `"error":"生成 JSON 响应失败"`) {
		t.Fatalf("期望返回统一错误体，实际是 %s", rec.Body.String())
	}
}
