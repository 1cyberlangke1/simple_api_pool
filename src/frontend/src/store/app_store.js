/* ---------- app store ---------- */

function createAppStoreState() {
  return {
    adminAuthenticated: false,
    providers: [],
    stats: {},
    recentLogs: [],
    hidePanelLogs: true,
    overviewEtags: {
      status: "",
      admin: ""
    }
  };
}
