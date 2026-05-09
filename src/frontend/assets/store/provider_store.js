/* ---------- provider store ---------- */

function createProviderStoreState() {
  return {
    providerPageIndex: 0,
    providerSearchQuery: "",
    providerSearchDebounceTimer: null,
    keySearchQuery: "",
    keySearchDebounceTimer: null,
    keyPageIndexByProvider: {},
    selectedKeysByProvider: {},
    createProviderDraft: null,
    createProviderDirty: false,
    providerDraftsByName: {},
    providerDraftDirtyByName: {},
    providerImportDraftsByName: {},
    providerImportDirtyByName: {},
    providerImportExpandedByName: {},
    bulkKeyActionModeByProvider: {},
    bulkDisableSecondsByProvider: {}
  };
}
