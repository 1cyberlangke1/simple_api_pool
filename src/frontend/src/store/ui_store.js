/* ---------- ui store ---------- */

function createUiStoreState() {
  return {
    globalConfigDraft: null,
    globalConfigDirty: false,
    globalAdminKeyDirty: false,
    globalClientKeysDirty: false,
    lastUiActivityAt: Date.now(),
    lang: detectInitialLang(),
    theme: detectInitialTheme(),
    themeManual: localStorage.getItem(THEME_KEY) !== null
  };
}
