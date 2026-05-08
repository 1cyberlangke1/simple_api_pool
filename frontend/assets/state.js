/* ---------- state ---------- */

    let route = getRouteFromPath(location.pathname);
    let statusPollTimer = null;
    let activityMarkScheduled = false;

    function detectInitialLang() {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "zh-CN" || saved === "en") {
        return saved;
      }
      const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
      return nav.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
    }

    function detectInitialTheme() {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") {
        return saved;
      }
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    const state = {
      adminAuthenticated: false,
      providers: [],
      stats: {},
      recentLogs: [],
      hidePanelLogs: true,
      providerPageIndex: 0,
      providerSearchQuery: "",
      providerSearchDebounceTimer: null,
      keySearchQuery: "",
      keySearchDebounceTimer: null,
      keyPageIndexByProvider: {},
      selectedKeysByProvider: {},
      globalConfigDraft: null,
      globalConfigDirty: false,
      globalAdminKeyDirty: false,
      globalClientKeysDirty: false,
      createProviderDraft: null,
      createProviderDirty: false,
      providerDraftsByName: {},
      providerDraftDirtyByName: {},
      providerImportDraftsByName: {},
      providerImportDirtyByName: {},
      providerImportExpandedByName: {},
      overviewEtags: {
        status: "",
        admin: ""
      },
      lastUiActivityAt: Date.now(),
      lang: detectInitialLang(),
      theme: detectInitialTheme(),
      themeManual: localStorage.getItem(THEME_KEY) !== null
    };

    function markUiActivity() {
      state.lastUiActivityAt = Date.now();
    }

    function scheduleUiActivityMark() {
      if (activityMarkScheduled) {
        return;
      }
      activityMarkScheduled = true;
      requestAnimationFrame(() => {
        activityMarkScheduled = false;
        markUiActivity();
      });
    }

    function createDefaultCreateProviderDraft() {
      return {
        name: "",
        type: "openai_chat",
        base_url: "",
        key_strategy: "round_robin",
        fail_threshold: 3,
        min_disable_secs: 30,
        max_disable_secs: 43200,
        cache_enabled: false,
        cache_max_entries: 1000
      };
    }

    function createProviderDraftFromSnapshot(provider) {
      return {
        name: provider.name,
        type: provider.type,
        base_url: provider.base_url || "",
        key_strategy: provider.key_strategy || "round_robin",
        fail_threshold: Number(provider.fail_threshold || 3),
        min_disable_secs: Number(provider.min_disable_secs || 30),
        max_disable_secs: Number(provider.max_disable_secs || 43200),
        cache_enabled: Boolean(provider.cache_enabled),
        cache_max_entries: Number(provider.cache_max_entries || 1000)
      };
    }

    function syncGlobalConfigDraft(globalConfig, forceUpdate) {
      if (forceUpdate === undefined) {
        forceUpdate = false;
      }
      if (state.globalConfigDirty && !forceUpdate) {
        return;
      }
      const nextGlobalConfig = globalConfig || {};
      state.globalConfigDraft = {
        admin_key: "",
        token_estimation_enabled: Boolean(nextGlobalConfig.token_estimation_enabled),
        client_keys: "",
        admin_key_configured: Boolean(nextGlobalConfig.admin_key_configured),
        client_key_count: Number(nextGlobalConfig.client_key_count || 0)
      };
      state.globalConfigDirty = false;
      state.globalAdminKeyDirty = false;
      state.globalClientKeysDirty = false;
    }

    function syncCreateProviderDraft(forceUpdate) {
      if (forceUpdate === undefined) {
        forceUpdate = false;
      }
      if (state.createProviderDraft && !forceUpdate) {
        return;
      }
      state.createProviderDraft = createDefaultCreateProviderDraft();
      state.createProviderDirty = false;
    }

    function syncProviderDraft(provider, forceUpdate) {
      if (forceUpdate === undefined) {
        forceUpdate = false;
      }
      if (state.providerDraftDirtyByName[provider.name] && !forceUpdate) {
        return;
      }
      state.providerDraftsByName[provider.name] = createProviderDraftFromSnapshot(provider);
      state.providerDraftDirtyByName[provider.name] = false;
    }

    function syncProviderImportDraft(providerName, forceUpdate) {
      if (forceUpdate === undefined) {
        forceUpdate = false;
      }
      if (state.providerImportDirtyByName[providerName] && !forceUpdate) {
        return;
      }
      state.providerImportDraftsByName[providerName] = "";
      state.providerImportDirtyByName[providerName] = false;
    }

    function applyGlobalConfigDraftToForm() {
      if (!state.globalConfigDraft) {
        return;
      }
      refs.globalAdminKey.value = "";
      refs.globalTokenEstimation.checked = Boolean(state.globalConfigDraft.token_estimation_enabled);
      refs.globalClientKeys.value = "";
    }

    function applyCreateProviderDraftToForm() {
      if (!state.createProviderDraft) {
        return;
      }
      const draft = state.createProviderDraft;
      refs.createForm.querySelector('[name="name"]').value = draft.name || "";
      refs.createForm.querySelector('[name="type"]').value = draft.type || "openai_chat";
      refs.createForm.querySelector('[name="base_url"]').value = draft.base_url || "";
      refs.createForm.querySelector('[name="key_strategy"]').value = draft.key_strategy || "round_robin";
      refs.createForm.querySelector('[name="fail_threshold"]').value = Number(draft.fail_threshold || 3);
      refs.createForm.querySelector('[name="min_disable_secs"]').value = Number(draft.min_disable_secs || 30);
      refs.createForm.querySelector('[name="max_disable_secs"]').value = Number(draft.max_disable_secs || 43200);
      refs.createForm.querySelector('[name="cache_enabled"]').checked = Boolean(draft.cache_enabled);
      refs.createForm.querySelector('[name="cache_max_entries"]').value = Number(draft.cache_max_entries || 1000);
    }

    function rememberWorkspaceFocus() {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLInputElement) &&
        !(activeElement instanceof HTMLTextAreaElement) &&
        !(activeElement instanceof HTMLSelectElement)) {
        return null;
      }
      if (!refs.adminWorkspace.contains(activeElement)) {
        return null;
      }
      if (!activeElement.name) {
        return null;
      }
      return {
        formRole: activeElement.form && activeElement.form.classList.contains("provider-edit-form")
          ? "provider-edit-form"
          : (activeElement.form && activeElement.form.classList.contains("provider-keys-form") ? "provider-keys-form" : ""),
        providerName: activeElement.form && activeElement.form.dataset ? activeElement.form.dataset.provider || "" : "",
        fieldName: activeElement.name,
        selectionStart: typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null,
        selectionEnd: typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null
      };
    }

    function restoreWorkspaceFocus(focusSnapshot) {
      if (!focusSnapshot) {
        return;
      }
      let selector = "";
      if (focusSnapshot.formRole === "provider-edit-form") {
        selector = '.provider-edit-form[data-provider="' + CSS.escape(focusSnapshot.providerName) + '"] [name="' + CSS.escape(focusSnapshot.fieldName) + '"]';
      } else if (focusSnapshot.formRole === "provider-keys-form") {
        selector = '.provider-keys-form[data-provider="' + CSS.escape(focusSnapshot.providerName) + '"] [name="' + CSS.escape(focusSnapshot.fieldName) + '"]';
      }
      if (!selector) {
        return;
      }
      const targetField = refs.providerList.querySelector(selector);
      if (!(targetField instanceof HTMLInputElement) &&
        !(targetField instanceof HTMLTextAreaElement) &&
        !(targetField instanceof HTMLSelectElement)) {
        return;
      }
      targetField.focus({ preventScroll: true });
      if (focusSnapshot.selectionStart !== null && typeof targetField.setSelectionRange === "function") {
        const selectionEnd = focusSnapshot.selectionEnd !== null ? focusSnapshot.selectionEnd : focusSnapshot.selectionStart;
        targetField.setSelectionRange(focusSnapshot.selectionStart, selectionEnd);
      }
    }

    function renderAdminWorkspaceProviders() {
      const focusSnapshot = rememberWorkspaceFocus();
      const visibleProviders = ensureProviderSelectionMatchesFilter();
      renderProviderSelector(visibleProviders);
      renderProviders(state.providers || []);
      restoreWorkspaceFocus(focusSnapshot);
    }

    function normalizeProviderWorkspaceState() {
      const providers = Array.isArray(state.providers) ? state.providers : [];
      if (!providers.length) {
        state.providerPageIndex = 0;
        state.providerSearchQuery = "";
        state.keySearchQuery = "";
        state.keyPageIndexByProvider = {};
        state.selectedKeysByProvider = {};
        return;
      }

      if (state.providerPageIndex < 0) {
        state.providerPageIndex = 0;
      }
      if (state.providerPageIndex >= providers.length) {
        state.providerPageIndex = providers.length - 1;
      }

      const providerNames = new Set(providers.map((provider) => provider.name));
      Object.keys(state.keyPageIndexByProvider).forEach((providerName) => {
        if (!providerNames.has(providerName)) {
          delete state.keyPageIndexByProvider[providerName];
        }
      });
      Object.keys(state.selectedKeysByProvider).forEach((providerName) => {
        if (!providerNames.has(providerName)) {
          delete state.selectedKeysByProvider[providerName];
        }
      });
      Object.keys(state.providerDraftsByName).forEach((providerName) => {
        if (!providerNames.has(providerName)) {
          delete state.providerDraftsByName[providerName];
          delete state.providerDraftDirtyByName[providerName];
          delete state.providerImportDraftsByName[providerName];
          delete state.providerImportDirtyByName[providerName];
          delete state.providerImportExpandedByName[providerName];
        }
      });

      for (const provider of providers) {
        if (!(provider.name in state.keyPageIndexByProvider)) {
          state.keyPageIndexByProvider[provider.name] = 0;
        }
        if (!(provider.name in state.selectedKeysByProvider)) {
          state.selectedKeysByProvider[provider.name] = [];
        }
        if (!(provider.name in state.providerImportDraftsByName)) {
          state.providerImportDraftsByName[provider.name] = "";
          state.providerImportDirtyByName[provider.name] = false;
        }
        if (!(provider.name in state.providerImportExpandedByName)) {
          state.providerImportExpandedByName[provider.name] = false;
        }
      }
    }

    function getCurrentProvider() {
      normalizeProviderWorkspaceState();
      if (!state.providers.length) {
        return null;
      }
      return state.providers[state.providerPageIndex] || null;
    }

    function setProviderPage(nextPageIndex) {
      if (!state.providers.length) {
        state.providerPageIndex = 0;
        return;
      }
      state.providerPageIndex = Math.max(0, Math.min(nextPageIndex, state.providers.length - 1));
      const provider = getCurrentProvider();
      if (provider) {
        syncKeySearchInput();
        state.keyPageIndexByProvider[provider.name] = state.keyPageIndexByProvider[provider.name] || 0;
      }
      renderAdminWorkspaceProviders();
    }

    function setProviderByName(providerName, shouldRender) {
      const nextIndex = (state.providers || []).findIndex((provider) => provider.name === providerName);
      if (nextIndex === -1) {
        return;
      }
      state.providerPageIndex = nextIndex;
      state.keySearchQuery = "";
      if (shouldRender === false) {
        return;
      }
      renderAdminWorkspaceProviders();
    }

    function filterProviders(searchQuery) {
      const providers = Array.isArray(state.providers) ? state.providers : [];
      const normalizedQuery = String(searchQuery || "").trim().toLowerCase();
      if (!normalizedQuery) {
        return providers;
      }
      const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);
      return providers.filter((provider) => {
        const providerName = String(provider.name || "").toLowerCase();
        const providerType = String(provider.type || "").toLowerCase();
        return queryParts.every((queryPart) => providerName.includes(queryPart) || providerType.includes(queryPart));
      });
    }

    function ensureProviderSelectionMatchesFilter() {
      const filteredProviders = filterProviders(state.providerSearchQuery);
      if (!filteredProviders.length) {
        return filteredProviders;
      }
      const currentProvider = getCurrentProvider();
      if (currentProvider && filteredProviders.some((provider) => provider.name === currentProvider.name)) {
        return filteredProviders;
      }
      setProviderByName(filteredProviders[0].name, false);
      return filteredProviders;
    }

    function getKeySearchInputElement() {
      return document.getElementById("key-search");
    }

    function getProviderSearchInputElement() {
      return refs.providerSelectorSearch;
    }

    function syncKeySearchInput() {
      const keySearchInput = getKeySearchInputElement();
      if (!keySearchInput) {
        return;
      }
      keySearchInput.value = state.keySearchQuery;
    }

    function syncProviderSearchInput() {
      const providerSearchInput = getProviderSearchInputElement();
      if (!providerSearchInput) {
        return;
      }
      providerSearchInput.value = state.providerSearchQuery;
    }

    function getSelectedKeys(providerName) {
      const selectedKeys = state.selectedKeysByProvider[providerName];
      return Array.isArray(selectedKeys) ? selectedKeys : [];
    }

    function setSelectedKeys(providerName, keys) {
      state.selectedKeysByProvider[providerName] = Array.from(new Set((keys || []).filter(Boolean)));
    }

    function filterProviderKeys(provider, searchQuery) {
      const keys = provider && Array.isArray(provider.keys) ? provider.keys : [];
      const normalizedQuery = String(searchQuery || "").trim().toLowerCase();
      if (!normalizedQuery) {
        return keys;
      }

      const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);
      return keys.filter((key) => {
        const keyValue = String(key && key.value ? key.value : "").toLowerCase();
        return queryParts.every((queryPart) => keyValue.includes(queryPart));
      });
    }

    function paginateProviderKeys(keys, providerName) {
      const totalPages = Math.max(1, Math.ceil(keys.length / KEY_PAGE_SIZE));
      const currentPageIndex = Math.max(0, Math.min(state.keyPageIndexByProvider[providerName] || 0, totalPages - 1));
      state.keyPageIndexByProvider[providerName] = currentPageIndex;
      const startIndex = currentPageIndex * KEY_PAGE_SIZE;
      return {
        pageKeys: keys.slice(startIndex, startIndex + KEY_PAGE_SIZE),
        currentPageIndex: currentPageIndex,
        totalPages: totalPages
      };
    }

    function updateProviderKeysInState(providerName, nextKeys) {
      state.providers = (state.providers || []).map((provider) => {
        if (provider.name !== providerName) {
          return provider;
        }
        return { ...provider, keys: Array.isArray(nextKeys) ? nextKeys : [] };
      });

      const currentSelected = new Set(getSelectedKeys(providerName));
      const nextKeyValues = new Set((nextKeys || []).map((key) => String(key.ref || key.value)));
      setSelectedKeys(providerName, Array.from(currentSelected).filter((keyValue) => nextKeyValues.has(keyValue)));
      syncProviderKeyStats(providerName);
      normalizeProviderWorkspaceState();
    }

    function syncProviderKeyStats(providerName) {
      const provider = (state.providers || []).find((item) => item.name === providerName);
      if (!provider) {
        delete state.stats[providerName];
        return;
      }

      const summary = summarizeProviderKeys(provider.keys || []);
      const currentStats = state.stats[providerName] || {};
      state.stats[providerName] = {
        success_count: currentStats.success_count || 0,
        error_count: currentStats.error_count || 0,
        input_tokens: currentStats.input_tokens || 0,
        output_tokens: currentStats.output_tokens || 0,
        cache_tokens: currentStats.cache_tokens || 0,
        cache_hits: currentStats.cache_hits || 0,
        error_types: currentStats.error_types || {},
        available_keys: summary.available,
        total_keys: (provider.keys || []).length
      };
    }

    function setKeyPage(providerName, nextPageIndex) {
      state.keyPageIndexByProvider[providerName] = Math.max(0, nextPageIndex);
      renderAdminWorkspaceProviders();
    }
