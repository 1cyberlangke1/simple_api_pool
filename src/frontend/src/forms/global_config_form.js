import * as v from "valibot";

import { parseImportedKeys } from "../api.js";

const adminKeySchema = v.object({
  admin_key: v.string()
});

const globalSettingsSchema = v.object({
  client_keys: v.array(v.string()),
  token_estimation_enabled: v.boolean()
});

function normalizeClientKeys(clientKeys) {
  if (Array.isArray(clientKeys)) {
    return parseImportedKeys(clientKeys.join("\n"));
  }
  return parseImportedKeys(clientKeys);
}

export function createGlobalDraft(globalSnapshot) {
  const snapshot = globalSnapshot || {};
  return {
    admin_key: "",
    admin_key_configured: Boolean(snapshot.admin_key_configured),
    token_estimation_enabled: Boolean(snapshot.token_estimation_enabled),
    client_keys: normalizeClientKeys(snapshot.client_keys)
  };
}

export function buildAdminKeyPayload(globalDraft) {
  return v.parse(adminKeySchema, {
    admin_key: String(globalDraft.admin_key || "").trim()
  });
}

export function buildGlobalSettingsPayload(globalDraft) {
  return v.parse(globalSettingsSchema, {
    client_keys: normalizeClientKeys(globalDraft.client_keys),
    token_estimation_enabled: Boolean(globalDraft.token_estimation_enabled)
  });
}
