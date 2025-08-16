// 聊天模型
const chat_models = [
  {
    url: "xxx/v1",
    key: "xxx",
    model: "xxx",
    limit: 1, //大于等于0为有限调用次数, -1为无限
    //alias: "key_001", 别名, 在这里不需要
  },
  {
    url: "xxx/v1",
    key: "xxx1",
    model: "xxx",
    limit: -1, //优先调用有限的, 再调用无限的
  },
];

// 用于总结的模型
// 在网络内容总结中使用
const summary_models = [
  {
    url: "xxx/v1",
    key: "xxx",
    model: "xxx",
    limit: 1, //大于等于0为有限调用次数, -1为无限
    //alias: "key_001", 别名, 在这里不需要
  },
  {
    url: "xxx/v1",
    key: "xxx1",
    model: "xxx",
    limit: -1, //优先调用有限的, 再调用无限的
  },
];

// 拦截请求后处理的API池子
const process_models = [
  {
    url: "xxx/v1",
    key: "xxx",
    model: "xxx",
    limit: 1, //大于等于0为有限调用次数, -1为无限
    //alias: "key_001", 别名, 在这里不需要
  },
  {
    url: "xxx/v1",
    key: "xxx1",
    model: "xxx",
    limit: -1, //优先调用有限的, 再调用无限的
  },
];

// 拦截关键词(用户最新输入)
const hook_keywords = ["__core_memory__"];

// 池子的温度
const hook_models_temperature = 0.2;

// 查询API配置
// 在聊天时在最后输入 --API名字 触发API查询, 会将查询结果塞在用户输入里面发生给LLM
const query_apis = [
  {
    name: "weather", // API名字
    description: "查询天气", // 描述这个API是干什么的
    url: "https://restapi.amap.com/v3/weather/weatherInfo", // API url
    params: {
      key: "xxxx",
      extensions: "all",
      city: "xxx",
    }, // 请求参数
    headers: {}, // 自定义请求头
  },
];

// 假API要返回的字符串, 用来"关掉"kourichat"意图识别"的临时功能
const fake_api_strs = ["NOT_TIME_RELATED"];

// 服务器配置
const server_config = {
  host: "127.0.0.1", // 服务器主机
  port: 3000, // 端口
  add_timestamp: true, // 是否在系统提示词注入时间戳
  web_summary_enable: false, // 是否开启网页总结, true的话要写summary_models
  hook_request_enable: false, // 是否开启请求拦截, true的话要写process_models和拦截关键词
  query_apis_enable: false, // 是否开启查询API
};

export default {
  chat_models,
  summary_models,
  process_models,
  hook_models_temperature,
  hook_keywords,
  query_apis,
  fake_api_strs,
  server_config,
};
