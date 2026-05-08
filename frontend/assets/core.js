const API_BASE = "/api";
    const STATUS_POLL_INTERVAL_MS = 5000;
    const STATUS_IDLE_POLL_INTERVAL_MS = 30000;
    const STATUS_POLL_ACTIVITY_WINDOW_MS = 45000;
    const KEY_PAGE_SIZE = 10;
    const THEME_KEY = "simple-api-pool-theme";
    const LANG_KEY = "simple-api-pool-lang";
    const RAW_APP_VERSION = "v0.1.30-1-g64d2b70-dirty";
    const RAW_APP_REVISION = "64d2b70";
    const RAW_APP_BUILD_TIME = "2026-05-08T15:40:45Z";
    function getRouteFromPath(pathname) {
      return pathname === "/admin" ? "admin" : "status";
    }
