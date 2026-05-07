/* ---------- core ---------- */

    const refs = {
      heroTitle: document.getElementById("hero-title"),
      heroCopy: document.getElementById("hero-copy"),
      buildVersionValue: document.getElementById("build-version-value"),
      navStatus: document.getElementById("nav-status"),
      navAdmin: document.getElementById("nav-admin"),
      statusView: document.getElementById("status-view"),
      adminView: document.getElementById("admin-view"),
      serviceHealth: document.getElementById("service-health"),
      serviceHealthNote: document.getElementById("service-health-note"),
      providerCount: document.getElementById("provider-count"),
      successTotal: document.getElementById("success-total"),
      errorTotal: document.getElementById("error-total"),
      statusBadge: document.getElementById("status-badge"),
      statusList: document.getElementById("status-list"),
      loginForm: document.getElementById("login-form"),
      loginKey: document.getElementById("login-admin-key"),
      loginStatus: document.getElementById("login-status"),
      adminActionStatus: document.getElementById("admin-action-status"),
      logoutButton: document.getElementById("logout-button"),
      adminWorkspace: document.getElementById("admin-workspace"),
      globalForm: document.getElementById("global-config-form"),
      globalAdminKey: document.getElementById("global-admin-key"),
      globalTokenEstimation: document.getElementById("global-token-estimation"),
      globalClientKeys: document.getElementById("global-client-keys"),
      globalStatus: document.getElementById("global-status"),
      createForm: document.getElementById("provider-create-form"),
      createStatus: document.getElementById("provider-create-status"),
      providerListPanelBody: document.getElementById("provider-list-panel-body"),
      providerList: document.getElementById("provider-list"),
      providerPagePrev: document.getElementById("provider-page-prev"),
      providerPageNext: document.getElementById("provider-page-next"),
      providerPageIndicator: document.getElementById("provider-page-indicator"),
      keySearchInput: document.getElementById("key-search"),
      recentLogList: document.getElementById("recent-log-list"),
      logModal: document.getElementById("log-modal"),
      openLogModalButton: document.getElementById("open-log-modal"),
      closeLogModalButton: document.getElementById("close-log-modal"),
      hidePanelLogsToggle: document.getElementById("hide-panel-logs"),
      themeToggle: document.getElementById("theme-toggle"),
      langToggle: document.getElementById("lang-toggle")
    };

    function setRouteView() {
      const onStatus = route !== "admin";
      refs.statusView.classList.toggle("hidden", !onStatus);
      refs.adminView.classList.toggle("hidden", onStatus);
      refs.navStatus.classList.toggle("active", onStatus);
      refs.navAdmin.classList.toggle("active", !onStatus);
      refs.heroTitle.textContent = t(onStatus ? "hero.statusTitle" : "hero.adminTitle");
      refs.heroCopy.textContent = t(onStatus ? "hero.statusCopy" : "hero.adminCopy");
    }

    function goTo(path) {
      window.location.href = path;
    }

    function replaceEvery(source, search, replacement) {
      return String(source).split(search).join(replacement);
    }

    function escapeHTML(value) {
      return String(value)
        .split("&").join("&amp;")
        .split("<").join("&lt;")
        .split(">").join("&gt;")
        .split('"').join("&quot;")
        .split("'").join("&#39;");
    }

    function normalizeBuildToken(value, fallback) {
      if (!value || value.startsWith("__APP_")) {
        return fallback;
      }
      return value;
    }

    function createBuildVersionText() {
      const version = normalizeBuildToken(RAW_APP_VERSION, "dev");
      const revision = normalizeBuildToken(RAW_APP_REVISION, "local");
      const buildTime = normalizeBuildToken(RAW_APP_BUILD_TIME, "unknown");
      return `${version} / ${revision} / ${buildTime}`;
    }

    function renderBuildVersion() {
      refs.buildVersionValue.textContent = createBuildVersionText();
    }

    function setMessage(element, text, kind = "") {
      element.textContent = text || "";
      element.className = "inline-status";
      if (kind) {
        element.classList.add(kind);
      }
    }

    function setAdminAuthenticated(authenticated) {
      state.adminAuthenticated = Boolean(authenticated);
    }

    function formatTimestamp(value) {
      if (!value) {
        return t("provider.notDisabled");
      }
      const date = new Date(Number(value) * 1000);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
      const locale = state.lang === "en" ? "en-US" : "zh-CN";
      return date.toLocaleString(locale, { hour12: false });
    }

    function summarizeProviderKeys(keys) {
      const now = Date.now();
      let available = 0;
      let disabled = 0;
      for (const key of keys) {
        const disabledUntilMs = Number(key.disabled_until || 0) * 1000;
        if (disabledUntilMs > now) {
          disabled += 1;
          continue;
        }
        available += 1;
      }
      return { available, disabled };
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

    function syncGlobalConfigDraft(globalConfig, forceUpdate = false) {
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

    function syncCreateProviderDraft(forceUpdate = false) {
      if (state.createProviderDraft && !forceUpdate) {
        return;
      }
      state.createProviderDraft = createDefaultCreateProviderDraft();
      state.createProviderDirty = false;
    }

    function syncProviderDraft(provider, forceUpdate = false) {
      if (state.providerDraftDirtyByName[provider.name] && !forceUpdate) {
        return;
      }
      state.providerDraftsByName[provider.name] = createProviderDraftFromSnapshot(provider);
      state.providerDraftDirtyByName[provider.name] = false;
    }

    function syncProviderImportDraft(providerName, forceUpdate = false) {
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
        formClassName: activeElement.form ? activeElement.form.className || "" : "",
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
      if (focusSnapshot.formClassName.includes("provider-edit-form")) {
        selector = `.provider-edit-form[data-provider="${CSS.escape(focusSnapshot.providerName)}"] [name="${CSS.escape(focusSnapshot.fieldName)}"]`;
      } else if (focusSnapshot.formClassName.includes("provider-keys-form")) {
        selector = `.provider-keys-form[data-provider="${CSS.escape(focusSnapshot.providerName)}"] [name="${CSS.escape(focusSnapshot.fieldName)}"]`;
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
      renderProviders(state.providers || []);
      restoreWorkspaceFocus(focusSnapshot);
    }

    function normalizeProviderWorkspaceState() {
      const providers = Array.isArray(state.providers) ? state.providers : [];
      if (!providers.length) {
        state.providerPageIndex = 0;
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

    function syncKeySearchInput() {
      if (!refs.keySearchInput) {
        return;
      }
      refs.keySearchInput.value = state.keySearchQuery;
    }

    function renderProviderPager(providers) {
      const totalProviders = providers.length;
      const currentProvider = getCurrentProvider();
      const currentNumber = totalProviders ? state.providerPageIndex + 1 : 0;

      refs.providerPagePrev.disabled = currentNumber <= 1;
      refs.providerPageNext.disabled = !totalProviders || currentNumber >= totalProviders;
      refs.keySearchInput.disabled = totalProviders === 0;
      refs.providerPageIndicator.textContent = totalProviders
        ? `${currentNumber} / ${totalProviders} · ${currentProvider.name}`
        : "-";
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
        currentPageIndex,
        totalPages
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
        ...currentStats,
        available_keys: summary.available,
        total_keys: (provider.keys || []).length
      };
    }

    function setKeyPage(providerName, nextPageIndex) {
      state.keyPageIndexByProvider[providerName] = Math.max(0, nextPageIndex);
      renderAdminWorkspaceProviders();
    }

    async function parseErrorMessage(response, fallback) {
      try {
        const data = await response.json();
        return data.error || fallback;
      } catch {
        return fallback;
      }
    }

    async function request(path, options = {}, requireAdmin = false) {
      const headers = new Headers(options.headers || {});
      if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
        headers.set("Content-Type", "application/json");
      }
      return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "same-origin" });
    }

    async function requestOverview(path, overviewScope, requireAdmin = false) {
      const headers = new Headers();
      const previousTag = state.overviewEtags[overviewScope] || "";
      if (previousTag) {
        headers.set("If-None-Match", previousTag);
      }

      const response = await request(path, { headers }, requireAdmin);
      const currentTag = response.headers.get("ETag");
      if (currentTag) {
        state.overviewEtags[overviewScope] = currentTag;
      }
      return response;
    }

    function applyHealthSnapshot(health) {
      const statusText = health && health.status ? health.status : "ok";
      const healthy = statusText === "ok";
      refs.serviceHealth.textContent = healthy ? t("metric.healthOnline") : t("metric.healthError");
      refs.serviceHealthNote.textContent = t("metric.healthNote", { status: statusText });
      refs.statusBadge.textContent = healthy ? t("status.updated") : t("status.failed");
      refs.statusBadge.className = healthy ? "status-badge ok" : "status-badge err";
    }

    function renderStatusCards(statsMap) {
      const entries = Object.entries(statsMap || {});
      state.stats = statsMap || {};
      refs.providerCount.textContent = String(entries.length);

      const totalSuccess = entries.reduce((sum, [, item]) => sum + (item.success_count || 0), 0);
      const totalError = entries.reduce((sum, [, item]) => sum + (item.error_count || 0), 0);
      refs.successTotal.textContent = String(totalSuccess);
      refs.errorTotal.textContent = String(totalError);

      if (!entries.length) {
        refs.statusList.innerHTML = `<div class="empty">${escapeHTML(t("status.empty"))}</div>`;
        return;
      }

      refs.statusList.innerHTML = entries.map(([name, item]) => {
        const success = item.success_count || 0;
        const error = item.error_count || 0;
        const total = success + error;
        const successRate = total ? `${((success / total) * 100).toFixed(1)}%` : t("provider.rateNone");
        const errorRate = total ? `${((error / total) * 100).toFixed(1)}%` : t("provider.rateNone");
        const availableKeys = item.available_keys || 0;
        const totalKeys = item.total_keys || 0;
        const errorTypes = Object.entries(item.error_types || {}).filter(([, count]) => Number(count) > 0);
        const errorTypeMarkup = errorTypes.length
          ? `
            <div class="error-type-row">
              <span class="tag muted">${escapeHTML(t("provider.errorTypeTitle"))}</span>
              ${errorTypes.map(([code, count]) => `<span class="tag err">${escapeHTML(`${code} × ${count}`)}</span>`).join("")}
            </div>
          `
          : "";

        return `
          <article class="provider-card">
            <div class="provider-head">
              <div>
                <h3 class="provider-name">${escapeHTML(name)}</h3>
                <div class="tag-row">
                  <span class="tag ok">${escapeHTML(t("provider.tagSuccessRate", { n: successRate }))}</span>
                  <span class="tag err">${escapeHTML(t("provider.tagErrorRate", { n: errorRate }))}</span>
                  <span class="tag muted">${escapeHTML(t("provider.tagCacheHits", { n: item.cache_hits || 0 }))}</span>
                  <span class="tag">${escapeHTML(t("provider.tagAvailableKeys", { available: availableKeys, total: totalKeys }))}</span>
                </div>
              </div>
            </div>
            <div class="stats-grid">
              <div class="mini"><strong>${success}</strong><span>${escapeHTML(t("provider.statSuccess"))}</span></div>
              <div class="mini"><strong>${error}</strong><span>${escapeHTML(t("provider.statError"))}</span></div>
              <div class="mini"><strong>${item.input_tokens || 0}</strong><span>${escapeHTML(t("provider.statInputTokens"))}</span></div>
              <div class="mini"><strong>${item.output_tokens || 0}</strong><span>${escapeHTML(t("provider.statOutputTokens"))}</span></div>
              <div class="mini"><strong>${item.cache_tokens || 0}</strong><span>${escapeHTML(t("provider.statCacheTokens"))}</span></div>
              <div class="mini"><strong>${item.cache_hits || 0}</strong><span>${escapeHTML(t("provider.statCacheHits"))}</span></div>
            </div>
            ${errorTypeMarkup}
          </article>
        `;
      }).join("");
    }

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

      return entries.map(([key, value]) => {
        const formattedValue = typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);
        return `${key}=${formattedValue}`;
      }).join(" · ");
    }

    function classifyLogLevel(level) {
      const normalizedLevel = String(level || "").toLowerCase();
      if (normalizedLevel.includes("error")) {
        return "level-error";
      }
      if (normalizedLevel.includes("warn")) {
        return "level-warn";
      }
      if (normalizedLevel.includes("debug")) {
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
    }

    function renderRecentLogs(logEntries) {
      state.recentLogs = Array.isArray(logEntries) ? logEntries : [];
      const visibleLogs = state.hidePanelLogs
        ? state.recentLogs.filter((entry) => !isPanelRequestLog(entry))
        : state.recentLogs;

      if (!visibleLogs.length) {
        refs.recentLogList.innerHTML = `<div class="empty">${escapeHTML(t("admin.logEmpty"))}</div>`;
        return;
      }

      refs.recentLogList.innerHTML = visibleLogs.slice().reverse().map((entry) => {
        const levelClass = classifyLogLevel(entry.level);
        const summary = formatLogSummary(entry.attrs);
        return `
          <article class="terminal-log-entry ${levelClass}">
            <div class="terminal-log-head">
              <div class="terminal-log-level">${escapeHTML(entry.level || "INFO")}</div>
              <div class="terminal-log-time">${escapeHTML(formatLogTimestamp(entry.time))}</div>
            </div>
            <div class="terminal-log-title">${escapeHTML(entry.msg || "")}</div>
            <div class="terminal-log-summary">${escapeHTML(summary || "")}</div>
          </article>
        `;
      }).join("");
    }

    async function loadStatusOverview() {
      try {
        const response = await requestOverview("/status/overview", "status");
        if (response.status === 304) {
          return;
        }
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response, t("error.readStatus")));
        }
        const data = await response.json();
        applyHealthSnapshot(data.health);
        renderStatusCards(data.provider_stats || {});
      } catch (error) {
        refs.serviceHealth.textContent = t("metric.healthError");
        refs.serviceHealthNote.textContent = error.message || t("metric.healthUnavailable");
        refs.statusList.innerHTML = `<div class="empty">${escapeHTML(error.message || t("error.readStatus"))}</div>`;
        refs.statusBadge.textContent = t("status.failed");
        refs.statusBadge.className = "status-badge err";
      }
    }

    function startOverviewPolling() {
      if (statusPollTimer !== null) {
        clearInterval(statusPollTimer);
      }
      statusPollTimer = setInterval(() => {
        if (document.visibilityState === "hidden") {
          return;
        }
        if (route === "admin") {
          void loadAdminOverview();
          return;
        }
        void loadStatusOverview();
      }, STATUS_POLL_INTERVAL_MS);
    }

    async function loginAdmin(adminKey) {
      const response = await request("/admin/login", {
        method: "POST",
        body: JSON.stringify({ admin_key: adminKey })
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.login")));
      }
      setAdminAuthenticated(true);
      state.overviewEtags.admin = "";
      refs.loginKey.value = "";
      refs.logoutButton.classList.remove("hidden");
      setMessage(refs.loginStatus, t("admin.loginSuccess"), "ok");
    }

    async function loadAdminOverview() {
      const response = await requestOverview("/admin/overview", "admin", true);

      if (response.status === 401) {
        setAdminAuthenticated(false);
        state.overviewEtags.admin = "";
        setLogModalOpen(false);
        refs.adminWorkspace.classList.add("hidden");
        refs.logoutButton.classList.add("hidden");
        state.providers = [];
        state.stats = {};
        normalizeProviderWorkspaceState();
        refs.providerList.innerHTML = `<div class="empty">${escapeHTML(t("admin.pleaseLogin"))}</div>`;
        renderProviderPager([]);
        renderRecentLogs([]);
        if (route === "admin") {
          setMessage(refs.loginStatus, t("admin.pleaseLogin"), "");
        }
        return;
      }

      if (response.status === 304) {
        refs.adminWorkspace.classList.remove("hidden");
        return;
      }

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.readProviders")));
      }

      const overview = await response.json();
      setAdminAuthenticated(true);
      refs.logoutButton.classList.remove("hidden");
      state.providers = overview.providers || [];
      state.stats = overview.provider_stats || {};
      normalizeProviderWorkspaceState();
      syncGlobalConfigDraft(overview.global_config || {});
      syncCreateProviderDraft();
      for (const provider of state.providers) {
        syncProviderDraft(provider);
        syncProviderImportDraft(provider.name);
      }

      applyHealthSnapshot(overview.health);
      renderStatusCards(state.stats);
      applyGlobalConfigDraftToForm();
      applyCreateProviderDraftToForm();
      refs.adminWorkspace.classList.remove("hidden");
      setMessage(refs.adminActionStatus, "", "");
      renderAdminWorkspaceProviders();
      renderRecentLogs(overview.recent_logs || []);
    }

    function providerTypeOptions(selected) {
      const options = [
        ["openai_chat", "OpenAI Chat"],
        ["openai_responses", "OpenAI Responses"],
        ["claude", "Claude"],
        ["gemini", "Gemini"]
      ];
      return options.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
    }

    function providerStrategyOptions(selected) {
      const options = [
        ["round_robin", t("strategy.roundRobin")],
        ["fill", t("strategy.fill")]
      ];
      return options.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
    }

    function renderProviderKeysSection(provider) {
      const filteredKeys = filterProviderKeys(provider, state.keySearchQuery);
      const { pageKeys, currentPageIndex, totalPages } = paginateProviderKeys(filteredKeys, provider.name);
      const selectedKeys = new Set(getSelectedKeys(provider.name));
      const selectionSummary = t("admin.keySelectionSummary", {
        selected: selectedKeys.size,
        page: pageKeys.length,
        total: filteredKeys.length
      });

      const keyListMarkup = pageKeys.length
        ? `<div class="key-list">${pageKeys.map((key) => {
            const isDisabled = Number(key.disabled_until || 0) * 1000 > Date.now();
            const stateText = isDisabled
              ? t("provider.disabledUntil", { time: formatTimestamp(key.disabled_until) })
              : t("provider.usable");
            const keyRef = String(key.ref || key.value || "");
            const checked = selectedKeys.has(keyRef) ? "checked" : "";
            return `
              <div class="key-item">
                <label class="checkbox">
                  <input type="checkbox" data-role="key-selector" data-provider="${escapeHTML(provider.name)}" data-key="${escapeHTML(keyRef)}" ${checked}>
                </label>
                <div>
                  <code>${escapeHTML(key.value)}</code>
                  <div class="provider-meta">${escapeHTML(t("provider.fails", { n: key.consecutive_fails || 0 }))} · ${escapeHTML(stateText)}</div>
                </div>
                <button class="secondary" type="button" data-action="delete-key" data-provider="${escapeHTML(provider.name)}" data-key="${escapeHTML(keyRef)}">${escapeHTML(t("provider.delete"))}</button>
              </div>
            `;
          }).join("")}</div>`
        : `<div class="empty">${escapeHTML(t("provider.noKeys"))}</div>`;

      return `
        <div class="key-list-summary">
          <span>${escapeHTML(selectionSummary)}</span>
          <span>${escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages }))}</span>
        </div>
        ${keyListMarkup}
        <div class="key-pager">
          <button class="secondary" type="button" data-action="prev-key-page" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("admin.keyPagePrev"))}</button>
          <span class="key-pager-indicator">${escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages }))}</span>
          <button class="secondary" type="button" data-action="next-key-page" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("admin.keyPageNext"))}</button>
        </div>
      `;
    }

    function renderProviders(providers) {
      normalizeProviderWorkspaceState();
      renderProviderPager(providers);
      syncKeySearchInput();

      if (!providers.length) {
        refs.providerList.innerHTML = `<div class="empty">${escapeHTML(t("provider.empty"))}</div>`;
        return;
      }

      const provider = getCurrentProvider();
      const stats = state.stats[provider.name] || {};
      const keys = provider.keys || [];
      const keySummary = summarizeProviderKeys(keys);
      syncProviderDraft(provider);
      syncProviderImportDraft(provider.name);
      const draftProvider = state.providerDraftsByName[provider.name] || createProviderDraftFromSnapshot(provider);
      const importDraftValue = state.providerImportDraftsByName[provider.name] || "";

      refs.providerList.innerHTML = `
        <article class="provider-card provider-single-panel">
          <div class="provider-head">
            <div>
              <h3 class="provider-name">${escapeHTML(provider.name)}</h3>
              <div class="provider-meta">${escapeHTML(provider.type)} · ${escapeHTML(provider.base_url || t("provider.defaultUpstream"))}</div>
              <div class="tag-row">
                <span class="tag ok">${escapeHTML(t("provider.tagSuccess", { n: stats.success_count || 0 }))}</span>
                <span class="tag err">${escapeHTML(t("provider.tagError", { n: stats.error_count || 0 }))}</span>
                <span class="tag muted">${escapeHTML(t("provider.tagCacheHits", { n: stats.cache_hits || 0 }))}</span>
                <span class="tag">${escapeHTML(t("provider.tagKeys", { n: keys.length }))}</span>
                <span class="tag ok">${escapeHTML(t("provider.tagAvailable", { n: keySummary.available }))}</span>
                <span class="tag err">${escapeHTML(t("provider.tagDisabled", { n: keySummary.disabled }))}</span>
                <span class="tag ${provider.cache_enabled ? "ok" : "muted"}">${escapeHTML(t(provider.cache_enabled ? "provider.tagCacheOn" : "provider.tagCacheOff"))}</span>
              </div>
            </div>
            <button class="secondary" type="button" data-action="delete-provider" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("provider.delete"))}</button>
          </div>

          <div class="stats-grid">
            <div class="mini"><strong>${stats.success_count || 0}</strong><span>${escapeHTML(t("provider.statSuccess"))}</span></div>
            <div class="mini"><strong>${stats.error_count || 0}</strong><span>${escapeHTML(t("provider.statError"))}</span></div>
            <div class="mini"><strong>${stats.input_tokens || 0}</strong><span>${escapeHTML(t("provider.statInputTokens"))}</span></div>
            <div class="mini"><strong>${stats.output_tokens || 0}</strong><span>${escapeHTML(t("provider.statOutputTokens"))}</span></div>
            <div class="mini"><strong>${stats.cache_tokens || 0}</strong><span>${escapeHTML(t("provider.statCacheTokens"))}</span></div>
            <div class="mini"><strong>${stats.cache_hits || 0}</strong><span>${escapeHTML(t("provider.statCacheHits"))}</span></div>
          </div>

          <hr class="divider">

          <div class="provider-body-grid">
            <div class="provider-config-column">
              <div class="provider-column-panel">
                <div class="provider-column-title">Provider Config</div>
                <form class="provider-edit-form" data-provider="${escapeHTML(provider.name)}">
                  <div class="provider-form-section">
                    <h4 class="provider-form-section-title">基础连接</h4>
                    <div class="form-grid">
                      <label>
                        ${escapeHTML(t("provider.name"))}
                        <input name="name" type="text" value="${escapeHTML(provider.name)}" readonly>
                      </label>
                      <label>
                        ${escapeHTML(t("provider.type"))}
                        <select name="type">${providerTypeOptions(draftProvider.type)}</select>
                      </label>
                    </div>
                    <div class="form-grid">
                      <label>
                        ${escapeHTML(t("provider.baseUrl"))}
                        <input name="base_url" type="text" value="${escapeHTML(draftProvider.base_url || "")}">
                      </label>
                      <label>
                        ${escapeHTML(t("provider.strategy"))}
                        <select name="key_strategy">${providerStrategyOptions(draftProvider.key_strategy)}</select>
                      </label>
                    </div>
                  </div>

                  <div class="provider-form-section">
                    <h4 class="provider-form-section-title">禁用策略</h4>
                    <p class="provider-form-section-note">控制失败阈值、禁用窗口和恢复上限。</p>
                    <div class="form-grid provider-compact-fields">
                      <label>
                        ${escapeHTML(t("provider.failThreshold"))}
                        <input name="fail_threshold" type="number" min="1" value="${Number(draftProvider.fail_threshold || 3)}">
                      </label>
                      <label>
                        ${escapeHTML(t("provider.minDisable"))}
                        <input name="min_disable_secs" type="number" min="1" value="${Number(draftProvider.min_disable_secs || 30)}">
                      </label>
                      <label>
                        ${escapeHTML(t("provider.maxDisable"))}
                        <input name="max_disable_secs" type="number" min="1" value="${draftProvider.max_disable_secs !== undefined ? draftProvider.max_disable_secs : Number(provider.max_disable_secs || 43200)}">
                      </label>
                    </div>
                  </div>

                  <div class="provider-form-section">
                    <h4 class="provider-form-section-title">缓存设置</h4>
                    <div class="form-grid provider-threshold-fields">
                      <label class="checkbox">
                        <input name="cache_enabled" type="checkbox" ${draftProvider.cache_enabled ? "checked" : ""}>
                        <span>${escapeHTML(t("provider.cacheEnabled"))}</span>
                      </label>
                      <label>
                        ${escapeHTML(t("provider.cacheMax"))}
                        <input name="cache_max_entries" type="number" min="1" value="${Number(draftProvider.cache_max_entries || 1000)}">
                      </label>
                    </div>
                  </div>

                  <div class="actions">
                    <button class="primary" type="submit">${escapeHTML(t("provider.save"))}</button>
                    <button class="secondary" type="button" data-action="clear-cache" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("provider.clearCache"))}</button>
                  </div>
                  <div class="inline-status" data-role="provider-status"></div>
                </form>
              </div>
            </div>

            <div class="provider-key-column">
              <div class="provider-column-panel">
                <div class="provider-column-title">${escapeHTML(t("provider.upstreamKeys"))}</div>
                <form class="provider-keys-form" data-provider="${escapeHTML(provider.name)}">
                  <label>
                    ${escapeHTML(t("provider.batchImport"))}
                    <textarea name="keys" placeholder="${escapeHTML(t("admin.keysPlaceholder"))}">${escapeHTML(importDraftValue)}</textarea>
                  </label>
                  <div class="actions">
                    <button class="primary" type="submit">${escapeHTML(t("provider.import"))}</button>
                  </div>
                  <div class="inline-status" data-role="keys-status"></div>
                </form>
              </div>
              <div class="provider-column-panel">
                ${renderProviderKeysSection(provider)}
              </div>
            </div>
          </div>
        </article>
      `;
    }

    function readProviderPayload(form) {
      const formData = new FormData(form);
      return {
        name: String(formData.get("name") || "").trim(),
        type: String(formData.get("type") || "").trim(),
        base_url: String(formData.get("base_url") || "").trim(),
        key_strategy: String(formData.get("key_strategy") || "").trim(),
        fail_threshold: Number(formData.get("fail_threshold") || 3),
        min_disable_secs: Number(formData.get("min_disable_secs") || 30),
        max_disable_secs: Number(formData.get("max_disable_secs") || 43200),
        cache_enabled: form.querySelector('[name="cache_enabled"]').checked,
        cache_max_entries: Number(formData.get("cache_max_entries") || 1000)
      };
    }

    async function saveProvider(form, statusElement) {
      const payload = readProviderPayload(form);
      const response = await request("/admin/providers", {
        method: "POST",
        body: JSON.stringify(payload)
      }, true);

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.save")));
      }

      if (form === refs.createForm) {
        syncCreateProviderDraft(true);
        applyCreateProviderDraftToForm();
      } else if (payload.name) {
        state.providerDraftsByName[payload.name] = { ...payload };
        state.providerDraftDirtyByName[payload.name] = false;
      }

      setMessage(statusElement, t("admin.savedTip"), "ok");
      setMessage(refs.adminActionStatus, t("admin.savedProvider", { name: payload.name }), "ok");
      await loadAdminOverview();
    }

    async function saveGlobalConfig() {
      const payload = {
        token_estimation_enabled: refs.globalTokenEstimation.checked
      };
      const nextAdminKey = refs.globalAdminKey.value.trim();
      if (nextAdminKey) {
        payload.admin_key = nextAdminKey;
      }
      if (state.globalClientKeysDirty) {
        payload.client_keys = refs.globalClientKeys.value
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
      }

      const response = await request("/admin/config", {
        method: "PUT",
        body: JSON.stringify(payload)
      }, true);

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.save")));
      }

      state.globalConfigDraft = {
        admin_key: "",
        token_estimation_enabled: payload.token_estimation_enabled,
        client_keys: "",
        admin_key_configured: true,
        client_key_count: Array.isArray(payload.client_keys) ? payload.client_keys.length : ((state.globalConfigDraft && state.globalConfigDraft.client_key_count) || 0)
      };
      state.globalConfigDirty = false;
      state.globalAdminKeyDirty = false;
      state.globalClientKeysDirty = false;
      refs.globalAdminKey.value = "";
      refs.globalClientKeys.value = "";
      setMessage(refs.globalStatus, t("admin.savedTip"), "ok");
      setMessage(refs.adminActionStatus, t("admin.savedGlobal"), "ok");
      await loadAdminOverview();
    }

    async function importKeys(form, statusElement) {
      const provider = form.dataset.provider;
      const formData = new FormData(form);
      const response = await request(`/admin/providers/${encodeURIComponent(provider)}/keys`, {
        method: "POST",
        body: JSON.stringify({ keys: String(formData.get("keys") || "") })
      }, true);

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.import")));
      }

      const nextKeys = await response.json();
      state.providerImportDraftsByName[provider] = "";
      state.providerImportDirtyByName[provider] = false;
      updateProviderKeysInState(provider, nextKeys);
      setMessage(statusElement, t("admin.importDone"), "ok");
      setMessage(refs.adminActionStatus, t("admin.importDoneTip", { provider }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    async function deleteProvider(name) {
      const response = await request(`/admin/providers/${encodeURIComponent(name)}`, {
        method: "DELETE"
      }, true);
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.delete")));
      }
      state.providers = (state.providers || []).filter((provider) => provider.name !== name);
      delete state.stats[name];
      normalizeProviderWorkspaceState();
      setMessage(refs.adminActionStatus, t("admin.deletedProvider", { name }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    async function deleteKey(provider, key) {
      const response = await request(`/admin/providers/${encodeURIComponent(provider)}/${encodeURIComponent(key)}`, {
        method: "DELETE"
      }, true);
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.delete")));
      }
      const currentProvider = (state.providers || []).find((item) => item.name === provider);
      const currentKeys = currentProvider && Array.isArray(currentProvider.keys) ? currentProvider.keys : [];
      const nextKeys = currentKeys.filter((item) => String(item.ref || item.value) !== key);
      updateProviderKeysInState(provider, nextKeys);
      setMessage(refs.adminActionStatus, t("admin.deletedKey", { provider }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    async function clearProviderCache(provider) {
      const response = await request(`/admin/providers/${encodeURIComponent(provider)}/cache`, {
        method: "DELETE"
      }, true);
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.action")));
      }
      setMessage(refs.adminActionStatus, t("admin.clearedCache", { provider }), "ok");
    }

    async function applyBulkKeyAction(providerName, actionName) {
      const selectedKeys = getSelectedKeys(providerName);
      if (!selectedKeys.length) {
        throw new Error(t("admin.noSelectedKeys"));
      }

      const response = await request(`/admin/providers/${encodeURIComponent(providerName)}/keys/bulk`, {
        method: "POST",
        body: JSON.stringify({
          action: actionName,
          keys: selectedKeys
        })
      }, true);
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.action")));
      }

      const nextKeys = await response.json();
      updateProviderKeysInState(providerName, nextKeys);
      setSelectedKeys(providerName, []);
      state.providerImportDraftsByName[providerName] = "";
      state.providerImportDirtyByName[providerName] = false;
      setMessage(refs.adminActionStatus, t("admin.bulkActionDone", { action: t(`admin.bulkAction${actionName.charAt(0).toUpperCase()}${actionName.slice(1)}`) }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    /* ---------- listeners ---------- */

    refs.navStatus.addEventListener("click", () => goTo("/status"));
    refs.navAdmin.addEventListener("click", () => goTo("/admin"));

    refs.themeToggle.addEventListener("click", () => {
      setTheme(state.theme === "dark" ? "light" : "dark");
    });

    refs.langToggle.addEventListener("click", () => {
      setLang(state.lang === "zh-CN" ? "en" : "zh-CN");
    });

    refs.openLogModalButton.addEventListener("click", () => {
      setLogModalOpen(true);
    });

    refs.closeLogModalButton.addEventListener("click", () => {
      setLogModalOpen(false);
    });

    refs.hidePanelLogsToggle.addEventListener("change", () => {
      state.hidePanelLogs = refs.hidePanelLogsToggle.checked;
      renderRecentLogs(state.recentLogs || []);
    });

    refs.providerPagePrev.addEventListener("click", () => {
      setProviderPage(state.providerPageIndex - 1);
    });

    refs.providerPageNext.addEventListener("click", () => {
      setProviderPage(state.providerPageIndex + 1);
    });

    refs.keySearchInput.addEventListener("input", () => {
      state.keySearchQuery = refs.keySearchInput.value.trim();
      const provider = getCurrentProvider();
      if (provider) {
        state.keyPageIndexByProvider[provider.name] = 0;
      }
      renderAdminWorkspaceProviders();
    });

    refs.logModal.addEventListener("click", (event) => {
      if (event.target === refs.logModal) {
        setLogModalOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !refs.logModal.classList.contains("hidden")) {
        setLogModalOpen(false);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (route === "admin") {
          void loadAdminOverview();
          return;
        }
        void loadStatusOverview();
      }
    });

    // Follow system theme until user manually overrides
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        if (!state.themeManual) {
          state.theme = event.matches ? "dark" : "light";
          applyTheme();
        }
      });
    }

    refs.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const adminKey = refs.loginKey.value.trim();
      if (!adminKey) {
        setMessage(refs.loginStatus, t("admin.pleaseInputKey"), "error");
        return;
      }

      try {
        await loginAdmin(adminKey);
        await loadAdminOverview();
      } catch (error) {
        setMessage(refs.loginStatus, error.message || t("error.login"), "error");
      }
    });

    refs.logoutButton.addEventListener("click", async () => {
      try {
        await request("/admin/logout", { method: "POST" }, true);
      } catch {}
      setAdminAuthenticated(false);
      state.overviewEtags.admin = "";
      setLogModalOpen(false);
      refs.loginKey.value = "";
      refs.adminWorkspace.classList.add("hidden");
      state.providers = [];
      state.stats = {};
      normalizeProviderWorkspaceState();
      refs.providerList.innerHTML = `<div class="empty">${escapeHTML(t("admin.loggedOut"))}</div>`;
      renderProviderPager([]);
      renderRecentLogs([]);
      refs.logoutButton.classList.add("hidden");
      setMessage(refs.adminActionStatus, "", "");
      setMessage(refs.loginStatus, t("admin.loggedOutMsg"), "ok");
      void loadStatusOverview();
    });

    refs.globalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveGlobalConfig();
      } catch (error) {
        setMessage(refs.globalStatus, error.message || t("error.save"), "error");
      }
    });

    refs.createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveProvider(refs.createForm, refs.createStatus);
      } catch (error) {
        setMessage(refs.createStatus, error.message || t("error.save"), "error");
      }
    });

    refs.providerList.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      event.preventDefault();

      try {
        if (form.classList.contains("provider-edit-form")) {
          const statusElement = form.querySelector('[data-role="provider-status"]');
          await saveProvider(form, statusElement);
        }
        if (form.classList.contains("provider-keys-form")) {
          const statusElement = form.querySelector('[data-role="keys-status"]');
          await importKeys(form, statusElement);
        }
      } catch (error) {
        const role = form.classList.contains("provider-edit-form") ? "provider-status" : "keys-status";
        const statusElement = form.querySelector(`[data-role="${role}"]`);
        setMessage(statusElement, error.message || t("error.action"), "error");
      }
    });

    refs.globalForm.addEventListener("input", (event) => {
      state.globalConfigDraft = {
        admin_key: refs.globalAdminKey.value,
        token_estimation_enabled: refs.globalTokenEstimation.checked,
        client_keys: refs.globalClientKeys.value
      };
      state.globalConfigDirty = true;
      if (event.target === refs.globalAdminKey) {
        state.globalAdminKeyDirty = true;
      }
      if (event.target === refs.globalClientKeys) {
        state.globalClientKeysDirty = true;
      }
    });

    refs.globalForm.addEventListener("change", (event) => {
      state.globalConfigDraft = {
        admin_key: refs.globalAdminKey.value,
        token_estimation_enabled: refs.globalTokenEstimation.checked,
        client_keys: refs.globalClientKeys.value
      };
      state.globalConfigDirty = true;
      if (event.target === refs.globalAdminKey) {
        state.globalAdminKeyDirty = true;
      }
      if (event.target === refs.globalClientKeys) {
        state.globalClientKeysDirty = true;
      }
    });

    refs.createForm.addEventListener("input", () => {
      state.createProviderDraft = readProviderPayload(refs.createForm);
      state.createProviderDirty = true;
    });

    refs.createForm.addEventListener("change", () => {
      state.createProviderDraft = readProviderPayload(refs.createForm);
      state.createProviderDirty = true;
    });

    refs.providerListPanelBody.addEventListener("input", (event) => {
      const form = event.target.closest("form");
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      if (form.classList.contains("provider-edit-form")) {
        const providerName = form.dataset.provider;
        state.providerDraftsByName[providerName] = readProviderPayload(form);
        state.providerDraftDirtyByName[providerName] = true;
      }
      if (form.classList.contains("provider-keys-form")) {
        const providerName = form.dataset.provider;
        state.providerImportDraftsByName[providerName] = String(new FormData(form).get("keys") || "");
        state.providerImportDirtyByName[providerName] = true;
      }
    });

    refs.providerListPanelBody.addEventListener("change", (event) => {
      const form = event.target.closest("form");
      if (form instanceof HTMLFormElement && form.classList.contains("provider-edit-form")) {
        const providerName = form.dataset.provider;
        state.providerDraftsByName[providerName] = readProviderPayload(form);
        state.providerDraftDirtyByName[providerName] = true;
      }
      if (form instanceof HTMLFormElement && form.classList.contains("provider-keys-form")) {
        const providerName = form.dataset.provider;
        state.providerImportDraftsByName[providerName] = String(new FormData(form).get("keys") || "");
        state.providerImportDirtyByName[providerName] = true;
      }
    });

    refs.providerListPanelBody.addEventListener("change", (event) => {
      const checkbox = event.target.closest('input[data-role="key-selector"]');
      if (!checkbox) {
        return;
      }

      const providerName = checkbox.dataset.provider;
      const keyValue = checkbox.dataset.key;
      const selectedKeys = new Set(getSelectedKeys(providerName));
      if (checkbox.checked) {
        selectedKeys.add(keyValue);
      } else {
        selectedKeys.delete(keyValue);
      }
      setSelectedKeys(providerName, Array.from(selectedKeys));
      renderAdminWorkspaceProviders();
    });

    refs.providerListPanelBody.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const provider = button.dataset.provider;
      const key = button.dataset.key;
      const currentProvider = getCurrentProvider();

      try {
        if (action === "delete-provider") {
          await deleteProvider(provider);
        }
        if (action === "delete-key") {
          await deleteKey(provider, key);
        }
        if (action === "clear-cache") {
          await clearProviderCache(provider);
        }
        if (action === "prev-key-page" && currentProvider) {
          setKeyPage(currentProvider.name, (state.keyPageIndexByProvider[currentProvider.name] || 0) - 1);
        }
        if (action === "next-key-page" && currentProvider) {
          setKeyPage(currentProvider.name, (state.keyPageIndexByProvider[currentProvider.name] || 0) + 1);
        }
        if (action === "select-page-keys" && currentProvider) {
          const filteredKeys = filterProviderKeys(currentProvider, state.keySearchQuery);
          const { pageKeys } = paginateProviderKeys(filteredKeys, currentProvider.name);
          const mergedKeys = new Set([...getSelectedKeys(currentProvider.name), ...pageKeys.map((item) => String(item.ref || item.value))]);
          setSelectedKeys(currentProvider.name, Array.from(mergedKeys));
          renderAdminWorkspaceProviders();
        }
        if (action === "invert-page-keys" && currentProvider) {
          const filteredKeys = filterProviderKeys(currentProvider, state.keySearchQuery);
          const { pageKeys } = paginateProviderKeys(filteredKeys, currentProvider.name);
          const nextSelectedKeys = new Set(getSelectedKeys(currentProvider.name));
          for (const pageKey of pageKeys) {
            const keyRef = String(pageKey.ref || pageKey.value);
            if (nextSelectedKeys.has(keyRef)) {
              nextSelectedKeys.delete(keyRef);
            } else {
              nextSelectedKeys.add(keyRef);
            }
          }
          setSelectedKeys(currentProvider.name, Array.from(nextSelectedKeys));
          renderAdminWorkspaceProviders();
        }
        if (action === "enable-selected-keys" && currentProvider) {
          await applyBulkKeyAction(currentProvider.name, "enable");
        }
        if (action === "disable-selected-keys" && currentProvider) {
          await applyBulkKeyAction(currentProvider.name, "disable");
        }
        if (action === "delete-selected-keys" && currentProvider) {
          await applyBulkKeyAction(currentProvider.name, "delete");
        }
      } catch (error) {
        setMessage(refs.adminActionStatus, error.message || t("error.action"), "error");
      }
    });

    async function init() {
      applyTheme();
      applyI18nStatic();
      renderBuildVersion();
      syncCreateProviderDraft();
      applyCreateProviderDraftToForm();
      refs.hidePanelLogsToggle.checked = state.hidePanelLogs;
      setRouteView();
      startOverviewPolling();

      if (route === "admin") {
        try {
          await loadAdminOverview();
        } catch (error) {
          setMessage(refs.loginStatus, error.message || t("error.read"), "error");
        }
        return;
      }

      await loadStatusOverview();
    }

    init();
