const setting = [
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

// 假API要返回的字符串
const fake_api_strs = ["NOT_TIME_RELATED"];
export default { setting, summary_models, fake_api_strs };
