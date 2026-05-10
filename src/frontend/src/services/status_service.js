import { requestJSON } from "../api.js";

export async function fetchStatusBootstrap() {
  return requestJSON("/api/status/bootstrap");
}

export async function fetchStatusOverview(options) {
  const requestOptions = options || {};
  const headers = {};
  if (!requestOptions.forceRefresh && requestOptions.etag) {
    headers["If-None-Match"] = requestOptions.etag;
  }
  return requestJSON("/api/status/overview", { headers });
}
