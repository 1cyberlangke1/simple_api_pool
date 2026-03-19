/**
 * JsToolStore 单元测试
 * @description 测试 JS 工具存储
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JsToolStore } from "../src/core/js_tool_store.js";
import fs from "fs";

const TEST_DB = "./config/test_js_tools.sqlite";

describe("JsToolStore", () => {
  let store: JsToolStore;

  beforeAll(() => {
    // 删除旧测试数据库
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    store = new JsToolStore(TEST_DB);
  });

  afterAll(() => {
    store.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });

  describe("create", () => {
    it("should create a tool", () => {
      const tool = store.create({
        name: "add_numbers",
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number", description: "First number" },
            b: { type: "number", description: "Second number" },
          },
          required: ["a", "b"],
        },
        code: "return args.a + args.b;",
      });

      expect(tool.id).toBeDefined();
      expect(tool.name).toBe("add_numbers");
      expect(tool.description).toBe("Add two numbers");
      expect(tool.enabled).toBe(true);
      expect(tool.createdAt).toBeGreaterThan(0);
    });

    it("should generate unique IDs", () => {
      const tool1 = store.create({
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      const tool2 = store.create({
        name: "tool2",
        description: "Tool 2",
        inputSchema: { type: "object" },
        code: "return 2;",
      });

      expect(tool1.id).not.toBe(tool2.id);
    });
  });

  describe("getById", () => {
    it("should get a tool by ID", () => {
      const created = store.create({
        name: "get_by_id_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 'test';",
      });

      const found = store.getById(created.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe("get_by_id_test");
    });

    it("should return null for non-existent ID", () => {
      const found = store.getById("non_existent_id");
      expect(found).toBeNull();
    });
  });

  describe("getByName", () => {
    it("should get a tool by name", () => {
      store.create({
        name: "unique_name_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      const found = store.getByName("unique_name_test");
      expect(found).not.toBeNull();
      expect(found?.name).toBe("unique_name_test");
    });

    it("should return null for non-existent name", () => {
      const found = store.getByName("non_existent_name");
      expect(found).toBeNull();
    });
  });

  describe("getAll", () => {
    it("should get all tools", () => {
      const all = store.getAll();
      expect(all.length).toBeGreaterThan(0);
    });

    it("should filter by enabled status", () => {
      // 创建一个禁用的工具
      const created = store.create({
        name: "disabled_tool_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });
      store.update(created.id, { enabled: false });

      const enabledOnly = store.getAll(true);
      expect(enabledOnly.every((t) => t.enabled)).toBe(true);
    });
  });

  describe("update", () => {
    it("should update tool description", () => {
      const created = store.create({
        name: "update_desc_test",
        description: "Original",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      const updated = store.update(created.id, { description: "Updated" });
      expect(updated?.description).toBe("Updated");
    });

    it("should update tool code", () => {
      const created = store.create({
        name: "update_code_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      const updated = store.update(created.id, { code: "return 2;" });
      expect(updated?.code).toBe("return 2;");
    });

    it("should update tool enabled status", () => {
      const created = store.create({
        name: "update_enabled_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      const updated = store.update(created.id, { enabled: false });
      expect(updated?.enabled).toBe(false);
    });

    it("should return null for non-existent ID", () => {
      const updated = store.update("non_existent_id", { description: "Test" });
      expect(updated).toBeNull();
    });

    it("should update updatedAt timestamp", async () => {
      const created = store.create({
        name: "update_timestamp_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      await new Promise((r) => setTimeout(r, 10));

      const updated = store.update(created.id, { description: "Updated" });
      expect(updated?.updatedAt).toBeGreaterThan(created.createdAt);
    });
  });

  describe("delete", () => {
    it("should delete a tool", () => {
      const created = store.create({
        name: "delete_test",
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      const deleted = store.delete(created.id);
      expect(deleted).toBe(true);

      const found = store.getById(created.id);
      expect(found).toBeNull();
    });

    it("should return false for non-existent ID", () => {
      const deleted = store.delete("non_existent_id");
      expect(deleted).toBe(false);
    });
  });

  describe("persistence", () => {
    it("should persist data across connections", () => {
      const name = "persistence_test_" + Date.now();
      const created = store.create({
        name,
        description: "Test",
        inputSchema: { type: "object" },
        code: "return 1;",
      });

      store.close();

      // 重新打开
      const newStore = new JsToolStore(TEST_DB);
      const found = newStore.getByName(name);
      expect(found).not.toBeNull();
      expect(found?.description).toBe("Test");

      newStore.close();
      
      // 恢复 store 供后续测试
      store = new JsToolStore(TEST_DB);
    });
  });
});
