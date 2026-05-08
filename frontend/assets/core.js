const API_BASE = "/api";
    const STATUS_POLL_INTERVAL_MS = 5000;
    const STATUS_IDLE_POLL_INTERVAL_MS = 30000;
    const STATUS_POLL_ACTIVITY_WINDOW_MS = 45000;
    const KEY_PAGE_SIZE = 10;
    const THEME_KEY = "simple-api-pool-theme";
    const LANG_KEY = "simple-api-pool-lang";
    const RAW_APP_VERSION = "v0.1.28-1-g8a37307-dirty";
    const RAW_APP_REVISION = "8a37307";
    const RAW_APP_BUILD_TIME = "2026-05-08T14:51:40Z";
    function getRouteFromPath(pathname) {
      return pathname === "/admin" ? "admin" : "status";
    }
