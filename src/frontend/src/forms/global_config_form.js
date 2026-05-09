import * as v from "valibot";

import { parseImportedKeys } from "../api.js";

const globalConfigSchema = v.object({
  admin_key: v.string(),
  client_keys: v.array(v.string()),
  include_client_keys: v.boolean(),
  token_estimation_enabled: v.boolean()
});

export function createGlobalDraft(globalSnapshot) {
  const snapshot = globalSnapshot || {};
  return {
    admin_key: "",
    admin_key_configured: Boolean(snapshot.admin_key_configured),
    token_estimation_enabled: Boolean(snapshot.token_estimation_enabled),
    client_keys_text: ""
  };
}

export function buildGlobalPayload(globalDraft, includeClientKeys) {
  const parsedPayload = v.parse(globalConfigSchema, {
    admin_key: String(globalDraft.admin_key || "").trim(),
    client_keys: includeClientKeys ? parseImportedKeys(globalDraft.client_keys_text) : [],
    include_client_keys: Boolean(includeClientKeys),
    token_estimation_enabled: Boolean(globalDraft.token_estimation_enabled)
  });

  const payload = {
    token_estimation_enabled: parsedPayload.token_estimation_enabled
  };
  if (parsedPayload.include_client_keys) {
    payload.client_keys = parsedPayload.client_keys;
  }
  if (parsedPayload.admin_key) {
    payload.admin_key = parsedPayload.admin_key;
  }
  return payload;
}
