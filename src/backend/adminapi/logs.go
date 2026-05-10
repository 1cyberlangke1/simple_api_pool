package adminapi

import (
	"net/http"
	"strconv"

	"simple-api-pool/applog"
	"simple-api-pool/httpapi"
)

const (
	adminLogLimitDefault = 100
	adminLogLimitMax     = 100
)

type AdminLogsResponse struct {
	Entries    []applog.Entry `json:"entries"`
	NextCursor uint64         `json:"next_cursor"`
	Gap        bool           `json:"gap"`
	Snapshot   []applog.Entry `json:"snapshot,omitempty"`
}

func (ah *Handler) handleLogs(w http.ResponseWriter, r *http.Request) {
	after, limit, ok := parseAdminLogsQuery(r)
	if !ok {
		httpapi.WriteErrorResponse(w, http.StatusBadRequest, "日志游标参数无效")
		return
	}

	delta := applog.RecentEntriesAfter(after, limit)
	httpapi.WriteJSONResponse(w, http.StatusOK, AdminLogsResponse{
		Entries:    delta.Entries,
		NextCursor: delta.NextCursor,
		Gap:        delta.Gap,
		Snapshot:   delta.Snapshot,
	})
}

func parseAdminLogsQuery(r *http.Request) (uint64, int, bool) {
	query := r.URL.Query()
	afterText := query.Get("after")
	limitText := query.Get("limit")

	var (
		after uint64
		limit = adminLogLimitDefault
		err   error
	)
	if afterText != "" {
		after, err = strconv.ParseUint(afterText, 10, 64)
		if err != nil {
			return 0, 0, false
		}
	}
	if limitText != "" {
		limit, err = strconv.Atoi(limitText)
		if err != nil {
			return 0, 0, false
		}
	}
	if limit <= 0 {
		limit = adminLogLimitDefault
	}
	if limit > adminLogLimitMax {
		limit = adminLogLimitMax
	}
	return after, limit, true
}
