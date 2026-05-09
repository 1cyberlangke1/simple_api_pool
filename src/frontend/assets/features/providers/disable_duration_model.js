/* ---------- disable duration model ---------- */

function getBulkDisableBounds(providerName) {
  const provider = (state.providers || []).find((item) => item.name === providerName) || {};
  let minimumSeconds = Number(provider.min_disable_secs || 30);
  let maximumSeconds = Number(provider.max_disable_secs || 43200);

  if (!Number.isFinite(minimumSeconds) || minimumSeconds < 1) {
    minimumSeconds = 30;
  }
  if (!Number.isFinite(maximumSeconds) || maximumSeconds < minimumSeconds) {
    maximumSeconds = Math.max(minimumSeconds, 43200);
  }

  return {
    minimumSeconds: Math.floor(minimumSeconds),
    maximumSeconds: Math.floor(maximumSeconds)
  };
}

function clampBulkDisableSeconds(providerName, rawValue) {
  const bounds = getBulkDisableBounds(providerName);
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return Math.min(bounds.maximumSeconds, Math.max(bounds.minimumSeconds, 3600));
  }
  return Math.min(bounds.maximumSeconds, Math.max(bounds.minimumSeconds, Math.floor(parsedValue)));
}

function getDefaultBulkDisableSeconds(providerName) {
  return clampBulkDisableSeconds(providerName, 3600);
}

function ensureBulkDisableState(providerName) {
  if (!(providerName in state.bulkKeyActionModeByProvider)) {
    state.bulkKeyActionModeByProvider[providerName] = "disable_until";
  }
  if (!(providerName in state.bulkDisableSecondsByProvider)) {
    state.bulkDisableSecondsByProvider[providerName] = getDefaultBulkDisableSeconds(providerName);
    return;
  }
  state.bulkDisableSecondsByProvider[providerName] = clampBulkDisableSeconds(providerName, state.bulkDisableSecondsByProvider[providerName]);
}

function getBulkDisableMode(providerName) {
  ensureBulkDisableState(providerName);
  return state.bulkKeyActionModeByProvider[providerName];
}

function getBulkDisableSeconds(providerName) {
  ensureBulkDisableState(providerName);
  return state.bulkDisableSecondsByProvider[providerName];
}

function setBulkDisableMode(providerName, mode) {
  ensureBulkDisableState(providerName);
  state.bulkKeyActionModeByProvider[providerName] = mode === "disable_until" ? "disable_until" : "disable_forever";
}

function setBulkDisableSeconds(providerName, rawValue) {
  ensureBulkDisableState(providerName);
  state.bulkDisableSecondsByProvider[providerName] = clampBulkDisableSeconds(providerName, rawValue);
}
