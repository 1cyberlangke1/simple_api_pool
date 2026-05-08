/* ---------- api ---------- */

    async function parseErrorMessage(response, fallback) {
      try {
        const data = await response.json();
        return data.error || fallback;
      } catch {
        return fallback;
      }
    }

    async function request(path, options) {
      const requestOptions = options || {};
      const headers = new Headers(requestOptions.headers || {});
      if (!headers.has("Content-Type") && requestOptions.body && typeof requestOptions.body === "string") {
        headers.set("Content-Type", "application/json");
      }
      try {
        const response = await fetch(API_BASE + path, { ...requestOptions, headers: headers, credentials: "same-origin" });
        if (typeof path === "string" && path.indexOf("/admin") === 0 && path !== "/admin/login" && response.status === 401) {
          handleAdminSessionExpired(t("admin.sessionExpiredKeepDrafts"));
        }
        return response;
      } catch (error) {
        throw new Error(t("error.network") + "：" + normalizeErrorMessage(error, t("error.network")));
      }
    }

    async function requestOverview(path, overviewScope) {
      const headers = new Headers();
      const previousTag = state.overviewEtags[overviewScope] || "";
      if (previousTag) {
        headers.set("If-None-Match", previousTag);
      }

      const response = await request(path, { headers: headers });
      const currentTag = response.headers.get("ETag");
      if (currentTag) {
        state.overviewEtags[overviewScope] = currentTag;
      }
      return response;
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
        refs.statusList.innerHTML = '<div class="empty">' + escapeHTML(error.message || t("error.readStatus")) + "</div>";
        refs.statusBadge.textContent = t("status.failed");
        refs.statusBadge.className = "status-badge err";
      }
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
      const response = await requestOverview("/admin/overview", "admin");

      if (response.status === 401) {
        handleAdminSessionExpired(t("admin.sessionExpiredKeepDrafts"));
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

    async function saveProvider(form, statusElement) {
      const payload = readProviderPayload(form);
      const response = await request("/admin/providers", {
        method: "POST",
        body: JSON.stringify(payload)
      });

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
      });

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
      const parsedKeys = parseImportedKeysInput(formData.get("keys") || "");
      const response = await request("/admin/providers/" + encodeURIComponent(provider) + "/keys", {
        method: "POST",
        body: JSON.stringify({ keys: parsedKeys })
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.import")));
      }

      const nextKeys = await response.json();
      state.providerImportDraftsByName[provider] = "";
      state.providerImportDirtyByName[provider] = false;
      updateProviderKeysInState(provider, nextKeys);
      setMessage(statusElement, t("admin.importDone"), "ok");
      setMessage(refs.adminActionStatus, t("admin.importDoneTip", { provider: provider }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    async function deleteProvider(name) {
      if (!confirmAction(t("admin.confirmDeleteProvider", { name: name }))) {
        return;
      }
      const response = await request("/admin/providers/" + encodeURIComponent(name), {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.delete")));
      }
      state.providers = (state.providers || []).filter((provider) => provider.name !== name);
      delete state.stats[name];
      normalizeProviderWorkspaceState();
      setMessage(refs.adminActionStatus, t("admin.deletedProvider", { name: name }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    async function deleteKey(provider, key) {
      if (!confirmAction(t("admin.confirmDeleteKey", { provider: provider }))) {
        return;
      }
      const response = await request("/admin/providers/" + encodeURIComponent(provider) + "/" + encodeURIComponent(key), {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.delete")));
      }
      const currentProvider = (state.providers || []).find((item) => item.name === provider);
      const currentKeys = currentProvider && Array.isArray(currentProvider.keys) ? currentProvider.keys : [];
      const nextKeys = currentKeys.filter((item) => String(item.ref || item.value) !== key);
      updateProviderKeysInState(provider, nextKeys);
      setMessage(refs.adminActionStatus, t("admin.deletedKey", { provider: provider }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }

    async function clearProviderCache(provider) {
      if (!confirmAction(t("admin.confirmClearCache", { provider: provider }))) {
        return;
      }
      const response = await request(`/admin/providers/${encodeURIComponent(provider)}/cache`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.action")));
      }
      setMessage(refs.adminActionStatus, t("admin.clearedCache", { provider: provider }), "ok");
    }

    async function applyBulkKeyAction(providerName, actionName) {
      const selectedKeys = getSelectedKeys(providerName);
      if (!selectedKeys.length) {
        throw new Error(t("admin.noSelectedKeys"));
      }
      if (actionName === "delete" && !confirmAction(t("admin.confirmDeleteSelectedKeys", { count: selectedKeys.length }))) {
        return;
      }

      const response = await request("/admin/providers/" + encodeURIComponent(providerName) + "/keys/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: actionName,
          keys: selectedKeys
        })
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response, t("error.action")));
      }

      const nextKeys = await response.json();
      updateProviderKeysInState(providerName, nextKeys);
      setSelectedKeys(providerName, []);
      state.providerImportDraftsByName[providerName] = "";
      state.providerImportDirtyByName[providerName] = false;
      setMessage(refs.adminActionStatus, t("admin.bulkActionDone", { action: t("admin.bulkAction" + actionName.charAt(0).toUpperCase() + actionName.slice(1)) }), "ok");
      renderAdminWorkspaceProviders();
      renderStatusCards(state.stats);
    }
