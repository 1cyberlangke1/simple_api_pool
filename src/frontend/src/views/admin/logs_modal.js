import { formatLogSummary, formatLogTime, html, isPanelRequestLog } from "../../shared/view_helpers.js";

export function LogsModal(props) {
  if (!props.adminState.logModalOpen) {
    return null;
  }

  const filteredLogs = (props.adminState.overview.recent_logs || []).filter(function keepLogEntry(entry) {
    if (!props.adminState.hidePanelLogs) {
      return true;
    }
    return !isPanelRequestLog(entry);
  });

  return html`
    <div class="log-modal">
      <div class="log-modal-scrim" onClick=${props.onCloseLogs}></div>
      <section class="log-modal-panel">
        <div class="panel-heading">
          <div>
            <h2>${props.translate("admin.logsTitle")}</h2>
            <p>${props.translate("admin.logsHint")}</p>
          </div>
          <button class="ghost-button" type="button" onClick=${props.onCloseLogs}>
            ${props.translate("action.close")}
          </button>
        </div>
        <label class="field checkbox-field">
          <input
            type="checkbox"
            checked=${props.adminState.hidePanelLogs}
            onChange=${function toggleHidePanelLogs(event) {
              props.onHidePanelLogsChange(event.currentTarget.checked);
            }}
          />
          <span>${props.translate("admin.hidePanelLogs")}</span>
        </label>
        <div class="recent-log-list">
          ${filteredLogs.length === 0
            ? html`<div class="empty-panel">${props.translate("admin.logsEmpty")}</div>`
            : filteredLogs.map(function renderLogEntry(entry) {
                return html`
                  <article class=${"terminal-log-entry level-" + String(entry.level || "info").toLowerCase()}>
                    <header>
                      <strong>${String(entry.level || "").toUpperCase()}</strong>
                      <span>${formatLogTime(entry.time, props.language)}</span>
                    </header>
                    <div class="terminal-log-message">${entry.msg}</div>
                    ${formatLogSummary(entry)
                      ? html`<div class="terminal-log-summary">${formatLogSummary(entry)}</div>`
                      : null}
                  </article>
                `;
              })}
        </div>
      </section>
    </div>
  `;
}
