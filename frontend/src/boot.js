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
        const statusElement = form.querySelector('[data-role="' + role + '"]');
        setMessage(statusElement, error.message || t("error.action"), "error");
      }
    });

    function syncGlobalConfigDraftFromForm(event) {
      state.globalConfigDraft = {
        admin_key: refs.globalAdminKey.value,
        token_estimation_enabled: refs.globalTokenEstimation.checked,
        client_keys: refs.globalClientKeys.value,
        admin_key_configured: Boolean(refs.globalAdminKey.value.trim()) || Boolean(state.globalConfigDraft && state.globalConfigDraft.admin_key_configured),
        client_key_count: countClientKeysInDraft(refs.globalClientKeys.value)
      };
      state.globalConfigDirty = true;
      if (event.target === refs.globalAdminKey) {
        state.globalAdminKeyDirty = true;
      }
      if (event.target === refs.globalClientKeys) {
        state.globalClientKeysDirty = true;
      }
      renderGlobalConfigSummary();
    }

    function syncCreateProviderDraftFromForm() {
      state.createProviderDraft = readProviderPayload(refs.createForm);
      state.createProviderDirty = true;
    }

    function syncProviderPanelDraftFromEvent(event) {
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
    }

    refs.globalForm.addEventListener("input", syncGlobalConfigDraftFromForm);
    refs.createForm.addEventListener("input", syncCreateProviderDraftFromForm);
    refs.providerSelectorSearch.addEventListener("input", () => {
      state.providerSearchQuery = refs.providerSelectorSearch.value.trim();
      if (state.providerSearchDebounceTimer !== null) {
        clearTimeout(state.providerSearchDebounceTimer);
      }
      state.providerSearchDebounceTimer = setTimeout(() => {
        state.providerSearchDebounceTimer = null;
        renderAdminWorkspaceProviders();
      }, 100);
    });
    refs.providerListPanelBody.addEventListener("input", syncProviderPanelDraftFromEvent);
    refs.providerListPanelBody.addEventListener("input", (event) => {
      const keySearchInput = event.target.closest('input[data-role="key-search-input"]');
      if (!keySearchInput) {
        return;
      }
      state.keySearchQuery = keySearchInput.value.trim();
      const provider = getCurrentProvider();
      if (provider) {
        state.keyPageIndexByProvider[provider.name] = 0;
      }
      if (state.keySearchDebounceTimer !== null) {
        clearTimeout(state.keySearchDebounceTimer);
      }
      state.keySearchDebounceTimer = setTimeout(() => {
        state.keySearchDebounceTimer = null;
        renderAdminWorkspaceProviders();
      }, 120);
    });

    refs.providerListPanelBody.addEventListener("change", (event) => {
      syncProviderPanelDraftFromEvent(event);
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
        const actionHandlers = {
          "toggle-import-keys": async () => {
            if (!currentProvider) {
              return;
            }
            state.providerImportExpandedByName[currentProvider.name] = !state.providerImportExpandedByName[currentProvider.name];
            renderAdminWorkspaceProviders();
          },
          "delete-provider": async () => deleteProvider(provider),
          "delete-key": async () => deleteKey(provider, key),
          "clear-cache": async () => clearProviderCache(provider),
          "prev-key-page": async () => {
            if (!currentProvider) {
              return;
            }
            setKeyPage(currentProvider.name, (state.keyPageIndexByProvider[currentProvider.name] || 0) - 1);
          },
          "next-key-page": async () => {
            if (!currentProvider) {
              return;
            }
            setKeyPage(currentProvider.name, (state.keyPageIndexByProvider[currentProvider.name] || 0) + 1);
          },
          "select-page-keys": async () => {
            if (!currentProvider) {
              return;
            }
            const filteredKeys = filterProviderKeys(currentProvider, state.keySearchQuery);
            const pageState = paginateProviderKeys(filteredKeys, currentProvider.name);
            const mergedKeys = new Set(getSelectedKeys(currentProvider.name).concat(pageState.pageKeys.map((item) => String(item.ref || item.value))));
            setSelectedKeys(currentProvider.name, Array.from(mergedKeys));
            renderAdminWorkspaceProviders();
          },
          "invert-page-keys": async () => {
            if (!currentProvider) {
              return;
            }
            const filteredKeys = filterProviderKeys(currentProvider, state.keySearchQuery);
            const pageState = paginateProviderKeys(filteredKeys, currentProvider.name);
            const nextSelectedKeys = new Set(getSelectedKeys(currentProvider.name));
            for (const pageKey of pageState.pageKeys) {
              const keyRef = String(pageKey.ref || pageKey.value);
              if (nextSelectedKeys.has(keyRef)) {
                nextSelectedKeys.delete(keyRef);
              } else {
                nextSelectedKeys.add(keyRef);
              }
            }
            setSelectedKeys(currentProvider.name, Array.from(nextSelectedKeys));
            renderAdminWorkspaceProviders();
          },
          "enable-selected-keys": async () => {
            if (currentProvider) {
              await applyBulkKeyAction(currentProvider.name, "enable");
            }
          },
          "disable-selected-keys": async () => {
            if (currentProvider) {
              await applyBulkKeyAction(currentProvider.name, "disable");
            }
          },
          "delete-selected-keys": async () => {
            if (currentProvider) {
              await applyBulkKeyAction(currentProvider.name, "delete");
            }
          }
        };
        const actionHandler = actionHandlers[action];
        if (actionHandler) {
          await actionHandler();
        }
      } catch (error) {
        setMessage(refs.adminActionStatus, error.message || t("error.action"), "error");
      }
    });

    refs.providerSelectorList.addEventListener("click", (event) => {
      const button = event.target.closest('button[data-role="provider-selector"]');
      if (!button) {
        return;
      }
      setProviderByName(button.dataset.provider);
    });

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
