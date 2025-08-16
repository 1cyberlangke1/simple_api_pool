import OpenAI from "openai";
import fs from "fs";
import express from "express";
import tools from "./tool_functions.js";

/**
 * 查询类API, 可以提供更多的上下文信息（如名称、用途描述），便于LLM理解并决定是否调用
 * Qwen生成
 * @class query_api
 */
class query_api {
  /**
   * API 的名称，用于标识和展示（例如：天气查询、用户信息获取）
   * @type {string}
   */
  name = "";

  /**
   * API 的功能描述，主要供 LLM 理解其用途（例如：根据城市ID查询实时天气情况）
   * @type {string}
   */
  description = "";

  /**
   * API 的完整基础 URL（不包含查询参数）
   * @type {string}
   */
  url = "";

  /**
   * 请求参数（会自动编码并拼接到 URL 查询字符串中）
   * 只有非 null/undefined 的值会被发送
   * @type {Object}
   */
  params = {};

  /**
   * 自定义请求头（如认证 Token、User-Agent 等）
   * @type {Object}
   */
  headers = {};

  /**
   * 构造函数：初始化一个查询类 API 实例
   * @param {string} name - API 名称
   * @param {string} description - API 功能描述（推荐给 LLM 阅读）
   * @param {string} url - API 基础 URL（如：https://api.example.com/v1/data）
   * @param {Object} [params={}] - 默认请求参数
   * @param {Object} [headers={}] - 自定义请求头
   */
  constructor(name, description, url, params = {}, headers = {}) {
    Object.assign(this, { name, description, url, params, headers });
  }

  /**
   * 发起 GET 请求调用 API
   * @async
   * @returns {Promise<Object>} 返回解析后的 JSON 数据
   * @throws {Error} 网络错误或 JSON 解析失败时抛出
   */
  async call_api() {
    const url = new URL(this.url);
    Object.entries(this.params)
      .filter(([_, v]) => v != null)
      .forEach(([k, v]) => url.searchParams.append(k, v));

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...this.headers },
    });
    return await response.json();
  }
}

/**
 *
 * API的"源泉", 从这里开始管理Key
 * @class api_source
 */
class api_source {
  // 是否输出log到终端
  static is_output_log = true;
  static output_method = console.log;
  // 别名 , {"url" : string, "key" : string, "model"(模型) : string, "limit"调用次数限制(如果为负数就是无限调用) : num, "count"已经调用的次数 : num}
  static #keys = new Map();
  // key , 别名
  static #key_to_alias = new Map();
  // 别名生成
  static #gen_alias = 0;
  // key是否被使用
  static #is_key_using_set = new Set();

  /**
   * 添加API Key
   * @param {string} url - API服务地址
   * @param {string} key - API密钥
   * @param {string} model - 模型名称
   * @param {number} [limit=-1] - 调用次数限制，负数表示无限制
   * @param {string} [alias] - 密钥别名，未提供时自动生成
   * @description 自动生成的别名为"key_数字"
   * @memberof api_source
   */
  static add_api_key(url, key, model, limit = -1, alias) {
    if (alias == null) alias = "key_" + ++this.#gen_alias;
    this.#key_to_alias.set(key, alias);

    if (this.is_output_log) {
      this.output_method(`ADD KEY ${alias} | ${model} ${url} ${key} ${limit < 0 ? "inf" : limit}`);
    }

    this.#keys.set(alias, {
      model: model,
      url: url,
      key: key,
      limit: limit,
      count: 0,
    });
  }

  /**
   * 读取指定别名的API Key信息
   * @param {string} alias - API Key别名
   * @returns {Object|null} 返回Key对象副本，不存在则返回null
   *   对象包含: {model, url, key, limit, count}
   * @memberof api_source
   */
  static read_api_key(alias) {
    const obj = this.#keys.get(alias);

    if (this.is_output_log) {
      this.output_method(`READ KEY ${JSON.stringify(obj)}`);
    }

    if (!obj) return null;
    return { ...obj };
  }

  /**
   * 根据别名获取并占用API Key，同时增加调用次数
   * @param {string} alias - API Key别名
   * @returns {Object|null} 获取成功返回Key对象，否则返回null
   *   返回对象包含: {url, key, model, limit, count, alias}
   *   失败原因：别名不存在、Key已被占用、已达到调用配额上限
   * @memberof api_source
   */
  static get_api_key(alias) {
    const obj = this.#keys.get(alias);
    if (!obj) return null;
    if (this.#is_key_using_set.has(alias)) return null;
    if (obj.limit >= 0 && obj.count >= obj.limit) return null;
    this.#is_key_using_set.add(alias);
    ++obj.count;

    if (this.is_output_log) this.output_method(`SUCCESS GET KEY ${JSON.stringify(obj)}`);

    return obj;
  }

  /**
   * 根据别名释放API Key
   * @param {string} alias - 要释放的API Key别名
   * @returns {boolean} 释放成功返回true，否则false
   * @memberof api_source
   */
  static free_api_key(alias) {
    if (this.is_output_log) this.output_method(`SUCCESS FREE KEY ${alias}`);

    return this.#is_key_using_set.delete(alias);
  }

  /**
   * 判断指定别名的API Key是否正在使用
   * @param {string} alias - API Key别名
   * @returns {boolean} 正在使用返回true，否则false
   * @memberof api_source
   */
  static is_key_using(alias) {
    const res = this.#is_key_using_set.has(alias);

    if (this.is_output_log) this.output_method(`IS KEY USING: ${res}`);

    return res;
  }

  /**
   * 重置所有API Key的调用计数
   * 将所有Key的使用次数重置为0
   * @memberof api_source
   */
  static reset_keys_count() {
    if (this.is_output_log) this.output_method(`RESET ALL KEY COUNT`);

    this.#keys.forEach((value) => {
      value.count = 0;
    });
  }

  /**
   * 从JSON数组读取API密钥信息
   * @param {Array<Object>} json - 密钥配置数组，元素格式：
   *   { url: string, key: string, model: string, limit?: number, alias?: string }
   *   limit为调用次数限制，负数表示无限调用
   * @memberof api_source
   */
  static read_key_json(json) {
    for (const entry of json) {
      const { url, key, model, limit = -1, alias } = entry;
      this.add_api_key(url, key, model, limit, alias);
    }
  }

  /**
   * 从JSON文件读取API密钥信息
   * @param {string} file_path - JSON文件路径
   * @memberof api_source
   */
  static read_key_json_file(file_path) {
    const data = fs.readFileSync(file_path, "utf8");
    const json = JSON.parse(data);
    this.read_key_json(json);
  }

  /**
   * 列出所有API密钥
   * 返回密钥对象的副本，若启用日志则记录操作
   * @returns {Object} API密钥对象，格式为 {key: value}
   * @memberof api_source
   */
  static list_api_keys() {
    const res = Object.fromEntries(this.#keys);

    if (this.is_output_log) this.output_method(`LIST ALL KEY: ${JSON.stringify(res)}`);

    return res;
  }
}
/**
 *
 * OPENAI API池子, 一个API池子最好只对应一种模型
 * @class api_pool
 */
class api_pool {
  limit_keys = []; // 有限调用key
  limit_keys_index = 0;
  keys = []; // 无限调用key
  keys_index = 0;
  name = ""; // 池子的名字, 同时也是服务传的模型名字
  timeout = 0; // 超时时间默认90000, 单位是毫秒

  /**
   * 构造函数
   * @param {Array<string>} keys - API密钥别名数组
   * @param {string} [name="pool"] - 池名称
   * @param {number} [timeout=90000] - 请求超时时间(毫秒)
   * @description
   * 将密钥分为两类：无限次使用的加入keys数组，有限制的加入limit_keys数组
   * 自动过滤null，若启用日志则输出池信息
   * @memberof api_pool
   */
  constructor(keys, name = "pool", timeout = 60000) {
    this.name = name;
    this.timeout = timeout;
    for (let it of keys) {
      let true_key = api_source.read_api_key(it);
      if (true_key == null) continue;
      if (true_key.limit < 0) this.keys.push(it);
      else this.limit_keys.push(it);
    }

    if (api_source.is_output_log) {
      api_source.output_method(`API POOL[${name}]:`);
      api_source.output_method("LIMIT KEYS: " + this.limit_keys);
      api_source.output_method("KEYS: " + this.keys);
    }
  }

  /**
   * 调用LLM
   * 轮询获取可用API密钥，优先使用有限制的密钥，然后是无限次密钥
   * @param {Object} [in_config={}] - 请求配置
   * @param {Array<Object>} [in_config.messages] - 对话消息数组
   * @param {number} [in_config.temperature] - 温度
   * @returns {Promise<Object>} OpenAI格式的响应对象
   * @throws {Error} 当无可用密钥或API调用失败时抛出错误
   * @memberof api_pool
   */
  async call_openai_chat(in_config = {}) {
    const default_config = {
      messages: [],
      temperature: 0.7,
      max_tokens: 2000,
      top_p: 1,
      frequency_penalty: 0.2,
      presence_penalty: 0,
    };
    const config = { ...default_config, ...in_config };

    let alias = null;
    let true_key = null;
    // 先拿有限的
    for (let i = 0; i < this.limit_keys.length; ++i) {
      const now_alias = this.limit_keys[this.limit_keys_index];
      const now_true_key = api_source.get_api_key(now_alias);
      this.limit_keys_index = (this.limit_keys_index + 1) % this.limit_keys.length;
      if (now_true_key !== null) {
        alias = now_alias;
        true_key = now_true_key;
        break;
      }
    }
    // 再拿无限的
    if (alias === null) {
      for (let i = 0; i < this.keys.length; ++i) {
        const now_alias = this.keys[this.keys_index];
        const now_true_key = api_source.get_api_key(now_alias);
        this.keys_index = (this.keys_index + 1) % this.keys.length;
        if (now_true_key !== null) {
          alias = now_alias;
          true_key = now_true_key;
          break;
        }
      }
    }
    if (alias === null) throw new Error("not available key");
    if (api_source.is_output_log) {
      api_source.output_method(`API POOL[${this.name}]: NOW USEING ${alias}`);
    }
    // 让我们开始调用
    const openai = new OpenAI({
      baseURL: true_key.url,
      apiKey: true_key.key,
      timeout: this.timeout,
    });
    try {
      config.model = true_key.model;
      //! 测试用, 记得注释掉
      //console.log(JSON.stringify(config.messages));
      const res = await openai.chat.completions.create(config);
      if (api_source.is_output_log) {
        api_source.output_method(
          `API POOL[${this.name}] TEMP: ${config.temperature} RES: [${JSON.stringify(res)}]`
        );
      }
      return res;
    } catch (error) {
      throw error;
    } finally {
      //一定要
      api_source.free_api_key(alias);
    }
  }
}

/**
 *
 * 假API, 能像api_pool一样被调用
 * @class fake_api
 */
class fake_api {
  name = ""; // 名字
  return_strs = []; // 返回的字符串们
  return_strs_index = 0;

  /**
   * 创建一个fake_api实例
   * @param {Array<string>} [return_strs=[]] 假API会返回的字符串
   * @param {string} [name="fake_api"] api(模型)名字
   * @memberof fake_api
   */
  constructor(return_strs = [], name = "fake_api") {
    this.return_strs = return_strs;
    this.name = name;

    if (api_source.is_output_log) {
      api_source.output_method(`FAKE API[${name}]:`);
      api_source.output_method("RETURN STRING: " + this.return_strs);
    }
  }

  /**
   *
   * 假API, 返回固定的字符串, 就是这样
   * @return {*}
   * @memberof fake_api
   */
  async call_openai_chat() {
    const content = this.return_strs[(this.return_strs_index + 1) % this.return_strs.length];
    try {
      const res = {
        id: `chatcmpl-${Math.random().toString(36).substring(2, 12)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: this.name,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: content,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      };
      if (api_source.is_output_log) {
        api_source.output_method(`FAKE API [${this.name}] RES: [${JSON.stringify(res)}]`);
      }
      return res;
    } catch (error) {
      throw error;
    }
  }
}
/*
  config = {
    add_timestamp: boolean, // 是否在系统提示词注入时间戳,
    web_summary:{ //网页总结
      enable: boolean, // 是否开启
      summary_pool: api_pool, // 总结用的API池子, 没有写就不总结
      jina_ai_config: {
      }, //jina_ai的设置
    },
    hook_request:{ // 拦截出现特定关键词的请求, 并由特定API池子处理
      enable: boolean, // 是否开启
      keywords: [{keywords: Array<String>, process_pool: api_pool, temperature: 0.2}, ...], // 关键词, 和对应的池子
    },
    query_apis:{ // 调用API给LLM提供信息
      enable: boolean, // 是否开启
      apis: Map<query_api>, // 提供的API
    }, // 对话时 使用 --xxx 调用对应的API结果

  }
*/
class api_server {
  default_pool = null; // 默认调用池子，如果没写或者模型名字不存在就调用它
  port = 0; // 端口
  host = ""; // 主机
  pool_map = null; // 池子的映射
  server = null; // 外部服务提供
  config = null; // 额外设置，比如是否在系统提示词里面加入时间戳

  /**
   * 创建一个api_server实例
   * @param {Array<api_pool>} pool_array API池子的数组
   * @param {Object} [config={}] - 服务器配置
   * @param {string} [host="127.0.0.1"]  主机
   * @param {number} [port=3000]   端口
   * @memberof api_server
   */
  constructor(pool_array, config = {}, host = "127.0.0.1", port = 3000) {
    const default_config = {
      add_timestamp: false,
      web_summary: {
        enable: false,
        summary_pool: null,
        delay: 3000, // 请求延时
        jina_ai_config: {},
      },
    };
    this.config = {
      ...default_config,
      ...config,
      web_summary: {
        ...default_config.web_summary,
        ...(config.web_summary || {}),
      },
    };
    this.default_pool = pool_array[0];
    this.port = port;
    this.host = host;
    this.pool_map = new Map();
    for (let it of pool_array) {
      this.pool_map.set(it.name, it);
    }
  }

  /**
   *
   * 启动服务器, Qwen生成了框架
   * @return {*}
   * @memberof api_server
   */
  start_server() {
    const app = express();

    // 中间件
    app.use(express.json({ limit: "50mb" }));

    // 健康
    app.get("/health", (req, res) => {
      let obj = {};
      this.pool_map.forEach((value, key) => {
        obj[key] = value;
      });
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        pools: JSON.stringify(obj),
      });
    });

    // OpenAI 兼容接口
    app.post("/v1/chat/completions", async (req, res) => {
      if (!req.body?.messages?.length) {
        return res.status(400).json({ error: "bad" });
      }
      const isStream = !!req.body.stream;
      req.body.stream = false;
      try {
        let call_pool = this.pool_map.get(req.body.model);
        if (call_pool === undefined) {
          call_pool = this.default_pool;
          if (api_source.is_output_log)
            api_source.output_method(
              `SERVER @${this.host}:${this.port}: UNKNOW MODEL, USE DEFAULT POOL`
            );
        }
        req.body.model = call_pool.name;

        // 加入时间戳
        if (this.config.add_timestamp && req.body?.messages[0]?.role === "system") {
          req.body.messages[0].content = tools.add_timestamp_prefix(req.body.messages[0].content);
          if (api_source.is_output_log) {
            api_source.output_method(
              `SERVER @${this.host}:${this.port}: ADD TIMESTAMP: ${tools.add_timestamp_prefix()}`
            );
          }
        }

        // 用户输入网页总结
        if (this?.config?.web_summary?.enable && req.body?.messages?.at(-1)?.role === "user") {
          const user_msg = req.body.messages.at(-1);
          const web_sum = await tools.web_summary(
            user_msg.content,
            this.config.web_summary.summary_pool,
            this.config.web_summary.jina_ai_config,
            this.config.web_summary.delay
          );
          if (web_sum !== null && api_source.is_output_log) {
            api_source.output_method(
              `SERVER @${this.host}:${this.port}: SUMMARY_WEB_RES: ${web_sum.slice(0, 500) + "..."}`
            );
            user_msg.content = user_msg.content + "\n" + web_sum;
          }
        }

        // 用户输入请求拦截
        if (
          this?.config?.hook_request?.enable &&
          this?.config?.hook_request?.keywords?.length &&
          req.body?.messages?.at(-1)?.role === "user"
        ) {
          const user_msg = req.body.messages.at(-1);
          let flag = false; //是否匹配到了
          for (let it of this.config.hook_request.keywords) {
            for (let keystr of it.keywords) {
              flag = user_msg.content.includes(keystr);
              if (flag) {
                call_pool = it.process_pool;
                req.body.temperature = it.temperature || 0.7;
                if (api_source.is_output_log) {
                  api_source.output_method(
                    `SERVER @${this.host}:${this.port}: HOOK KEYWORD: ${keystr}, USE API POOL: ${call_pool.name}, TEMP: ${req.body.temperature}`
                  );
                }
                break;
              }
            }
            if (flag) break;
          }
        }

        // 查询API调用
        if (
          this?.config?.query_apis?.enable &&
          this?.config?.query_apis?.api?.size &&
          req.body?.messages?.at(-1)?.role === "user"
        ) {
          const user_msg = req.body.messages.at(-1);
          const commands = tools.extract_command(user_msg.content);
          let res = "以下是API调用结果\n";
          let is_call = false;
          if (commands.length && api_source.is_output_log) {
            api_source.output_method(`SERVER @${this.host}:${this.port}: get_command: ${commands}`);
          }
          for (let it of commands) {
            const now_query_api = this.config.query_apis.api.get(it);
            if (now_query_api) {
              let api_res = await now_query_api.call_api();
              res += `API name:${now_query_api.name}\nAPI result:${JSON.stringify(api_res)}\n`;
              is_call = true;
            }
          }
          if (is_call) {
            user_msg.content = user_msg.content + "\n" + res;
            if (api_source.is_output_log) {
              api_source.output_method(
                `SERVER @${this.host}:${this.port}: API_CALL_RES: ${res.slice(0, 500) + "..."}`
              );
            }
          }
        }

        const result = await call_pool.call_openai_chat(req.body);
        if (isStream) {
          // 设置流式响应头
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no"); // 防止 Nginx 缓冲

          const content = result.choices[0].message.content;
          const id = result.id;
          const model = result.model;
          const created = Math.floor(Date.now() / 1000);

          // 逐字符发送
          for (const char of content) {
            const chunk = {
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  delta: { content: char },
                  index: 0,
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }

          // 发送结束包
          const done = {
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                delta: {},
                index: 0,
                finish_reason: "stop",
              },
            ],
          };
          res.write(`data: ${JSON.stringify(done)}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.json(result);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: errorMessage });
      }
    });

    // 可用模型兼容
    app.get("/v1/models", async (req, res) => {
      try {
        const models = [];
        for (const [modelId, pool] of this.pool_map) {
          models.push({
            id: pool.name,
            object: "model",
          });
        }
        res.json({
          object: "list",
          data: models,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: errorMessage });
      }
    });

    this.server = app.listen(this.port, this.host, () => {
      if (api_source.is_output_log) {
        api_source.output_method(`START SERVER @${this.host}:${this.port}`);
      }
    });

    process.on("SIGTERM", () => this.close_server());

    return this.server;
  }

  /**
   *
   * 停止服务器
   * @memberof api_server
   */
  close_server() {
    if (this.server) {
      this.server.close(() => {
        if (api_source.is_output_log) {
          api_source.output_method(`CLOSE SERVER @${this.host}:${this.port}`);
        }
        this.server = null;
      });
    }
  }
}

export default { query_api, api_source, api_pool, fake_api, api_server };
