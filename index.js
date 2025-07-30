const OpenAI = require("openai");
const fs = require("fs");

class api_source {
  // 是否输出log到终端
  static is_output_log = false;
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
    return obj;
  }

  // 根据别名释放API Key
  static free_api_key(alias) {
    return this.#is_key_using_set.delete(alias);
  }

  // 根据别名key判断是否被正在使用
  static is_key_using(alias) {
    return this.#is_key_using_set.has(alias);
  }

  // 重置所有key的使用次数
  static reset_keys_count() {
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
    return Object.fromEntries(this.#keys);
  }
}

class api_pool {
  limit_keys = [];
  limit_keys_index = 0;
  keys = [];
  keys_index = 0;
  name;

  // 构造函数
  constructor(keys, name = "pool") {
    this.name = name;
    for (let it of keys) {
      let true_key = api_source.read_api_key(it);
      if (true_key == null) continue;
      if (true_key.limit < 0) this.keys.push(it);
      else this.limit_keys.push(it);
    }
  }
  // 开始调用
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
    console.log(this.name + " now call " + alias);
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
      });
      return res;
    } catch (error) {
      throw error;
    } finally {
      //一定要
      api_source.free_api_key(alias);
    }
  }
}

module.exports = { api_source, api_pool };
