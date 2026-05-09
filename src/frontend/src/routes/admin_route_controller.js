import { html } from "../shared/view_helpers.js";
import { adminState, normalizeBulkSeconds, setAdminState } from "../stores/admin_store.js";
import { buildAdminRouteState } from "./route_state.js";
import { createAdminActions } from "./admin_actions.js";
import { AdminPage } from "../views/admin_page.js";

export function useAdminRouteController(route, language, translate, refreshRoute) {
  const admin = adminState.value;
  const routeState = buildAdminRouteState(admin);
  const actions = createAdminActions(translate);

  return {
    page: html`
      <${AdminPage}
        adminState=${admin}
        disableBounds=${routeState.disableBounds}
        language=${language}
        normalizeBulkSeconds=${normalizeBulkSeconds}
        onApplyBulkAction=${actions.applyBulkAction}
        onBulkModeChange=${function handleBulkModeChange(nextMode) {
          setAdminState(function updateBulkMode(currentState) {
            return {
              ...currentState,
              bulkMode: nextMode
            };
          });
        }}
        onBulkSecondsChange=${function handleBulkSecondsChange(nextValue) {
          setAdminState(function updateBulkSeconds(currentState) {
            return {
              ...currentState,
              bulkSeconds: nextValue
            };
          });
        }}
        onClearCache=${actions.handleClearCache}
        onClearSelection=${function clearSelection() {
          setAdminState(function resetSelection(currentState) {
            return {
              ...currentState,
              selectedKeyRefs: []
            };
          });
        }}
        onCloseLogs=${function closeLogs() {
          setAdminState(function setLogModalClosed(currentState) {
            return {
              ...currentState,
              logModalOpen: false
            };
          });
        }}
        onCreateProvider=${actions.handleCreateProvider}
        onCreateProviderDraftChange=${actions.handleCreateProviderDraftChange}
        onDeleteProvider=${actions.handleDeleteProvider}
        onDeleteSingleKey=${actions.handleDeleteSingleKey}
        onGlobalDraftChange=${actions.handleGlobalDraftChange}
        onGlobalSave=${actions.handleGlobalSave}
        onHidePanelLogsChange=${function handleHidePanelLogsChange(checked) {
          setAdminState(function updateHidePanelLogs(currentState) {
            return {
              ...currentState,
              hidePanelLogs: checked
            };
          });
        }}
        onImportKeys=${actions.handleImportKeys}
        onImportTextChange=${function handleImportTextChange(nextValue) {
          setAdminState(function updateImportText(currentState) {
            return {
              ...currentState,
              importText: nextValue
            };
          });
        }}
        onKeySearchChange=${function handleKeySearchChange(nextValue) {
          setAdminState(function updateKeySearch(currentState) {
            return {
              ...currentState,
              keySearch: nextValue
            };
          });
        }}
        onLoginSubmit=${actions.handleLoginSubmit}
        onLogout=${actions.handleLogout}
        onOpenLogs=${function openLogs() {
          setAdminState(function setLogModalOpen(currentState) {
            return {
              ...currentState,
              logModalOpen: true
            };
          });
        }}
        onProviderSearchChange=${function handleProviderSearchChange(nextValue) {
          setAdminState(function updateProviderSearch(currentState) {
            return {
              ...currentState,
              providerSearch: nextValue
            };
          });
        }}
        onSaveSelectedProvider=${actions.handleSaveSelectedProvider}
        onSelectProvider=${actions.handleSelectProvider}
        onSelectedProviderDraftChange=${actions.handleSelectedProviderDraftChange}
        onToggleKeySelection=${function handleToggleKeySelection(keyRef, checked) {
          setAdminState(function updateKeySelection(currentState) {
            const nextSelectedKeyRefs = new Set(currentState.selectedKeyRefs);
            if (checked) {
              nextSelectedKeyRefs.add(keyRef);
            } else {
              nextSelectedKeyRefs.delete(keyRef);
            }
            return {
              ...currentState,
              selectedKeyRefs: Array.from(nextSelectedKeyRefs)
            };
          });
        }}
        onToggleVisibleSelection=${function toggleVisibleSelection() {
          const visibleRefs = routeState.visibleKeys.map(function mapKeyToRef(keySnapshot) {
            return String(keySnapshot.ref || "");
          });
          setAdminState(function updateVisibleSelection(currentState) {
            return {
              ...currentState,
              selectedKeyRefs: visibleRefs
            };
          });
        }}
        selectedProvider=${routeState.selectedProvider}
        selectedProviderStats=${routeState.selectedProviderStats}
        translate=${translate}
        visibleKeys=${routeState.visibleKeys}
        visibleProviders=${routeState.visibleProviders}
      />
    `,
    refresh() {
      refreshRoute(true);
    }
  };
}
