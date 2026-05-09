/* ---------- polling ---------- */

    function getOverviewPollDelay() {
      if (document.visibilityState === "hidden") {
        return STATUS_IDLE_POLL_INTERVAL_MS;
      }

      const idleMs = Date.now() - Number(state.lastUiActivityAt || 0);
      if (route === "admin" || idleMs < STATUS_POLL_ACTIVITY_WINDOW_MS) {
        return STATUS_POLL_INTERVAL_MS;
      }
      return STATUS_IDLE_POLL_INTERVAL_MS;
    }

    async function pollCurrentOverview() {
      if (route === "admin") {
        await loadAdminOverview();
        return;
      }
      await loadStatusOverview();
    }

    function scheduleOverviewPolling() {
      if (statusPollTimer !== null) {
        clearTimeout(statusPollTimer);
      }

      statusPollTimer = setTimeout(async () => {
        statusPollTimer = null;
        try {
          await pollCurrentOverview();
        } finally {
          scheduleOverviewPolling();
        }
      }, getOverviewPollDelay());
    }

    function startOverviewPolling() {
      scheduleOverviewPolling();
    }
