package adminapi

import "log/slog"

func logAdminAudit(event string, attrs ...any) {
	slog.Default().Info("admin_audit", append([]any{"event", event}, attrs...)...)
}
