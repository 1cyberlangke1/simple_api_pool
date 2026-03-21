/**
 * 文件工具加载器测试
 * @description 测试文件系统工具加载和热重载功能
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { FileToolLoader, JsonToolFile, LoadedFileTool } from "../src/core/file_tool_loader.js";

describe("FileToolLoader", () => {
  let tempDir: string;
  let loader: FileToolLoader;

  // 有效的工具定义模板
  const validTool: JsonToolFile = {
    name: "test_tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
    },
    code: "return { result: args.input };",
  };

  beforeEach(() => {
    // 创建临时目录
    tempDir = path.join(os.tmpdir(), `file-tool-loader-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    loader = new FileToolLoader(tempDir);
  });

  afterEach(() => {
    loader.close();
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("初始化", () => {
    it("创建不存在的工具目录", () => {
      const newDir = path.join(tempDir, "new-tools-dir");
      const newLoader = new FileToolLoader(newDir);
      newLoader.init();

      expect(fs.existsSync(newDir)).toBe(true);
      newLoader.close();
      fs.rmSync(newDir, { recursive: true, force: true });
    });

    it("加载空目录返回空数组", () => {
      loader.init();
      const tools = loader.getAllTools();
      expect(tools).toEqual([]);
    });
  });

  describe("加载工具", () => {
    it("加载有效的工具文件", () => {
      const toolPath = path.join(tempDir, "test_tool.json");
      fs.writeFileSync(toolPath, JSON.stringify(validTool, null, 2));

      loader.init();
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("test_tool");
      expect(tools[0].description).toBe("A test tool");
      expect(tools[0].filePath).toBe(toolPath);
      expect(tools[0].loadedAt).toBeGreaterThan(0);
    });

    it("加载多个工具文件", () => {
      const tool1 = { ...validTool, name: "tool1" };
      const tool2 = { ...validTool, name: "tool2" };

      fs.writeFileSync(path.join(tempDir, "tool1.json"), JSON.stringify(tool1));
      fs.writeFileSync(path.join(tempDir, "tool2.json"), JSON.stringify(tool2));

      loader.init();
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain("tool1");
      expect(tools.map((t) => t.name)).toContain("tool2");
    });

    it("跳过缺少必要字段的工具文件", () => {
      const invalidTool = { name: "invalid" }; // 缺少 description, code, inputSchema
      fs.writeFileSync(path.join(tempDir, "invalid.json"), JSON.stringify(invalidTool));

      loader.init();
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(0);
    });

    it("跳过无效 JSON 文件", () => {
      fs.writeFileSync(path.join(tempDir, "invalid.json"), "not a valid json");

      loader.init();
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(0);
    });

    it("递归加载子目录中的工具", () => {
      const subDir = path.join(tempDir, "subdir");
      fs.mkdirSync(subDir, { recursive: true });

      fs.writeFileSync(path.join(tempDir, "tool1.json"), JSON.stringify({ ...validTool, name: "tool1" }));
      fs.writeFileSync(path.join(subDir, "tool2.json"), JSON.stringify({ ...validTool, name: "tool2" }));

      loader.init();
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(2);
    });

    it("加载带有可选字段的工具", () => {
      const toolWithOptional: JsonToolFile = {
        ...validTool,
        category: "utility",
        tags: ["test", "demo"],
        allowNetwork: true,
        allowedDomains: ["example.com"],
      };
      fs.writeFileSync(path.join(tempDir, "optional.json"), JSON.stringify(toolWithOptional));

      loader.init();
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].category).toBe("utility");
      expect(tools[0].tags).toEqual(["test", "demo"]);
      expect(tools[0].allowNetwork).toBe(true);
      expect(tools[0].allowedDomains).toEqual(["example.com"]);
    });
  });

  describe("获取工具", () => {
    it("getTool 返回指定工具", () => {
      fs.writeFileSync(path.join(tempDir, "test.json"), JSON.stringify(validTool));
      loader.init();

      const tool = loader.getTool("test_tool");

      expect(tool).toBeDefined();
      expect(tool?.name).toBe("test_tool");
    });

    it("getTool 返回 undefined 对于不存在的工具", () => {
      loader.init();
      const tool = loader.getTool("nonexistent");
      expect(tool).toBeUndefined();
    });
  });

  describe("保存工具", () => {
    it("saveToolToFile 创建新文件", () => {
      loader.init();
      const filePath = loader.saveToolToFile(validTool);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempDir, "test_tool.json"));

      // 验证文件内容
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(content.name).toBe("test_tool");
    });

    it("saveToolToFile 更新已存在的工具", () => {
      loader.init();
      loader.saveToolToFile(validTool);

      // 更新工具
      const updatedTool = { ...validTool, description: "Updated description" };
      loader.saveToolToFile(updatedTool);

      const tool = loader.getTool("test_tool");
      expect(tool?.description).toBe("Updated description");
    });

    it("saveToolToFile 更新内存中的工具", () => {
      loader.init();
      loader.saveToolToFile(validTool);

      const tools = loader.getAllTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("test_tool");
    });
  });

  describe("删除工具", () => {
    it("deleteToolFile 删除文件和内存记录", () => {
      loader.init();
      loader.saveToolToFile(validTool);

      const result = loader.deleteToolFile("test_tool");

      expect(result).toBe(true);
      expect(loader.getTool("test_tool")).toBeUndefined();
      expect(fs.existsSync(path.join(tempDir, "test_tool.json"))).toBe(false);
    });

    it("deleteToolFile 对不存在的工具返回 false", () => {
      loader.init();
      const result = loader.deleteToolFile("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("重载工具", () => {
    it("reloadAll 重新加载所有工具", () => {
      // 先保存一个工具
      fs.writeFileSync(path.join(tempDir, "test.json"), JSON.stringify(validTool));
      loader.init();

      // 手动修改文件
      const updatedTool = { ...validTool, description: "Reloaded description" };
      fs.writeFileSync(path.join(tempDir, "test.json"), JSON.stringify(updatedTool));

      // 重载
      loader.reloadAll();

      const tool = loader.getTool("test_tool");
      expect(tool?.description).toBe("Reloaded description");
    });

    it("reloadTool 重载指定工具", () => {
      fs.writeFileSync(path.join(tempDir, "test.json"), JSON.stringify(validTool));
      loader.init();

      // 修改文件
      const updatedTool = { ...validTool, description: "Updated" };
      fs.writeFileSync(path.join(tempDir, "test.json"), JSON.stringify(updatedTool));

      // 等待一下确保 mtime 不同
      const result = loader.reloadTool("test_tool");

      expect(result).toBe(true);
      expect(loader.getTool("test_tool")?.description).toBe("Updated");
    });

    it("reloadTool 对不存在的工具返回 false", () => {
      loader.init();
      const result = loader.reloadTool("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("关闭", () => {
    it("close 清理所有资源", () => {
      fs.writeFileSync(path.join(tempDir, "test.json"), JSON.stringify(validTool));
      loader.init();

      loader.close();

      // 验证资源已清理
      expect(loader.getAllTools()).toHaveLength(0);
    });
  });
});
