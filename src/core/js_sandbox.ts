/**
 * JS 沙箱执行环境
 * @description 提供安全的 JS 代码执行环境，支持文件读写限制
 * @module js_sandbox
 */

import vm from "vm";
import fs from "fs";
import path from "path";

/**
 * 沙箱执行配置
 */
export interface SandboxConfig {
  /** 最大执行时间（毫秒），默认 60000 */
  timeout?: number;
  /** 允许的文件目录，默认 ./file */
  allowedDir?: string;
  /** 是否允许网络请求，默认 false */
  allowNetwork?: boolean;
  /** 网络请求允许的域名白名单，allowNetwork 为 true 时生效 */
  allowedDomains?: string[];
}

/**
 * 沙箱执行结果
 */
export interface SandboxResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

/**
 * 文件系统接口（受限）
 */
interface RestrictedFS {
  readFile(filePath: string): string;
  writeFile(filePath: string, content: string): void;
  exists(filePath: string): boolean;
  listDir(dirPath: string): string[];
}

/**
 * 创建受限的文件系统接口
 * @param allowedDir 允许访问的目录
 */
function createRestrictedFS(allowedDir: string): RestrictedFS {
  const resolvePath = (filePath: string): string => {
    const resolved = path.resolve(allowedDir, filePath);
    // 防止目录穿越
    if (!resolved.startsWith(path.resolve(allowedDir))) {
      throw new Error("Access denied: path traversal detected");
    }
    return resolved;
  };

  return {
    readFile(filePath: string): string {
      const fullPath = resolvePath(filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      return fs.readFileSync(fullPath, "utf-8");
    },

    writeFile(filePath: string, content: string): void {
      const fullPath = resolvePath(filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, "utf-8");
    },

    exists(filePath: string): boolean {
      const fullPath = resolvePath(filePath);
      return fs.existsSync(fullPath);
    },

    listDir(dirPath: string): string[] {
      const fullPath = resolvePath(dirPath);
      if (!fs.existsSync(fullPath)) {
        return [];
      }
      return fs.readdirSync(fullPath);
    },
  };
}

/**
 * 受限的网络请求接口
 */
interface RestrictedFetch {
  (url: string, options?: RequestInit): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
    headers: Map<string, string>;
  }>;
}

/**
 * 创建受限的 fetch 函数
 * @param allowedDomains 允许访问的域名列表，为空则允许所有域名
 */
function createRestrictedFetch(allowedDomains: string[]): RestrictedFetch {
  return async (url: string, options?: RequestInit) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // 检查域名白名单
    if (allowedDomains.length > 0) {
      const hostname = parsedUrl.hostname;
      const isAllowed = allowedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        throw new Error(`Domain not allowed: ${hostname}`);
      }
    }

    // 执行请求
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "SimpleAPIPool-JS-Sandbox/1.0",
        ...options?.headers,
      },
    });

    // 返回受限的响应对象
    const headers = new Map<string, string>();
    response.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: () => response.json(),
      text: () => response.text(),
      headers,
    };
  };
}

/**
 * JS 沙箱执行器
 * @description 提供安全的 JS 代码执行环境
 */
export class JsSandbox {
  private timeout: number;
  private allowedDir: string;
  private allowNetwork: boolean;
  private allowedDomains: string[];

  constructor(config: SandboxConfig = {}) {
    this.timeout = config.timeout ?? 60000;
    this.allowedDir = path.resolve(config.allowedDir ?? "./file");
    this.allowNetwork = config.allowNetwork ?? false;
    this.allowedDomains = config.allowedDomains ?? [];
  }

  /**
   * 执行 JS 代码
   * @param code JS 代码字符串
   * @param args 函数参数
   * @returns 执行结果
   */
  async execute(code: string, args: Record<string, unknown> = {}): Promise<SandboxResult> {
    const startTime = Date.now();

    try {
      // 创建受限的文件系统
      const fsApi = createRestrictedFS(this.allowedDir);

      // 创建受限的 fetch（如果允许网络）
      const networkApi = this.allowNetwork
        ? createRestrictedFetch(this.allowedDomains)
        : undefined;

      // 创建沙箱上下文
      const sandbox: vm.Context = vm.createContext({
        // 参数
        args,
        // 受限文件系统
        fs: fsApi,
        // 受限网络访问（仅当 allowNetwork 为 true 时）
        fetch: networkApi,
        // 允许的安全全局对象
        JSON,
        Math,
        Date,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Map,
        Set,
        RegExp,
        Error,
        TypeError,
        RangeError,
        // 禁止的对象（显式 undefined）
        console: undefined,
        XMLHttpRequest: undefined,
        WebSocket: undefined,
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        process: undefined,
        require: undefined,
        module: undefined,
        global: undefined,
      });

      // 包装代码为异步函数
      const wrappedCode = `
        (async () => {
          ${code}
        })()
      `;

      // 执行代码
      const script = new vm.Script(wrappedCode, {
        filename: "sandbox.js",
      });

      const result = await script.runInContext(sandbox, {
        timeout: this.timeout,
        displayErrors: true,
      });

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 验证代码安全性
   * @param code JS 代码
   * @returns 是否安全
   */
  validateCode(code: string): { safe: boolean; issues: string[] } {
    const issues: string[] = [];

    // 检查禁止的 API
    const forbiddenPatterns = [
      { pattern: /\bprocess\b/g, message: "禁止使用 process" },
      { pattern: /\brequire\s*\(/g, message: "禁止使用 require" },
      { pattern: /\beval\s*\(/g, message: "禁止使用 eval" },
      { pattern: /\bFunction\s*\(/g, message: "禁止使用 Function 构造函数" },
      { pattern: /\bimport\s+/g, message: "禁止使用 import" },
      { pattern: /\bexport\s+/g, message: "禁止使用 export" },
      { pattern: /__proto__/g, message: "禁止使用 __proto__" },
      { pattern: /constructor\s*\(/g, message: "禁止使用 constructor" },
    ];

    for (const { pattern, message } of forbiddenPatterns) {
      if (pattern.test(code)) {
        issues.push(message);
      }
    }

    return {
      safe: issues.length === 0,
      issues,
    };
  }
}
