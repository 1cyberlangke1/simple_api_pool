/* ---------- app ---------- */

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
