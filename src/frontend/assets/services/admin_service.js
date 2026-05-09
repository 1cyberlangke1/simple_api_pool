/* ---------- admin service ---------- */

function fetchAdminOverviewSnapshot() {
  return requestOverview("/admin/overview", "admin");
}

function sendAdminLoginRequest(adminKey) {
  return request("/admin/login", {
    method: "POST",
    body: JSON.stringify({ admin_key: adminKey })
  });
}

function sendAdminLogoutRequest() {
  return request("/admin/logout", { method: "POST" });
}

function sendSaveProviderRequest(payload) {
  return request("/admin/providers", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function sendSaveGlobalConfigRequest(payload) {
  return request("/admin/config", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

function sendImportKeysRequest(provider, parsedKeys) {
  return request("/admin/providers/" + encodeURIComponent(provider) + "/keys", {
    method: "POST",
    body: JSON.stringify({ keys: parsedKeys })
  });
}

function sendDeleteProviderRequest(name) {
  return request("/admin/providers/" + encodeURIComponent(name), {
    method: "DELETE"
  });
}

function sendDeleteKeyRequest(provider, key) {
  return request("/admin/providers/" + encodeURIComponent(provider) + "/" + encodeURIComponent(key), {
    method: "DELETE"
  });
}

function sendClearProviderCacheRequest(provider) {
  return request(`/admin/providers/${encodeURIComponent(provider)}/cache`, {
    method: "DELETE"
  });
}

function sendBulkKeyActionRequest(providerName, payload) {
  return request("/admin/providers/" + encodeURIComponent(providerName) + "/keys/bulk", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
