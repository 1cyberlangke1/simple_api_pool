/* ---------- boot ---------- */

    /* ---------- listeners ---------- */

    refs.navStatus.addEventListener("click", () => goTo("/status"));
    refs.navAdmin.addEventListener("click", () => goTo("/admin"));
    refs.adminNavGlobal.addEventListener("click", () => {
      const globalDisclosure = refs.adminGlobalSection && refs.adminGlobalSection.querySelector("details");
      if (globalDisclosure) {
        globalDisclosure.open = true;
      }
      if (refs.adminGlobalSection) {
        refs.adminGlobalSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    refs.adminNavProviders.addEventListener("click", () => {
      if (refs.adminProviderSection) {
        refs.adminProviderSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (refs.providerSelectorSearch) {
        refs.providerSelectorSearch.focus({ preventScroll: true });
      }
    });

    document.addEventListener("mousedown", scheduleUiActivityMark);
    document.addEventListener("keydown", scheduleUiActivityMark);
    document.addEventListener("input", scheduleUiActivityMark);

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
      markUiActivity();
      state.hidePanelLogs = refs.hidePanelLogsToggle.checked;
      renderRecentLogs(state.recentLogs || []);
    });

    refs.logModal.addEventListener("click", (event) => {
      if (event.target === refs.logModal) {
        setLogModalOpen(false);
      }
    });

    refs.logModal.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !refs.logModal.classList.contains("hidden")) {
        setLogModalOpen(false);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        markUiActivity();
        startOverviewPolling();
        void pollCurrentOverview();
      }
    });

    window.addEventListener("popstate", () => {
      route = getRouteFromPath(location.pathname);
      setRouteView();
      markUiActivity();
      startOverviewPolling();
      void pollCurrentOverview();
    });

    window.addEventListener("error", (event) => {
      const messageText = normalizeErrorMessage(event.error, t("error.runtime"));
      if (route === "admin") {
        setMessage(refs.adminActionStatus, messageText, "error");
        return;
      }
      refs.serviceHealth.textContent = t("metric.healthError");
      refs.serviceHealthNote.textContent = messageText;
      refs.statusBadge.textContent = t("status.failed");
      refs.statusBadge.className = "status-badge err";
    });

    window.addEventListener("unhandledrejection", (event) => {
      const messageText = normalizeErrorMessage(event.reason, t("error.runtime"));
      if (route === "admin") {
        setMessage(refs.adminActionStatus, messageText, "error");
        return;
      }
      refs.serviceHealth.textContent = t("metric.healthError");
      refs.serviceHealthNote.textContent = messageText;
      refs.statusBadge.textContent = t("status.failed");
      refs.statusBadge.className = "status-badge err";
    });

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
      let logoutFailed = false;
      try {
        const response = await request("/admin/logout", { method: "POST" });
        logoutFailed = !response.ok;
      } catch (error) {
        logoutFailed = true;
        setMessage(refs.adminActionStatus, normalizeErrorMessage(error, t("error.action")), "error");
      }
      setAdminAuthenticated(false);
      state.overviewEtags.admin = "";
      setLogModalOpen(false);
      refs.loginKey.value = "";
      refs.adminWorkspace.classList.add("hidden");
      state.providers = [];
      state.stats = {};
      normalizeProviderWorkspaceState();
      renderAdminWorkspaceProviders();
      renderRecentLogs([]);
      refs.logoutButton.classList.add("hidden");
      if (!logoutFailed) {
        setMessage(refs.adminActionStatus, "", "");
        setMessage(refs.loginStatus, t("admin.loggedOutMsg"), "ok");
      } else {
        setMessage(refs.loginStatus, t("admin.loggedOutLocalOnly"), "error");
      }
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

    refs.globalForm.addEventListener("input", syncGlobalConfigDraftFromForm);
    refs.createForm.addEventListener("input", syncCreateProviderDraftFromForm);
    refs.providerList.addEventListener("submit", handleProviderWorkspaceSubmit);
    refs.providerSelectorSearch.addEventListener("input", handleProviderSelectorSearchInput);
    refs.providerListPanelBody.addEventListener("input", handleProviderWorkspaceInput);
    refs.providerListPanelBody.addEventListener("change", handleProviderWorkspaceChange);
    refs.providerListPanelBody.addEventListener("click", handleProviderWorkspaceClick);
    refs.providerSelectorList.addEventListener("click", handleProviderSelectorClick);

    function init() {
      applyTheme();
      applyI18nStatic();
      renderBuildVersion();
      renderAdminSessionState();
      syncCreateProviderDraft();
      applyCreateProviderDraftToForm();
      renderGlobalConfigSummary();
      refs.hidePanelLogsToggle.checked = state.hidePanelLogs;
      setRouteView();
      startOverviewPolling();
      void pollCurrentOverview().catch((error) => {
        if (route === "admin") {
          setMessage(refs.loginStatus, error.message || t("error.read"), "error");
          return;
        }
        refs.serviceHealth.textContent = t("metric.healthError");
        refs.serviceHealthNote.textContent = error.message || t("metric.healthUnavailable");
        refs.statusList.innerHTML = '<div class="empty">' + escapeHTML(error.message || t("error.readStatus")) + "</div>";
        refs.statusBadge.textContent = t("status.failed");
        refs.statusBadge.className = "status-badge err";
      });
    }

    init();
