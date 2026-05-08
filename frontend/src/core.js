const API_BASE = "/api";
    const STATUS_POLL_INTERVAL_MS = 5000;
    const STATUS_IDLE_POLL_INTERVAL_MS = 30000;
    const STATUS_POLL_ACTIVITY_WINDOW_MS = 45000;
    const KEY_PAGE_SIZE = 10;
    const THEME_KEY = "simple-api-pool-theme";
    const LANG_KEY = "simple-api-pool-lang";
    const RAW_APP_VERSION = "__APP_VERSION__";
    const RAW_APP_REVISION = "__APP_REVISION__";
    const RAW_APP_BUILD_TIME = "__APP_BUILD_TIME__";
    let route = getRouteFromPath(location.pathname);
    let statusPollTimer = null;

    function getRouteFromPath(pathname) {
      return pathname === "/admin" ? "admin" : "status";
    }
