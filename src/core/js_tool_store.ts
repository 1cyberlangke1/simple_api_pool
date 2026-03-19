/**
 * JS 工具存储
 * @description 管理用户自定义 JS 工具的持久化存储
 * @module js_tool_store
 */

import Database from "better-sqlite3";
import type { JSONSchema7 } from "json-schema";

/**
 * 存储的 JS 工具定义
 */
export interface StoredJsTool {
  id: string;
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 创建工具请求
 */
export interface CreateJsToolRequest {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  code: string;
}

/**
 * 更新工具请求
 */
export interface UpdateJsToolRequest {
  name?: string;
  description?: string;
  inputSchema?: JSONSchema7;
  code?: string;
  enabled?: boolean;
}

/**
 * JS 工具存储类
 * @description 使用 SQLite 存储用户自定义 JS 工具
 */
export class JsToolStore {
  private db: Database.Database;

  /**
   * 初始化工具存储
   * @param dbPath 数据库文件路径
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  /**
   * 初始化数据表
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS js_tools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        input_schema TEXT NOT NULL DEFAULT '{}',
        code TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_js_tools_name ON js_tools(name);
      CREATE INDEX IF NOT EXISTS idx_js_tools_enabled ON js_tools(enabled);
    `);
  }

  /**
   * 生成工具 ID
   */
  private generateId(): string {
    return `js_tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 创建工具
   * @param request 创建请求
   * @returns 创建的工具
   */
  create(request: CreateJsToolRequest): StoredJsTool {
    const id = this.generateId();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO js_tools (id, name, description, input_schema, code, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    stmt.run(
      id,
      request.name,
      request.description,
      JSON.stringify(request.inputSchema),
      request.code,
      now,
      now
    );

    return {
      id,
      name: request.name,
      description: request.description,
      inputSchema: request.inputSchema,
      code: request.code,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 获取工具
   * @param id 工具 ID
   * @returns 工具定义或 null
   */
  getById(id: string): StoredJsTool | null {
    const stmt = this.db.prepare(`
      SELECT id, name, description, input_schema, code, enabled, created_at, updated_at
      FROM js_tools
      WHERE id = ?
    `);

    const row = stmt.get(id) as {
      id: string;
      name: string;
      description: string;
      input_schema: string;
      code: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      inputSchema: JSON.parse(row.input_schema) as JSONSchema7,
      code: row.code,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 通过名称获取工具
   * @param name 工具名称
   * @returns 工具定义或 null
   */
  getByName(name: string): StoredJsTool | null {
    const stmt = this.db.prepare(`
      SELECT id, name, description, input_schema, code, enabled, created_at, updated_at
      FROM js_tools
      WHERE name = ?
    `);

    const row = stmt.get(name) as {
      id: string;
      name: string;
      description: string;
      input_schema: string;
      code: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      inputSchema: JSON.parse(row.input_schema) as JSONSchema7,
      code: row.code,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 获取所有工具
   * @param enabledOnly 是否只返回启用的工具
   * @returns 工具列表
   */
  getAll(enabledOnly: boolean = false): StoredJsTool[] {
    const sql = enabledOnly
      ? `SELECT id, name, description, input_schema, code, enabled, created_at, updated_at FROM js_tools WHERE enabled = 1`
      : `SELECT id, name, description, input_schema, code, enabled, created_at, updated_at FROM js_tools`;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as Array<{
      id: string;
      name: string;
      description: string;
      input_schema: string;
      code: string;
      enabled: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      inputSchema: JSON.parse(row.input_schema) as JSONSchema7,
      code: row.code,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * 更新工具
   * @param id 工具 ID
   * @param request 更新请求
   * @returns 更新后的工具或 null
   */
  update(id: string, request: UpdateJsToolRequest): StoredJsTool | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (request.name !== undefined) {
      updates.push("name = ?");
      values.push(request.name);
    }
    if (request.description !== undefined) {
      updates.push("description = ?");
      values.push(request.description);
    }
    if (request.inputSchema !== undefined) {
      updates.push("input_schema = ?");
      values.push(JSON.stringify(request.inputSchema));
    }
    if (request.code !== undefined) {
      updates.push("code = ?");
      values.push(request.code);
    }
    if (request.enabled !== undefined) {
      updates.push("enabled = ?");
      values.push(request.enabled ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    updates.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE js_tools
      SET ${updates.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.getById(id);
  }

  /**
   * 删除工具
   * @param id 工具 ID
   * @returns 是否删除成功
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM js_tools WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}
