# 使用指南

本文档只处理一件事：服务已经启动后，怎么完成初始化、怎么配置提供商与分组、怎么发代理请求。

## 先理解三种密钥

项目里常见的密钥有三种，角色不同：

- `ADMIN_KEY`：管理员密钥，用于登录 `/admin` 和调用管理接口
- `CLIENT_KEYS`：客户端访问密钥，用于业务方调用代理接口
- 上游供应商 key：例如 OpenAI、Claude、Gemini 的真实 API key，由你导入到某个提供商下面

可以把它理解成三层：

1. `ADMIN_KEY` 管理整个系统
2. `CLIENT_KEYS` 控制谁能使用你的代理
3. 上游 key 负责真正请求外部模型服务

## 推荐使用顺序

1. 确认服务已经启动并能访问 `/api/health`
2. 打开 `/admin`，输入管理员密钥登录
3. 配置全局参数，例如客户端 key 和 Token 估算开关
4. 新增一个提供商
5. 给这个提供商导入一个或多个上游 key
6. 需要逻辑路由时，再新增一个分组
7. 用客户端 key 调用代理入口
8. 到 `/status` 查看成功率、错误率、Token 和缓存统计

## 页面入口

- `/status`：公开状态页，不需要登录
- `/admin`：管理页，需要管理员密钥

## 浏览器方式初始化

### 1. 打开管理页

```text
http://127.0.0.1:18080/admin
```

输入你在环境变量里设置的 `ADMIN_KEY`。

### 2. 设置全局配置

至少确认：

- 管理员密钥是否正确
- 是否需要启用客户端访问密钥
- 是否开启 Token 估算

如果你希望代理入口也带访问控制，先配置至少一个客户端 key。

### 3. 新增提供商

至少要填写：

- 提供商名称
- 提供商类型
- 上游基础地址
- key 策略

一个最简单的 `OpenAI Chat` 示例：

- 名称：`openai`
- 类型：`openai_chat`
- 地址：`https://api.openai.com`

### 4. 导入上游 key

支持的批量格式：

- 每行一个
- 半角逗号分隔
- 混合空格

例如：

```text
sk-a
sk-b
sk-c
```

或者：

```text
sk-a, sk-b, sk-c
```

### 5. 新增分组

如果你希望对外暴露一个稳定路由名，但内部可以在多个 provider 之间调度，可以在管理页的 `Groups` 标签中创建分组。

分组有几个关键概念：

- `group`：对外路由名，例如 `router`
- `collection`：逻辑模型名，例如 `chat-router`
- `entry`：真正访问的 provider、model 和 base URL

下游请求里填写的 `model` 不是上游真实模型名，而是 `collection.name`。命中 collection 后，系统会用 entry 配置的真实 `model` 和 `base_url` 覆写上游请求。

常见用法：

- `weighted_random`
  - 在同一个集合内按权重随机挑一个 entry
- `failover`
  - 按优先级依次尝试 entry，前一个失败时再继续下一个

### 6. 调用代理接口

如果你新增的是 `openai`，那入口就是：

```text
http://127.0.0.1:18080/openai/...
```

如果你新增的是名为 `router` 的分组，那入口就是：

```text
http://127.0.0.1:18080/router/...
```

如果你给系统配置了客户端 key，调用时要带：

```text
Authorization: Bearer <CLIENT_KEY>
```

## API 方式初始化

### 管理接口鉴权

所有管理接口都需要：

```text
Authorization: Bearer <ADMIN_KEY>
```

常用管理接口如下：

- `POST /api/admin/login`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `GET /api/admin/providers`
- `POST /api/admin/providers`
- `DELETE /api/admin/providers/{name}`
- `POST /api/admin/providers/{name}/keys`
- `DELETE /api/admin/providers/{name}/{key}`
- `GET /api/admin/groups`
- `POST /api/admin/groups`
- `GET /api/admin/groups/{name}`
- `DELETE /api/admin/groups/{name}`

### 1. 先验证管理员密钥

```bash
curl -X POST http://127.0.0.1:18080/api/admin/login \
  -H "Authorization: Bearer admin-demo"
```

### 2. 设置全局配置

```bash
curl -X PUT http://127.0.0.1:18080/api/admin/config \
  -H "Authorization: Bearer admin-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "admin_key": "admin-demo",
    "token_estimation_enabled": true,
    "client_keys": ["client-demo"]
  }'
```

### 3. 新增提供商

```bash
curl -X POST http://127.0.0.1:18080/api/admin/providers \
  -H "Authorization: Bearer admin-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "openai",
    "type": "openai_chat",
    "base_url": "https://api.openai.com",
    "key_strategy": "round_robin",
    "fail_threshold": 3,
    "min_disable_secs": 30,
    "max_disable_secs": 3600,
    "cache_enabled": true,
    "cache_max_entries": 1000
  }'
```

字段说明：

- `name`：代理入口名称，同时也会出现在 `/status` 和 `/admin`
- `type`：提供商类型
- `base_url`：上游基础地址
- `key_strategy`：`round_robin` 或 `fill`
- `fail_threshold`：连续失败多少次后禁用该 key
- `min_disable_secs`：最小禁用时长
- `max_disable_secs`：最大禁用时长
- `cache_enabled`：是否启用该提供商的缓存入口
- `cache_max_entries`：该提供商缓存条目上限

提供商名称需要注意两点：

- 必须唯一
- 不能使用保留名称 `api`、`cache`、`status`、`admin` 和 `assets`

### 4. 导入上游 key

```bash
curl -X POST http://127.0.0.1:18080/api/admin/providers/openai/keys \
  -H "Authorization: Bearer admin-demo" \
  -H "Content-Type: application/json" \
  -d '{"keys":"sk-a\nsk-b\nsk-c"}'
```

也可以使用逗号分隔：

```bash
curl -X POST http://127.0.0.1:18080/api/admin/providers/openai/keys \
  -H "Authorization: Bearer admin-demo" \
  -H "Content-Type: application/json" \
  -d '{"keys":"sk-a, sk-b, sk-c"}'
```

### 5. 读取当前配置

读取全局配置：

```bash
curl http://127.0.0.1:18080/api/admin/config \
  -H "Authorization: Bearer admin-demo"
```

读取提供商列表：

```bash
curl http://127.0.0.1:18080/api/admin/providers \
  -H "Authorization: Bearer admin-demo"
```

### 6. 新增分组

下面示例创建一个名为 `router` 的 `OpenAI Chat` 分组。它对外暴露的逻辑模型名是 `chat-router`，实际会转发到两个 provider：

```bash
curl -X POST http://127.0.0.1:18080/api/admin/groups \
  -H "Authorization: Bearer admin-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "router",
    "type": "openai_chat",
    "cache_enabled": true,
    "cache_max_entries": 1000,
    "collections": [
      {
        "name": "chat-router",
        "strategy": "failover",
        "entries": [
          {
            "provider": "openai-a",
            "model": "gpt-4.1",
            "base_url": "https://api.openai.com",
            "weight": 1,
            "priority": 1
          },
          {
            "provider": "openai-b",
            "model": "gpt-4.1-mini",
            "base_url": "https://api.openai.com",
            "weight": 1,
            "priority": 2
          }
        ]
      }
    ]
  }'
```

字段说明：

- `name`：分组路由名，对外路径就是 `/{name}` 和 `/cache/{name}`
- `type`：分组绑定的 provider 类型；分组内所有 entry 指向的 provider 都必须是同类型
- `cache_enabled`：是否启用分组自己的缓存入口
- `cache_max_entries`：分组缓存条目上限
- `collections[].name`：逻辑模型名，下游请求体里的 `model` 需要填写这个值
- `collections[].strategy`：`weighted_random` 或 `failover`
- `entries[].provider`：要复用哪个已有 provider 的 key 池
- `entries[].model`：真正写给上游的模型名
- `entries[].base_url`：真正访问的上游地址；留空时默认复用 provider 自己的 `base_url`
- `entries[].weight`：加权随机时使用的权重，必须是正整数
- `entries[].priority`：故障转移时使用的优先级，数值越小越先尝试

分组名称也必须全局唯一，不能和已有 provider、其他 group 或保留名称重复。

读取分组列表：

```bash
curl http://127.0.0.1:18080/api/admin/groups \
  -H "Authorization: Bearer admin-demo"
```

读取单个分组：

```bash
curl http://127.0.0.1:18080/api/admin/groups/router \
  -H "Authorization: Bearer admin-demo"
```

### 7. 删除提供商、分组或单个 key

删除整个提供商：

```bash
curl -X DELETE http://127.0.0.1:18080/api/admin/providers/openai \
  -H "Authorization: Bearer admin-demo"
```

如果某个提供商仍被分组引用，删除会失败，需要先调整或删除对应分组。

删除某一个上游 key：

```bash
curl -X DELETE http://127.0.0.1:18080/api/admin/providers/openai/sk-a \
  -H "Authorization: Bearer admin-demo"
```

删除整个分组：

```bash
curl -X DELETE http://127.0.0.1:18080/api/admin/groups/router \
  -H "Authorization: Bearer admin-demo"
```

## 代理接口总览

如果你配置了客户端访问密钥，代理请求需要：

```text
Authorization: Bearer <CLIENT_KEY>
```

代理入口有两类：

- `/{routeName}/...`：普通代理入口
- `/cache/{routeName}/...`：缓存代理入口

这里的 `routeName` 可以是 provider 名，也可以是 group 名。

示例路径：

- `/openai/v1/chat/completions`
- `/responses/v1/responses`
- `/claude/v1/messages`
- `/gemini/v1beta/models/gemini-2.5-flash:generateContent`
- `/router/v1/chat/completions`

调用时有几个要点：

- 后缀路径会继续透传给上游
- 查询参数会继续透传给上游
- 请求体按下游官方格式原样传入
- 多模态消息不会被改写
- 如果命中的是 group，请求体里的 `model` 应填写逻辑模型名，也就是 collection 名
- group 会在转发前覆写上游 `model` 和 `base_url`
- Gemini 类型的 group 还会同步改写路径里的模型名

## 代理请求示例

### OpenAI Chat

```bash
curl -X POST http://127.0.0.1:18080/openai/v1/chat/completions \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {"role": "system", "content": "你是助手"},
      {"role": "user", "content": "介绍一下你自己"}
    ]
  }'
```

### OpenAI Chat 多模态

```bash
curl -X POST http://127.0.0.1:18080/openai/v1/chat/completions \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "图里有什么？"},
          {"type": "image_url", "image_url": {"url": "https://example.com/cat.png"}}
        ]
      }
    ]
  }'
```

### OpenAI Responses

```bash
curl -X POST http://127.0.0.1:18080/responses/v1/responses \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "input": [
      {
        "role": "user",
        "content": [
          {"type": "input_text", "text": "概括这张图"},
          {"type": "input_image", "image_url": "https://example.com/cat.png"}
        ]
      }
    ]
  }'
```

### Claude

```bash
curl -X POST http://127.0.0.1:18080/claude/v1/messages \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-0",
    "max_tokens": 512,
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "请描述图片内容"},
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAAAAUA"
            }
          }
        ]
      }
    ]
  }'
```

### Gemini

```bash
curl -X POST http://127.0.0.1:18080/gemini/v1beta/models/gemini-2.5-flash:generateContent \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "contents": [
      {
        "role": "user",
        "parts": [
          {"text": "这张图里有什么？"},
          {
            "inline_data": {
              "mime_type": "image/png",
              "data": "ZmFrZQ=="
            }
          }
        ]
      }
    ]
  }'
```

### Group 路由

下面示例假设已经存在一个 `OpenAI Chat` 分组 `router`，其中集合名为 `chat-router`：

```bash
curl -X POST http://127.0.0.1:18080/router/v1/chat/completions \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat-router",
    "messages": [
      {"role": "user", "content": "走分组逻辑路由"}
    ]
  }'
```

如果这个 group 的 `type` 是 `gemini`，除了请求体里的 `model` 外，路径中的模型段也会按选中的 entry 一起改写。
