import simple_api_pool from "./index.js";
import setting from "./setting.js";
import cron from "node-cron";

// 初始化池子
simple_api_pool.api_source.read_key_json(setting.chat_models);
simple_api_pool.api_source.read_key_json(setting.summary_models);

const alias_array = [];
for (let i = 1; i <= setting.chat_models.length; ++i) {
  alias_array.push("key_" + i);
}

const summary_alias_array = [];
for (let i = 1; i <= setting.summary_models.length; ++i) {
  summary_alias_array.push("key_" + (i + setting.chat_models.length));
}

const pool = new simple_api_pool.api_pool(alias_array, "chat_model");
const summary_pool = new simple_api_pool.api_pool(summary_alias_array, "summary_model");
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
    simple_api_pool.api_source.reset_setting_count();
    console.log("✅ key 使用次数已重置");
  },
  {
    scheduled: true,
    timezone: "Asia/Shanghai", // 设置为北京时间
  }
);
