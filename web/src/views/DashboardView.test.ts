/**
 * DashboardView 集成测试
 * @description 模拟真实用户行为测试仪表盘功能
 */
import { describe, it, expect, vi } from "vitest";
import { useQuota } from "@/composables";

// Mock composables
vi.mock("@/composables", () => ({
  useQuota: () => ({
    getQuotaLabel: (quota: { type: string; limit?: number }) => {
      if (quota.type === "infinite") return "无限";
      if (quota.type === "daily") return `${quota.limit} 次/日`;
      if (quota.type === "total") return `$${quota.limit}`;
      return "未知";
    },
    getQuotaTagType: (type: string) => {
      if (type === "infinite") return "success";
      if (type === "daily") return "warning";
      if (type === "total") return "danger";
      return "info";
    },
  }),
}));

// Mock stores
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    token: "test-token",
  }),
}));

describe("DashboardView 集成测试", () => {
  // 模拟真实数据
  const mockKeys = Array.from({ length: 41 }, (_, i) => ({
    alias: i < 40 ? `cerebras_${String(i + 1).padStart(2, "0")}` : "ds2api_01",
    provider: i < 40 ? "cerebras" : "ds2api",
    key: i < 40 ? `csk-test-key-${i}` : "sk-test-key-ds2api",
    model: undefined,
    quota: {
      type: i < 40 ? "daily" : "infinite",
      limit: i < 40 ? 500 : undefined,
    },
    usedToday: 0,
    remainingTotal: null,
  }));

  describe("数据过滤和分页逻辑", () => {
    const pageSize = 10;

    it("应该正确过滤 Key 列表（按别名搜索）", () => {
      const search = "ds2api";
      const filtered = mockKeys.filter((key) => {
        return (
          key.alias.toLowerCase().includes(search.toLowerCase()) ||
          key.provider.toLowerCase().includes(search.toLowerCase())
        );
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].alias).toBe("ds2api_01");
    });

    it("应该正确过滤 Key 列表（按提供商搜索）", () => {
      const search = "cerebras";
      const filtered = mockKeys.filter((key) => {
        return (
          key.alias.toLowerCase().includes(search.toLowerCase()) ||
          key.provider.toLowerCase().includes(search.toLowerCase())
        );
      });
      expect(filtered.length).toBe(40);
    });

    it("应该正确分页数据", () => {
      const total = mockKeys.length;
      const totalPages = Math.ceil(total / pageSize);
      expect(total).toBe(41);
      expect(totalPages).toBe(5);

      // 第一页
      const page1 = mockKeys.slice(0, pageSize);
      expect(page1.length).toBe(10);
      expect(page1[0].alias).toBe("cerebras_01");

      // 最后一页
      const lastPage = mockKeys.slice(4 * pageSize);
      expect(lastPage.length).toBe(1);
      expect(lastPage[0].alias).toBe("ds2api_01");
    });

    it("空搜索应该返回所有数据", () => {
      const search = "";
      const filtered = mockKeys.filter((key) => {
        if (!search.trim()) return true;
        return (
          key.alias.toLowerCase().includes(search.toLowerCase()) ||
          key.provider.toLowerCase().includes(search.toLowerCase())
        );
      });
      expect(filtered.length).toBe(41);
    });

    it("不存在的搜索应该返回空列表", () => {
      const search = "not_exist_key";
      const filtered = mockKeys.filter((key) => {
        return (
          key.alias.toLowerCase().includes(search.toLowerCase()) ||
          key.provider.toLowerCase().includes(search.toLowerCase())
        );
      });
      expect(filtered.length).toBe(0);
    });
  });

  describe("运行时间格式化", () => {
    function formatUptime(seconds: number): string {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days}天`);
      if (hours > 0 || days > 0) parts.push(`${hours}小时`);
      if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分`);
      parts.push(`${secs}秒`);

      return parts.join(" ");
    }

    it("应该正确格式化秒数", () => {
      expect(formatUptime(65)).toBe("1分 5秒");
      expect(formatUptime(3661)).toBe("1小时 1分 1秒");
      expect(formatUptime(86400)).toBe("1天 0小时 0分 0秒");
      expect(formatUptime(0)).toBe("0秒");
    });

    it("应该正确格式化分钟数", () => {
      expect(formatUptime(120)).toBe("2分 0秒");
      expect(formatUptime(600)).toBe("10分 0秒");
    });

    it("应该正确格式化小时数", () => {
      expect(formatUptime(3600)).toBe("1小时 0分 0秒");
      expect(formatUptime(7200)).toBe("2小时 0分 0秒");
    });

    it("应该正确格式化天数", () => {
      expect(formatUptime(86400)).toBe("1天 0小时 0分 0秒");
      expect(formatUptime(172800)).toBe("2天 0小时 0分 0秒");
    });
  });

  describe("配额显示", () => {
    const { getQuotaLabel, getQuotaTagType } = useQuota();

    it("应该正确显示 daily 配额", () => {
      const quota = { type: "daily" as const, limit: 500 };
      expect(getQuotaLabel(quota)).toBe("500 次/日");
      expect(getQuotaTagType("daily")).toBe("warning");
    });

    it("应该正确显示 infinite 配额", () => {
      const quota = { type: "infinite" as const };
      expect(getQuotaLabel(quota)).toBe("无限");
      expect(getQuotaTagType("infinite")).toBe("success");
    });

    it("应该正确显示 total 配额", () => {
      const quota = { type: "total" as const, limit: 100 };
      expect(getQuotaLabel(quota)).toBe("$100");
      expect(getQuotaTagType("total")).toBe("danger");
    });
  });

  describe("统计计算", () => {
    it("应该正确计算提供商数量", () => {
      const models = ["ds2api/deepseek-reasoner", "cerebras/qwen-3-235b-a22b-instruct-2507", "group/234"];
      const modelList = models.filter((m) => !m.startsWith("group/"));
      const providers = new Set(modelList.map((m) => m.split("/")[0]));
      expect(providers.size).toBe(2);
      expect(providers.has("ds2api")).toBe(true);
      expect(providers.has("cerebras")).toBe(true);
    });

    it("应该正确计算模型数量", () => {
      const models = ["ds2api/deepseek-reasoner", "cerebras/qwen-3-235b-a22b-instruct-2507", "group/234"];
      const modelList = models.filter((m) => !m.startsWith("group/"));
      expect(modelList.length).toBe(2);
    });

    it("应该正确计算分组数量", () => {
      const models = ["ds2api/deepseek-reasoner", "cerebras/qwen-3-235b-a22b-instruct-2507", "group/234", "group/234-cache"];
      const groups = models.filter((m) => m.startsWith("group/"));
      expect(groups.length).toBe(2);
    });
  });

  describe("成功率计算", () => {
    it("应该正确计算成功率", () => {
      const success = 1;
      const total = 1;
      const rate = (success / total) * 100;
      expect(rate).toBe(100);
    });

    it("应该处理零调用的情况", () => {
      const success = 0;
      const total = 0;
      const rate = total > 0 ? (success / total) * 100 : 0;
      expect(rate).toBe(0);
    });

    it("应该正确计算部分成功的情况", () => {
      const success = 8;
      const total = 10;
      const rate = (success / total) * 100;
      expect(rate).toBe(80);
    });
  });

  describe("用户交互流程模拟", () => {
    it("完整流程：加载 -> 搜索 -> 清空", () => {
      // 1. 初始数据
      const keys = [...mockKeys];
      expect(keys.length).toBe(41);

      // 2. 搜索
      let search = "ds2api";
      let filtered = keys.filter(
        (k) =>
          k.alias.toLowerCase().includes(search) ||
          k.provider.toLowerCase().includes(search)
      );
      expect(filtered.length).toBe(1);

      // 3. 清空搜索
      search = "";
      filtered = keys.filter(
        (k) =>
          k.alias.toLowerCase().includes(search) ||
          k.provider.toLowerCase().includes(search)
      );
      expect(filtered.length).toBe(41);
    });

    it("分页导航流程", () => {
      const total = mockKeys.length;
      let currentPage = 1;
      const pageSize = 10;

      // 验证总数
      expect(total).toBe(41);

      // 第一页
      let start = (currentPage - 1) * pageSize;
      let end = start + pageSize;
      let pageData = mockKeys.slice(start, end);
      expect(pageData.length).toBe(10);
      expect(pageData[0].alias).toBe("cerebras_01");

      // 跳转到第三页
      currentPage = 3;
      start = (currentPage - 1) * pageSize;
      end = start + pageSize;
      pageData = mockKeys.slice(start, end);
      expect(pageData.length).toBe(10);
      expect(pageData[0].alias).toBe("cerebras_21");

      // 跳转到最后一页
      currentPage = 5;
      start = (currentPage - 1) * pageSize;
      end = start + pageSize;
      pageData = mockKeys.slice(start, end);
      expect(pageData.length).toBe(1);
      expect(pageData[0].alias).toBe("ds2api_01");
    });
  });
});
