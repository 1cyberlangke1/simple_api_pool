import { html, InlineMessage } from "../shared/view_helpers.js";
import { AdminShell } from "./admin/admin_shell.js";
import { KeyWorkspace } from "./admin/key_workspace.js";
import { LogsModal } from "./admin/logs_modal.js";
import { ProviderEditor } from "./admin/provider_editor.js";
import { ProviderSidebar } from "./admin/provider_sidebar.js";

export function AdminPage(props) {
  return html`
    <${AdminShell}
      logsModal=${html`
        <${LogsModal}
          adminState=${props.adminState}
          language=${props.language}
          onCloseLogs=${props.onCloseLogs}
          onHidePanelLogsChange=${props.onHidePanelLogsChange}
          translate=${props.translate}
        />
      `}
    >
      <section class="admin-grid">
        <article class="panel login-panel">
          <div class="panel-heading">
            <div>
              <h2>${props.translate("admin.loginTitle")}</h2>
              <p>${props.translate("admin.loginHint")}</p>
            </div>
            ${props.adminState.authenticated
              ? html`<button class="ghost-button" type="button" onClick=${props.onLogout}>${props.translate("action.logout")}</button>`
              : null}
          </div>

          ${props.adminState.authenticated
            ? html`<${InlineMessage}
                kind="ok"
                text=${props.adminState.globalDraft.admin_key_configured ? props.translate("admin.adminKeyConfigured") : props.translate("admin.adminKeyMissing")}
              />`
            : html`
                <form class="stack-form" onSubmit=${props.onLoginSubmit}>
                  <label class="field">
                    <span>${props.translate("admin.adminKey")}</span>
                    <input name="admin_key" type="password" placeholder=${props.translate("admin.adminKeyPlaceholder")} autocomplete="current-password" />
                  </label>
                  <button class="primary-button" type="submit" disabled=${props.adminState.loginPending}>
                    ${props.adminState.loginPending ? props.translate("message.loading") : props.translate("admin.login")}
                  </button>
                  <${InlineMessage} kind=${props.adminState.loginMessage.kind} text=${props.adminState.loginMessage.text} />
                </form>
              `}
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>${props.translate("admin.globalTitle")}</h2>
              <p>${props.translate("admin.globalSummary")}</p>
            </div>
          </div>
          <form class="stack-form" onSubmit=${props.onGlobalSave}>
            <label class="field">
              <span>${props.translate("admin.adminKey")}</span>
              <input
                type="password"
                value=${props.adminState.globalDraft.admin_key}
                placeholder=${props.translate("admin.adminKeyPlaceholder")}
                autocomplete="new-password"
                onInput=${function handleAdminKeyInput(event) {
                  props.onGlobalDraftChange("admin_key", event.currentTarget.value);
                }}
              />
            </label>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                checked=${Boolean(props.adminState.globalDraft.token_estimation_enabled)}
                onChange=${function handleTokenEstimationChange(event) {
                  props.onGlobalDraftChange("token_estimation_enabled", event.currentTarget.checked);
                }}
              />
              <span>${props.translate("admin.tokenEstimation")}</span>
            </label>
            <label class="field">
              <span>${props.translate("admin.clientKeys")}</span>
              <textarea
                value=${props.adminState.globalDraft.client_keys_text}
                placeholder=${props.translate("admin.clientKeysHint")}
                onInput=${function handleClientKeysInput(event) {
                  props.onGlobalDraftChange("client_keys_text", event.currentTarget.value);
                }}
              ></textarea>
            </label>
            <button class="primary-button" type="submit" disabled=${!props.adminState.authenticated}>
              ${props.translate("action.save")}
            </button>
            <${InlineMessage} kind=${props.adminState.globalMessage.kind} text=${props.adminState.globalMessage.text} />
          </form>
        </article>
      </section>

      ${props.adminState.actionMessage.text ? html`<${InlineMessage} kind=${props.adminState.actionMessage.kind} text=${props.adminState.actionMessage.text} />` : null}

      <section class="panel provider-layout">
        <${ProviderSidebar}
          adminState=${props.adminState}
          onCreateProvider=${props.onCreateProvider}
          onCreateProviderDraftChange=${props.onCreateProviderDraftChange}
          onOpenLogs=${props.onOpenLogs}
          onProviderSearchChange=${props.onProviderSearchChange}
          onSelectProvider=${props.onSelectProvider}
          translate=${props.translate}
          visibleProviders=${props.visibleProviders}
        />

        <div class="provider-main">
          <${ProviderEditor}
            adminState=${props.adminState}
            onClearCache=${props.onClearCache}
            onDeleteProvider=${props.onDeleteProvider}
            onSaveSelectedProvider=${props.onSaveSelectedProvider}
            onSelectedProviderDraftChange=${props.onSelectedProviderDraftChange}
            selectedProvider=${props.selectedProvider}
            selectedProviderStats=${props.selectedProviderStats}
            translate=${props.translate}
          />
          <${KeyWorkspace}
            adminState=${props.adminState}
            disableBounds=${props.disableBounds}
            language=${props.language}
            normalizeBulkSeconds=${props.normalizeBulkSeconds}
            onApplyBulkAction=${props.onApplyBulkAction}
            onBulkModeChange=${props.onBulkModeChange}
            onBulkSecondsChange=${props.onBulkSecondsChange}
            onClearSelection=${props.onClearSelection}
            onDeleteSingleKey=${props.onDeleteSingleKey}
            onImportKeys=${props.onImportKeys}
            onImportTextChange=${props.onImportTextChange}
            onKeySearchChange=${props.onKeySearchChange}
            onToggleKeySelection=${props.onToggleKeySelection}
            onToggleVisibleSelection=${props.onToggleVisibleSelection}
            selectedProvider=${props.selectedProvider}
            translate=${props.translate}
            visibleKeys=${props.visibleKeys}
          />
        </div>
      </section>
    </${AdminShell}>
  `;
}
