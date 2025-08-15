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

// 查询API配置
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

// 假API要返回的字符串
const fake_api_strs = ["NOT_TIME_RELATED"];
export default { chat_models, summary_models, query_apis, fake_api_strs };
