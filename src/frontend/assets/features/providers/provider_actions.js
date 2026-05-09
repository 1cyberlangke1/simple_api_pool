/* ---------- provider actions ---------- */

function buildBulkKeyActionRequest(providerName, actionName, selectedKeys) {
  if (actionName === "disable") {
    if (getBulkDisableMode(providerName) === "disable_until") {
      return {
        action: "disable_until",
        keys: selectedKeys,
        disable_seconds: getBulkDisableSeconds(providerName)
      };
    }
    return {
      action: "disable_forever",
      keys: selectedKeys
    };
  }

  return {
    action: actionName,
    keys: selectedKeys
  };
}
