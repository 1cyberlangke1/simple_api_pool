/* ---------- logs view ---------- */

    function formatLogTimestamp(rawValue) {
      if (!rawValue) {
        return "";
      }

      const parsedDate = new Date(rawValue);
      if (Number.isNaN(parsedDate.getTime())) {
        return String(rawValue);
      }

      const locale = state.lang === "en" ? "en-US" : "zh-CN";
      return parsedDate.toLocaleString(locale, { hour12: false });
    }

    function formatLogSummary(attributes) {
      const entries = Object.entries(attributes || {}).slice(0, 6);
      if (!entries.length) {
        return "";
      }

      return entries.map((entry) => {
        const formattedValue = typeof entry[1] === "object" && entry[1] !== null
          ? JSON.stringify(entry[1])
          : String(entry[1]);
        return entry[0] + "=" + formattedValue;
      }).join(" · ");
    }

    function classifyLogLevel(level) {
      const normalizedLevel = String(level || "").toLowerCase();
      if (normalizedLevel === "error") {
        return "level-error";
      }
      if (normalizedLevel === "warn" || normalizedLevel === "warning") {
        return "level-warn";
      }
      if (normalizedLevel === "debug") {
        return "level-debug";
      }
      return "level-info";
    }

    function isPanelRequestLog(entry) {
      if (!entry || entry.msg !== "http_request") {
        return false;
      }

      const attrs = entry && entry.attrs ? entry.attrs : {};
      const path = String(attrs.path || "");
      if (!path) {
        return false;
      }

      return path === "/" ||
        path === "/status" ||
        path === "/admin" ||
        path === "/favicon.ico" ||
        path === "/api/health" ||
        path.startsWith("/api/status") ||
        path.startsWith("/api/admin");
    }

    function setLogModalOpen(visible) {
      refs.logModal.classList.toggle("hidden", !visible);
      document.body.style.overflow = visible ? "hidden" : "";
      refs.logModal.setAttribute("tabindex", "-1");
      if (visible) {
        refs.logModal.focus();
      }
    }

    function renderRecentLogs(logEntries) {
      state.recentLogs = Array.isArray(logEntries) ? logEntries : [];
      const visibleLogs = state.hidePanelLogs
        ? state.recentLogs.filter((entry) => !isPanelRequestLog(entry))
        : state.recentLogs;

      if (!visibleLogs.length) {
        refs.recentLogList.innerHTML = '<div class="empty">' + escapeHTML(t("admin.logEmpty")) + "</div>";
        return;
      }

      refs.recentLogList.innerHTML = visibleLogs.slice().reverse().map((entry) => {
        const levelClass = classifyLogLevel(entry.level);
        const summary = formatLogSummary(entry.attrs);
        return '\n          <article class="terminal-log-entry ' + levelClass + '">\n            <div class="terminal-log-head">\n              <div class="terminal-log-level">' + escapeHTML(entry.level || "INFO") + '</div>\n              <div class="terminal-log-time">' + escapeHTML(formatLogTimestamp(entry.time)) + '</div>\n            </div>\n            <div class="terminal-log-title">' + escapeHTML(entry.msg || "") + '</div>\n            <div class="terminal-log-summary">' + escapeHTML(summary || "") + "</div>\n          </article>\n        ";
      }).join("");
    }
