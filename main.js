import simple_api_pool from "./index.js";
import setting from "./setting.js";
import cron from "node-cron";

// 初始化池子
simple_api_pool.api_source.read_key_json(setting.chat_models);
simple_api_pool.api_source.read_key_json(setting.summary_models);
simple_api_pool.api_source.read_key_json(setting.process_models);

const alias_array = [];
const pools_array = [];
if (setting.server_config.multi_pool_enable) {
  let sum = 0;
  for (let it of setting.multi_pool_config) {
    alias_array.length = 0;
    for (let i = 1; i <= it.key_count; ++i) {
      alias_array.push("key_" + (i + sum));
    }
    sum += it.key_count;
    pools_array.push({
      pool: new simple_api_pool.api_pool(alias_array),
      temperature: it.temperature,
    });
    pools_array.at(-1).pool.check_truncated = setting.server_config.check_truncated;
  }
} else {
  for (let i = 1; i <= setting.chat_models.length; ++i) {
    alias_array.push("key_" + i);
  }
}

const summary_alias_array = [];
for (let i = 1; i <= setting.summary_models.length; ++i) {
  summary_alias_array.push("key_" + (i + setting.chat_models.length));
}

const process_alias_array = [];
for (let i = 1; i <= setting.process_models.length; ++i) {
  process_alias_array.push(
    "key_" + (i + setting.chat_models.length + setting.summary_models.length)
  );
}

let pool = null;
if (setting.server_config.multi_pool_enable) {
  pool = new simple_api_pool.multi_pool(pools_array, "chat_model");
} else {
  pool = new simple_api_pool.api_pool(alias_array, "chat_model");
  pool.check_truncated = setting.server_config.check_truncated;
}
const summary_pool = new simple_api_pool.api_pool(summary_alias_array, "summary_model");
const process_pool = new simple_api_pool.api_pool(process_alias_array, "process_model");
const fuck_reminder = new simple_api_pool.fake_api(setting.fake_api_strs, "fuck_reminder");

// 初始化查询API
const query_apis = new Map();
for (let it of setting.query_apis) {
  query_apis.set(
    it.name,
    new simple_api_pool.query_api(it.name, it.description, it.url, it.params, it.headers)
  );
}

const server = new simple_api_pool.api_server(
  [pool, fuck_reminder],
  {
    add_timestamp: setting.server_config.add_timestamp,
    web_summary: {
      enable: setting.server_config.web_summary_enable,
      summary_pool: summary_pool,
      jina_ai_config: {
        "x-no-cache": "true", // 是否不使用缓存
        "x-engine": "direct", // browser / direct
      },
    },
    hook_request: {
      enable: setting.server_config.hook_request_enable,
      keywords: [
        {
          keywords: setting.hook_keywords,
          process_pool: process_pool,
          temperature: setting.hook_models_temperature,
        },
      ],
    },
    query_apis: {
      enable: setting.server_config.query_apis_enable,
      api: query_apis,
    },
  },
  setting.server_config.host,
  setting.server_config.port
);

//启动服务
server.start_server();

// 定时清理调用次数
cron.schedule(
  "0 0 * * *",
  () => {
    console.log("🕒 正在执行每日 key 使用次数重置...");
    simple_api_pool.api_source.reset_keys_count();
    console.log("✅ key 使用次数已重置");
  },
  {
    scheduled: true,
    timezone: "Asia/Shanghai", // 设置为北京时间
  }
);
