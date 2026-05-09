import { requestJSON } from "../api.js";

export async function fetchAdminOverview(options) {
  const requestOptions = options || {};
  const headers = {};
  if (!requestOptions.forceRefresh && requestOptions.etag) {
    headers["If-None-Match"] = requestOptions.etag;
  }
  return requestJSON("/api/admin/overview", { headers });
}

export async function loginAdmin(adminKey) {
  return requestJSON("/api/admin/login", {
    body: { admin_key: adminKey },
    method: "POST"
  });
}

export async function logoutAdmin() {
  return requestJSON("/api/admin/logout", { method: "POST" });
}

export async function saveGlobalConfig(payload) {
  return requestJSON("/api/admin/config", {
    body: payload,
    method: "PUT"
  });
}

export async function saveProvider(payload) {
  return requestJSON("/api/admin/providers", {
    body: payload,
    method: "POST"
  });
}

export async function deleteProvider(providerName) {
  return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName), {
    method: "DELETE"
  });
}

export async function clearProviderCache(providerName) {
  return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/cache", {
    method: "DELETE"
  });
}

export async function importProviderKeys(providerName, keys) {
  return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/keys", {
    body: { keys },
    method: "POST"
  });
}

export async function applyProviderBulkAction(providerName, payload) {
  return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/keys/bulk", {
    body: payload,
    method: "POST"
  });
}

export async function deleteProviderKey(providerName, keyRef) {
  return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/" + encodeURIComponent(keyRef), {
    method: "DELETE"
  });
}
