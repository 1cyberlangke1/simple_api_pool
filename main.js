const simple_api_pool = require("./index");
const keys = require("./setting");
const cron = require("node-cron");

// 初始化池子
simple_api_pool.api_source.read_key_json(keys.setting);
alias_array = [];
for (let i = 1; i <= keys.setting.length; ++i) {
  alias_array.push("key_" + i);
}
const pool = new simple_api_pool.api_pool(alias_array, "deepseek-v3");
const server = new simple_api_pool.api_server([pool]);

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
