package realtime

import (
	"net/http"
	"strconv"
	"strings"
)

func ResolveAfter(r *http.Request) (uint64, error) {
	headerValue := strings.TrimSpace(r.Header.Get("Last-Event-ID"))
	if headerValue != "" {
		return strconv.ParseUint(headerValue, 10, 64)
	}

	queryValue := strings.TrimSpace(r.URL.Query().Get("after"))
	if queryValue == "" {
		return 0, nil
	}
	return strconv.ParseUint(queryValue, 10, 64)
}
