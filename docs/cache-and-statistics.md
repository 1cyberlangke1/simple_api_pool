# 缓存与统计说明

本文档说明缓存入口、缓存命中规则、状态页、管理页，以及不同提供商的 Token 统计方式。

## 缓存入口

代理入口有两类：

- `/{routeName}/...`：普通代理入口
- `/cache/{routeName}/...`：缓存代理入口

`routeName` 可以是 provider，也可以是 group。

如果某个路由名没有启用缓存，那么 `/cache/{routeName}/...` 的行为等同于普通代理入口。

## 缓存命中规则

当前缓存键按提供商类型提取核心消息字段：

- `OpenAI Chat`：`model + messages`
- `Claude`：`model + messages`
- `OpenAI Responses`：`model + input`
- `Gemini`：`model + contents`

当前缓存键不包含 `routeKey`，也不包含其他生成参数。

对于 group，还要额外注意两点：

- 缓存命中和写入都落在 group 自己的缓存命名空间，不会写回真实命中的 provider 缓存库
- group 的缓存键使用 group 类型对应的核心消息字段，并基于逻辑模型名计算，不区分本次实际命中的 entry

缓存命中还会区分响应形态：

- 流式请求只命中流式缓存
- 非流式请求只命中非流式缓存
- 其他非核心参数不同，但 `model + 消息主体` 一致时，仍会命中同形态缓存

## 缓存示例

### 非流式缓存

```bash
curl -X POST http://127.0.0.1:18080/cache/openai/v1/chat/completions \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "缓存测试"}]
  }'
```

### 分组缓存

下面示例假设你已经创建了一个名为 `router` 的 group，其中集合名为 `chat-router`：

```bash
curl -X POST http://127.0.0.1:18080/cache/router/v1/chat/completions \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat-router",
    "messages": [{"role": "user", "content": "走分组缓存"}]
  }'
```

这个请求的缓存目录会写到：

```text
data/cache/router/cache.db
```

### 流式和非流式分别缓存

第一次流式请求：

```bash
curl -N -X POST http://127.0.0.1:18080/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "stream": true,
    "contents": [{"role": "user", "parts": [{"text": "讲个故事"}]}]
  }'
```

后续非流式请求不会直接命中这份流式缓存，而是会按非流式形态单独回源并建立自己的缓存：

```bash
curl -X POST http://127.0.0.1:18080/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "contents": [{"role": "user", "parts": [{"text": "讲个故事"}]}]
  }'
```

## 状态页与管理页

### `/status`

无需登录，可查看：

- 成功次数
- 错误次数
- 成功率
- 错误率
- 输入 Token
- 输出 Token
- 缓存 Token
- 缓存命中次数

### `/admin`

需要管理员密钥。支持：

- 浏览器同源 Cookie 会话
- 全局客户端 key 配置
- Token 估算开关
- 提供商新增、修改、删除
- 分组新增、修改、删除
- 轮询 / 填充策略配置
- 连续失败阈值和禁用恢复参数配置
- 缓存开关和缓存最大条目数配置
- 批量导入和删除上游 key
- 展示每个 key 的失败次数和当前禁用状态
- 默认会话有效期为 `24` 小时
- 总览接口支持 ETag 协商缓存，页面刷新时会尽量复用已缓存结果

## Token 统计

- 成功请求会记录输入 / 输出 Token
- 上游没有返回 Token 时，可按字符串字节数除以 `4` 估算
- 命中缓存时会记录缓存命中次数
- 命中缓存时，返回结果会按各提供商官方响应结构补充缓存 Token 字段
- 命中本地硬盘缓存时，缓存 Token 统计按整次响应的 `total token` 计
- 上游如果自带缓存机制，则额外累计它返回的官方缓存 Token 字段

各提供商的缓存 Token 字段：

- `OpenAI Chat`：`usage.prompt_tokens_details.cached_tokens`
- `OpenAI Responses`：`usage.input_tokens_details.cached_tokens`
- `Claude`：`usage.cache_read_input_tokens`
- `Gemini`：`usageMetadata.cachedContentTokenCount > 0` 时，按同一响应里的 `totalTokenCount` 计入缓存 Token；如果缺少总量，再回退到原字段

## 存储与内存边界

- 状态数据统一写入 `data/simple-api-pool.db`
- 缓存按路由名分别写入 `data/cache/<routeName>/cache.db`
- 状态库与缓存库都带有 schema version 元数据，便于后续演进
- 状态数据和缓存数据分离：
  - 状态库负责 provider 配置、group 配置、key 状态、全局配置、统计快照
  - 缓存库只负责对应路由名的响应缓存
- 缓存按路由名独立存储为 SQLite 文件，不会为每条记录创建零碎小文件
- 同一组 `model + 核心消息字段` 的流式响应和非流式响应会分别占用独立缓存条目
- `/cache/...` 请求体只有在不超过 `CACHEABLE_REQUEST_BODY_LIMIT_BYTES` 时才会参与本地缓存判定；默认值是 `524288` 字节
- 非流式上游响应会先按 `UPSTREAM_RESPONSE_LIMIT_BYTES` 作为本地可缓存体上限做探测；在上限内仍按整包路径处理，超过上限时改为直接透传，并放弃依赖完整响应体的缓存和整包后处理
- 流式上游响应只会在累计体积不超过 `CACHEABLE_STREAM_RESPONSE_LIMIT_BYTES` 时尝试写入缓存；超过后继续透传，但放弃缓存
