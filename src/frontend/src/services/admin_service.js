import { requestJSON } from "../api.js";

import { buildProviderModelDiscoveryPath } from "@/lib/admin";

export async function fetchAdminBootstrap() {
  return requestJSON("/api/admin/bootstrap");
}

export async function fetchAdminOverview(options) {
  const requestOptions = options || {};
  const headers = {};
  if (!requestOptions.forceRefresh && requestOptions.etag) {
    headers["If-None-Match"] = requestOptions.etag;
  }
  return requestJSON("/api/admin/overview", { headers });
}

export async function fetchAdminLogs(options) {
  const requestOptions = options || {};
  const query = new URLSearchParams();
  if (requestOptions.after) {
    query.set("after", String(requestOptions.after));
  }
  if (requestOptions.limit) {
    query.set("limit", String(requestOptions.limit));
  }
  const requestURL = query.size > 0 ? `/api/admin/logs?${query.toString()}` : "/api/admin/logs";
  return requestJSON(requestURL);
}

export async function fetchAdminConfig() {
  return requestJSON("/api/admin/config");
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

export async function saveGroup(payload) {
  return requestJSON("/api/admin/groups", {
    body: payload,
    method: "POST"
  });
}

export async function deleteProvider(providerName) {
  return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName), {
    method: "DELETE"
  });
}

export async function deleteGroup(groupName) {
  return requestJSON("/api/admin/groups/" + encodeURIComponent(groupName), {
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

export async function fetchProviderModelDiscovery(providerName, providerType, clientKey) {
  return requestJSON(buildProviderModelDiscoveryPath(providerName, providerType), {
    headers: {
      Authorization: "Bearer " + String(clientKey || "").trim()
    }
  });
}
