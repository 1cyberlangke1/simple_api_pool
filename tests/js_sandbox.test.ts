/**
 * JsSandbox 单元测试
 * @description 测试 JS 沙箱执行环境
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JsSandbox } from "../src/core/js_sandbox.js";
import fs from "fs";
import path from "path";

const TEST_DIR = "./test_file_dir";

describe("JsSandbox", () => {
  let sandbox: JsSandbox;

  beforeAll(() => {
    // 创建测试目录
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    sandbox = new JsSandbox({
      timeout: 5000,
      allowedDir: TEST_DIR,
    });
  });

  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("execute", () => {
    it("should execute simple code", async () => {
      const result = await sandbox.execute("return 1 + 1;");
      expect(result.success).toBe(true);
      expect(result.result).toBe(2);
    });

    it("should execute code with args", async () => {
      const result = await sandbox.execute("return args.a + args.b;", { a: 1, b: 2 });
      expect(result.success).toBe(true);
      expect(result.result).toBe(3);
    });

    it("should support async code", async () => {
      const result = await sandbox.execute(`
        const value = await Promise.resolve(42);
        return value;
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it("should support JSON operations", async () => {
      const result = await sandbox.execute(`
        const obj = { name: "test", value: 123 };
        return JSON.parse(JSON.stringify(obj));
      `);
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ name: "test", value: 123 });
    });

    it("should support Math operations", async () => {
      const result = await sandbox.execute("return Math.sqrt(16);");
      expect(result.success).toBe(true);
      expect(result.result).toBe(4);
    });

    it("should support Date operations", async () => {
      const result = await sandbox.execute(`
        const d = new Date("2024-01-01");
        return d.getFullYear();
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe(2024);
    });

    it("should support Array operations", async () => {
      const result = await sandbox.execute(`
        const arr = [1, 2, 3, 4, 5];
        return arr.filter(x => x > 2).map(x => x * 2);
      `);
      expect(result.success).toBe(true);
      expect(result.result).toEqual([6, 8, 10]);
    });

    it("should handle errors", async () => {
      const result = await sandbox.execute("throw new Error('test error');");
      expect(result.success).toBe(false);
      expect(result.error).toContain("test error");
    });

    it("should return execution time", async () => {
      const result = await sandbox.execute("return 1;");
      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it("should timeout on infinite loop", async () => {
      const timeoutSandbox = new JsSandbox({ timeout: 100 });
      const result = await timeoutSandbox.execute("while(true) {}");
      expect(result.success).toBe(false);
    }, 10000);
  });

  describe("restricted fs", () => {
    it("should allow reading files in allowed dir", async () => {
      // 创建测试文件
      fs.writeFileSync(path.join(TEST_DIR, "test.txt"), "hello world");

      const result = await sandbox.execute("return fs.readFile('test.txt');");
      expect(result.success).toBe(true);
      expect(result.result).toBe("hello world");
    });

    it("should allow writing files in allowed dir", async () => {
      const result = await sandbox.execute("fs.writeFile('output.txt', 'test content');");
      expect(result.success).toBe(true);

      // 验证文件已创建
      const content = fs.readFileSync(path.join(TEST_DIR, "output.txt"), "utf-8");
      expect(content).toBe("test content");
    });

    it("should check file existence", async () => {
      fs.writeFileSync(path.join(TEST_DIR, "exists.txt"), "content");

      const result = await sandbox.execute(`
        return {
          exists: fs.exists('exists.txt'),
          notExists: fs.exists('nonexistent.txt')
        };
      `);
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ exists: true, notExists: false });
    });

    it("should block path traversal", async () => {
      const result = await sandbox.execute("return fs.readFile('../package.json');");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    it("should block absolute path outside allowed dir", async () => {
      const result = await sandbox.execute("return fs.readFile('/etc/passwd');");
      expect(result.success).toBe(false);
    });
  });

  describe("validateCode", () => {
    it("should accept safe code", () => {
      const result = sandbox.validateCode("return args.a + args.b;");
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should reject process usage", () => {
      const result = sandbox.validateCode("return process.env;");
      expect(result.safe).toBe(false);
      expect(result.issues).toContain("禁止使用 process");
    });

    it("should reject require usage", () => {
      const result = sandbox.validateCode("return require('fs');");
      expect(result.safe).toBe(false);
      expect(result.issues).toContain("禁止使用 require");
    });

    it("should reject eval usage", () => {
      const result = sandbox.validateCode("return eval('1+1');");
      expect(result.safe).toBe(false);
      expect(result.issues).toContain("禁止使用 eval");
    });

    it("should reject Function constructor", () => {
      const result = sandbox.validateCode("return new Function('return 1')();");
      expect(result.safe).toBe(false);
      expect(result.issues).toContain("禁止使用 Function 构造函数");
    });

    it("should reject import statements", () => {
      const result = sandbox.validateCode("import fs from 'fs';");
      expect(result.safe).toBe(false);
      expect(result.issues).toContain("禁止使用 import");
    });

    it("should reject __proto__ access", () => {
      const result = sandbox.validateCode("return {}.__proto__;");
      expect(result.safe).toBe(false);
      expect(result.issues).toContain("禁止使用 __proto__");
    });

    it("should detect multiple issues", () => {
      const result = sandbox.validateCode("return process.env + require('fs');");
      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });
  });
});
