/* ---------- app ---------- */

    const refs = {
      heroTitle: document.getElementById("hero-title"),
      heroCopy: document.getElementById("hero-copy"),
      buildVersionValue: document.getElementById("build-version-value"),
      navStatus: document.getElementById("nav-status"),
      navAdmin: document.getElementById("nav-admin"),
      statusView: document.getElementById("status-view"),
      adminView: document.getElementById("admin-view"),
      adminNavGlobal: document.getElementById("admin-nav-global"),
      adminNavProviders: document.getElementById("admin-nav-providers"),
      adminSessionCopy: document.getElementById("admin-session-copy"),
      adminSessionBadge: document.getElementById("admin-session-badge"),
      adminSessionSummary: document.getElementById("admin-session-summary"),
      adminSessionState: document.getElementById("admin-session-state"),
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
      globalSummaryAdminKey: document.getElementById("global-summary-admin-key"),
      globalSummaryClientKeys: document.getElementById("global-summary-client-keys"),
      globalSummaryTokenEstimation: document.getElementById("global-summary-token-estimation"),
      createForm: document.getElementById("provider-create-form"),
      createStatus: document.getElementById("provider-create-status"),
      adminGlobalSection: document.getElementById("admin-global-section"),
      adminProviderSection: document.getElementById("admin-provider-section"),
      providerSelectorSearch: document.getElementById("provider-selector-search"),
      providerSelectorList: document.getElementById("provider-selector-list"),
      providerListPanelBody: document.getElementById("provider-list-panel-body"),
      providerList: document.getElementById("provider-list"),
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
      const nextRoute = getRouteFromPath(path);
      if (location.pathname !== path) {
        history.pushState({}, "", path);
      }
      markUiActivity();
      route = nextRoute;
      setRouteView();
      startOverviewPolling();
      if (route === "admin") {
        void loadAdminOverview();
        return;
      }
      void loadStatusOverview();
    }

    function replaceEvery(source, search, replacement) {
      return String(source).split(search).join(replacement);
    }

    function escapeHTML(value) {
      const escapeMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return String(value).replace(/[&<>"']/g, (char) => escapeMap[char] || char);
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
      return version + " / " + revision + " / " + buildTime;
    }

    function renderBuildVersion() {
      refs.buildVersionValue.textContent = createBuildVersionText();
    }

    function setMessage(element, text, kind) {
      const nextKind = kind || "";
      if (!element) {
        return;
      }
      element.textContent = text || "";
      element.classList.add("inline-status");
      element.classList.remove("ok", "error");
      element.classList.toggle("ok", nextKind === "ok");
      element.classList.toggle("error", nextKind === "error");
    }

    function setAdminAuthenticated(authenticated) {
      state.adminAuthenticated = Boolean(authenticated);
      renderAdminSessionState();
    }

    function normalizeErrorMessage(error, fallbackText) {
      if (error && typeof error.message === "string" && error.message.trim()) {
        return error.message.trim();
      }
      return fallbackText;
    }

    function handleAdminSessionExpired(messageText) {
      setAdminAuthenticated(false);
      state.overviewEtags.admin = "";
      setLogModalOpen(false);
      refs.adminWorkspace.classList.add("hidden");
      refs.logoutButton.classList.add("hidden");
      renderRecentLogs([]);
      renderAdminWorkspaceProviders();
      if (route === "admin" && messageText) {
        setMessage(refs.loginStatus, messageText, "error");
      }
    }

    function countClientKeysInDraft(rawValue) {
      return String(rawValue || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean).length;
    }

    function renderGlobalConfigSummary() {
      const draft = state.globalConfigDraft || {};
      const adminConfigured = Boolean(
        (state.globalAdminKeyDirty && refs.globalAdminKey && refs.globalAdminKey.value.trim()) ||
        draft.admin_key_configured
      );
      const clientKeyCount = state.globalClientKeysDirty && refs.globalClientKeys
        ? countClientKeysInDraft(refs.globalClientKeys.value)
        : Number(draft.client_key_count || 0);
      const tokenEstimationEnabled = refs.globalTokenEstimation
        ? Boolean(refs.globalTokenEstimation.checked)
        : Boolean(draft.token_estimation_enabled);

      if (refs.globalSummaryAdminKey) {
        refs.globalSummaryAdminKey.textContent = t(adminConfigured ? "admin.configured" : "admin.notConfigured");
      }
      if (refs.globalSummaryClientKeys) {
        refs.globalSummaryClientKeys.textContent = t("admin.clientKeyCount", { count: clientKeyCount });
      }
      if (refs.globalSummaryTokenEstimation) {
        refs.globalSummaryTokenEstimation.textContent = t(tokenEstimationEnabled ? "admin.enabled" : "admin.disabled");
      }
    }

    function renderAdminSessionState() {
      const authenticated = Boolean(state.adminAuthenticated);
      if (document.body) {
        document.body.classList.toggle("admin-authenticated", authenticated);
      }
      if (refs.loginForm) {
        refs.loginForm.classList.toggle("hidden", authenticated);
      }
      if (refs.adminSessionSummary) {
        refs.adminSessionSummary.classList.toggle("hidden", !authenticated);
      }
      if (refs.logoutButton) {
        refs.logoutButton.classList.toggle("hidden", !authenticated);
      }
      if (refs.adminSessionCopy) {
        refs.adminSessionCopy.textContent = authenticated ? t("admin.sessionActiveCopy") : t("admin.loginSub");
      }
      if (refs.adminSessionState) {
        refs.adminSessionState.textContent = authenticated ? t("admin.sessionActive") : t("admin.sessionInactive");
      }
      if (refs.adminSessionBadge) {
        refs.adminSessionBadge.textContent = authenticated ? t("admin.sessionActive") : t("admin.sessionInactive");
        refs.adminSessionBadge.className = authenticated ? "status-badge ok" : "status-badge";
      }
    }

    function formatTimestamp(value) {
      const numericValue = Number(value || 0);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return t("provider.notDisabled");
      }
      const date = new Date(numericValue * 1000);
      if (Number.isNaN(date.getTime())) {
        return t("provider.notDisabled");
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
      return { available: available, disabled: disabled };
    }
