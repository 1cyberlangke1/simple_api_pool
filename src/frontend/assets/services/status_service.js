/* ---------- status service ---------- */

function fetchStatusOverviewSnapshot() {
  return requestOverview("/status/overview", "status");
}
