const OpenAI = require("openai");
const fs = require("fs");
const express = require("express");
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

  // 添加key
  static add_api_key(url, key, model, limit = -1, alias) {
    let now_alias = this.#key_to_alias.get(key);
    if (now_alias !== undefined) {
      this.#keys.delete(now_alias);
      this.#key_to_alias.delete(key);
    }
    if (alias == null) alias = "key_" + ++this.#gen_alias;
    this.#key_to_alias.set(key, alias);

    if (this.is_output_log) {
      this.output_method(
        `ADD KEY ${alias} | ${model} ${url} ${key} ${limit < 0 ? "inf" : limit}`
      );
    }

    this.#keys.set(alias, {
      model: model,
      url: url,
      key: key,
      limit: limit,
      count: 0,
    });
  }

  // 读取key
  static read_api_key(alias) {
    const obj = this.#keys.get(alias);

    if (this.is_output_log) {
      this.output_method(`READ KEY ${JSON.stringify(obj)}`);
    }

    if (!obj) return null;
    return { ...obj };
  }

  // 根据别名获取并占用API Key同时调用次数直接+1, 如果到配额上限或者被占用就返回null
  static get_api_key(alias) {
    const obj = this.#keys.get(alias);
    if (!obj) return null;
    if (this.#is_key_using_set.has(alias)) return null;
    if (obj.limit >= 0 && obj.count >= obj.limit) return null;
    this.#is_key_using_set.add(alias);
    ++obj.count;

    if (this.is_output_log)
      this.output_method(`SUCCESS GET KEY ${JSON.stringify(obj)}`);

    return obj;
  }

  // 根据别名释放API Key
  static free_api_key(alias) {
    if (this.is_output_log) this.output_method(`SUCCESS FREE KEY ${alias}`);

    return this.#is_key_using_set.delete(alias);
  }

  // 根据别名key判断是否被正在使用
  static is_key_using(alias) {
    const res = this.#is_key_using_set.has(alias);

    if (this.is_output_log) this.output_method(`IS KEY USING: ${res}`);

    return res;
  }

  // 重置所有key的使用次数
  static reset_keys_count() {
    if (this.is_output_log) this.output_method(`RESET ALL KEY COUNT`);

    this.#keys.forEach((value) => {
      value.count = 0;
    });
  }

  // 从obj读入, 传入[{"url" : string, "key" : string, "model" : string,调用次数限制(如果为负数就是无限调用) : num, "alias": 别名}, ...]
  static read_key_json(json) {
    for (const entry of json) {
      const { url, key, model, limit = -1, alias } = entry;
      this.add_api_key(url, key, model, limit, alias);
    }
  }

  //从文件读入
  static read_key_json_file(file_path) {
    const data = fs.readFileSync(file_path, "utf8");
    const json = JSON.parse(data);
    this.read_key_json(json);
  }

  //列出keys
  static list_api_keys() {
    const res = Object.fromEntries(this.#keys);

    if (this.is_output_log)
      this.output_method(`LIST ALL KEY: ${JSON.stringify(res)}`);

    return res;
  }
}

class api_pool {
  limit_keys = []; // 有限调用key
  limit_keys_index = 0;
  keys = []; // 无限调用key
  keys_index = 0;
  name; // 池子的名字, 同时也是服务传的模型名字
  timeout = 0; // 超时时间默认30, 单位是毫秒
  // 构造函数
  constructor(keys, name = "pool", timeout = 30000) {
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
  // 调用LLM
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
      this.limit_keys_index =
        (this.limit_keys_index + 1) % this.limit_keys.length;
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
      // 测试用, 记得注释掉
      console.log(JSON.stringify(config.messages));
      const res = await openai.chat.completions.create(config);
      if (api_source.is_output_log) {
        api_source.output_method(
          `API POOL[${this.name}] RES: [${JSON.stringify(res)}]`
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

/*
  config = {
    add_timestamp: 是否在系统提示词注入时间戳
  }
*/
class api_server {
  default_pool = null; // 默认调用池子，如果没写或者模型名字不存在就调用它
  port = 0; // 端口
  host = ""; // 地址
  pool_map = null; // 池子的映射
  server = null; // 外部服务提供
  config = null; // 额外设置，比如是否在系统提示词里面加入时间戳
  // 构造函数
  constructor(pool_array, config = {}, host = "127.0.0.1", port = 3000) {
    const default_config = {
      add_timestamp: false,
    };
    this.config = { ...default_config, ...config };
    this.default_pool = pool_array[0];
    this.port = port;
    this.host = host;
    this.pool_map = new Map();
    for (let it of pool_array) {
      this.pool_map.set(it.name, it);
    }
  }

  // 启动对外服务, qwen生成
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
            console.log(
              `SERVER @${this.host}:${this.port}: UNKNOW MODEL, USE DEFAULT POOL`
            );
        }
        req.body.model = call_pool.name;
        // 加入时间戳
        if (
          this.config.add_timestamp &&
          req.body?.messages[0]?.role === "system"
        ) {
          const system_prompt = req.body.messages[0].content;
          const now_time_str = new Date().toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            weekday: "long",
          });
          req.body.messages[0].content = now_time_str + "\n" + system_prompt;
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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

  //停止对外服务
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

module.exports = { api_source, api_pool, api_server };
