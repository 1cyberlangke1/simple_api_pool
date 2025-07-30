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
      this.output_method(`SUEECES GET KEY ${JSON.stringify(obj)}`);

    return obj;
  }

  // 根据别名释放API Key
  static free_api_key(alias) {
    if (this.is_output_log) this.output_method(`SUEECES FREE KEY ${alias}`);

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
  limit_keys = []; //有限调用key
  limit_keys_index = 0;
  keys = []; //无限调用key
  keys_index = 0;
  name; //池子的名字, 没什么用
  server = null; //外部服务提供

  // 构造函数
  constructor(keys, name = "pool") {
    this.name = name;
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
  async call_openai_chat(
    message,
    temperature = 0.7,
    max_tokens = 2000,
    top_p = 1,
    frequency_penalty = 0.2,
    presence_penalty = 0
  ) {
    let alias = null;
    let true_key = null;
    // 先拿有限的
    for (let i = 0; i < this.limit_keys.length; ++i) {
      const now_alias = this.limit_keys[this.limit_keys_index];
      const now_true_key = api_source.get_api_key(now_alias);
      if (now_true_key !== null) {
        alias = now_alias;
        true_key = now_true_key;
        break;
      }
      this.limit_keys_index =
        (this.limit_keys_index + 1) % this.limit_keys.length;
    }
    // 再拿无限的
    if (alias === null) {
      for (let i = 0; i < this.keys.length; ++i) {
        const now_alias = this.keys[this.keys_index];
        const now_true_key = api_source.get_api_key(now_alias);
        if (now_true_key !== null) {
          alias = now_alias;
          true_key = now_true_key;
          break;
        }
        this.keys_index = (this.keys_index + 1) % this.keys.length;
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
    });
    try {
      const res = await openai.chat.completions.create({
        model: true_key.model,
        messages: message,
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        stream: false,
      });
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

  //启动对外服务, qwen生成
  start_server(port = 3000, host = "127.0.0.1") {
    const app = express();

    // 最简中间件
    app.use(express.json());

    // 健康检查：只返回是否存活 + key 数量
    app.get("/health", (req, res) => {
      res.json({
        pool: this.name,
        status: "ok",
        keys: this.limit_keys.length + this.keys.length,
      });
    });

    // OpenAI 兼容接口：完全代理，无需 model
    app.post("/v1/chat/completions", async (req, res) => {
      if (!req.body?.messages?.length) {
        return res.status(400).json({ error: "bad" });
      }
      const isStream = !!req.body.stream;
      try {
        const result = await this.call_openai_chat(
          req.body.messages,
          req.body.temperature ?? 0.7,
          req.body.max_tokens ?? 2000,
          req.body.top_p ?? 1,
          req.body.frequency_penalty ?? 0.2,
          req.body.presence_penalty ?? 0
        );
        if (isStream) {
          // ✅ 设置流式响应头
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
            // 可选：加个小延迟，模拟真实流速
            await new Promise((r) => setTimeout(r, 10));
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
        // 统一错误，不暴露细节
        res.status(500).json({ error: "fail" });
      }
    });

    this.server = app.listen(port, host, () => {
      if (api_source.is_output_log) {
        api_source.output_method(
          `START SERVER [${this.name}] @${host}:${port}`
        );
      }
    });

    process.on("SIGTERM", () => this.closeServer());

    return this.server;
  }

  //停止对外服务
  close_server() {
    if (this.server) {
      this.server.close(() => {
        if (api_source.is_output_log) {
          api_source.output_method(`CLOSE SERVER [${this.name}]`);
        }
        this.server = null;
      });
    }
  }
}

module.exports = { api_source, api_pool };
