import simple_api_pool from "./index.js";
import keys from "./setting.js";
import cron from "node-cron";

// 初始化池子
simple_api_pool.api_source.read_key_json(keys.setting);
simple_api_pool.api_source.read_key_json(keys.summary_models);

const alias_array = [];
for (let i = 1; i <= keys.setting.length; ++i) {
  alias_array.push("key_" + i);
}

const summary_alias_array = [];
for (let i = 1; i <= keys.summary_models.length; ++i) {
  summary_alias_array.push("key_" + (i + keys.setting.length));
}

const pool = new simple_api_pool.api_pool(alias_array, "deepseek-v3");
const summary_pool = new simple_api_pool.api_pool(
  summary_alias_array,
  "GLM-Z1-9B-0414"
);
const server = new simple_api_pool.api_server([pool], {
  add_timestamp: true,
  web_summary: {
    enable: true,
    summary_pool: summary_pool,
    jina_ai_config: {
      "x-no-cache": "false", // 是否使用缓存
      "x-engine": "direct", // browser / direct
    },
  },
});

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
