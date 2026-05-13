import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useAdminOverview } from "@/hooks/useAdminOverview";
import { createTranslator } from "@/lib/i18n";
import { ensureDeletedEntityMissing } from "@/lib/admin_delete";

interface HookHarnessSnapshot {
  actions: ReturnType<typeof useAdminOverview>["actions"];
  state: ReturnType<typeof useAdminOverview>["state"];
}

interface MockResponseDefinition {
  body?: unknown;
  method: string;
  status: number;
  url: string;
}

let testContainer: HTMLDivElement | null = null;
let testRoot: Root | null = null;
let latestSnapshot: HookHarnessSnapshot | null = null;
let pendingResponses: MockResponseDefinition[] = [];
let receivedRequests: Array<{ method: string; url: string }> = [];
const translate = createTranslator("zh");

beforeAll(function enableReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(function disableReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

afterEach(function cleanupDeleteFlowTest() {
  vi.restoreAllMocks();
  pendingResponses = [];
  receivedRequests = [];
  latestSnapshot = null;

  if (testRoot) {
    act(function unmountHarness() {
      testRoot?.unmount();
    });
    testRoot = null;
  }
  if (testContainer) {
    testContainer.remove();
    testContainer = null;
  }
});

function HookHarness() {
  const snapshot = useAdminOverview(translate, "zh");

  useEffect(function publishSnapshot() {
    latestSnapshot = {
      actions: snapshot.actions,
      state: snapshot.state
    };
  }, [snapshot]);

  return null;
}

function createBootstrapPayload(providerNames: string[]) {
  return {
    global_config: {
      admin_key_configured: true,
      client_key_count: 0,
      client_keys: [],
      token_estimation_enabled: false
    },
    groups: [],
    health: { status: "ok" },
    provider_stats: {},
    providers: providerNames.map(function buildProvider(providerName) {
      return {
        base_url: "https://api.example.com",
        cache_enabled: false,
        cache_max_entries: 1000,
        fail_threshold: 3,
        keys: [],
        key_strategy: "round_robin",
        max_disable_secs: 3600,
        min_disable_secs: 30,
        name: providerName,
        type: "openai_chat"
      };
    }),
    recent_logs: [],
    stream_cursor: 1
  };
}

function queueResponses(responses: MockResponseDefinition[]) {
  pendingResponses = responses.slice();
}

function installFetchMock() {
  vi.stubGlobal("fetch", vi.fn(async function mockFetch(input: RequestInfo | URL, init?: RequestInit) {
    const requestURL = String(input);
    const requestMethod = String(init?.method || "GET").toUpperCase();
    receivedRequests.push({
      method: requestMethod,
      url: requestURL
    });

    const nextResponse = pendingResponses.shift();
    if (!nextResponse) {
      throw new Error(`缺少模拟响应: ${requestMethod} ${requestURL}`);
    }
    if (nextResponse.method !== requestMethod || nextResponse.url !== requestURL) {
      throw new Error(`期望请求 ${nextResponse.method} ${nextResponse.url}，实际是 ${requestMethod} ${requestURL}`);
    }

    return new Response(
      nextResponse.body === undefined ? null : JSON.stringify(nextResponse.body),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: nextResponse.status
      }
    );
  }));
}

async function renderHarness() {
  installFetchMock();
  vi.spyOn(window, "confirm").mockReturnValue(true);

  testContainer = document.createElement("div");
  document.body.appendChild(testContainer);
  testRoot = createRoot(testContainer);

  await act(async function mountHarness() {
    testRoot?.render(<HookHarness />);
  });
  await flushAsyncWork();
}

async function flushAsyncWork() {
  await act(async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getLatestSnapshot() {
  if (!latestSnapshot) {
    throw new Error("hook 快照未准备好");
  }
  return latestSnapshot;
}

describe("admin delete flow", function () {
  it("按卡片删除时会删除被点击的供应商，而不是旧选中项", async function () {
    queueResponses([
      {
        body: createBootstrapPayload(["alpha", "beta"]),
        method: "GET",
        status: 200,
        url: "/api/admin/bootstrap"
      },
      {
        body: { status: "deleted" },
        method: "DELETE",
        status: 200,
        url: "/api/admin/providers/beta"
      },
      {
        body: createBootstrapPayload(["alpha"]),
        method: "GET",
        status: 200,
        url: "/api/admin/bootstrap"
      }
    ]);

    await renderHarness();

    await act(async function deleteBetaProvider() {
      await getLatestSnapshot().actions.deleteProviderByName("beta");
    });
    await flushAsyncWork();

    expect(receivedRequests).toEqual([
      { method: "GET", url: "/api/admin/bootstrap" },
      { method: "DELETE", url: "/api/admin/providers/beta" },
      { method: "GET", url: "/api/admin/bootstrap" }
    ]);
    expect(getLatestSnapshot().state.overview.providers.map(function mapName(provider) {
      return provider.name;
    })).toEqual(["alpha"]);
  });

  it("删除后重新拉取仍包含目标供应商时，不能继续显示成功", async function () {
    queueResponses([
      {
        body: createBootstrapPayload(["alpha", "beta"]),
        method: "GET",
        status: 200,
        url: "/api/admin/bootstrap"
      },
      {
        body: { status: "deleted" },
        method: "DELETE",
        status: 200,
        url: "/api/admin/providers/beta"
      },
      {
        body: createBootstrapPayload(["alpha", "beta"]),
        method: "GET",
        status: 200,
        url: "/api/admin/bootstrap"
      }
    ]);

    await renderHarness();

    await act(async function deleteBetaProvider() {
      await getLatestSnapshot().actions.deleteProviderByName("beta");
    });
    await flushAsyncWork();

    expect(getLatestSnapshot().state.flashMessage.kind).toBe("error");
    expect(getLatestSnapshot().state.overview.providers.map(function mapName(provider) {
      return provider.name;
    })).toEqual(["alpha", "beta"]);
  });

  it("删除校验会同时识别 provider 和 group 是否仍然存在", function () {
    const overview = {
      groups: [{
        cache_enabled: false,
        cache_max_entries: 1000,
        collections: [],
        name: "router-a",
        type: "openai_chat"
      }],
      providers: [{
        base_url: "https://api.example.com",
        cache_enabled: false,
        cache_max_entries: 1000,
        fail_threshold: 3,
        keys: [],
        key_strategy: "round_robin",
        max_disable_secs: 3600,
        min_disable_secs: 30,
        name: "alpha",
        type: "openai_chat"
      }]
    };

    expect(ensureDeletedEntityMissing(overview, "provider", "alpha")).toBe(false);
    expect(ensureDeletedEntityMissing(overview, "provider", "beta")).toBe(true);
    expect(ensureDeletedEntityMissing(overview, "group", "router-a")).toBe(false);
    expect(ensureDeletedEntityMissing(overview, "group", "router-b")).toBe(true);
  });
});
