# Simple API Pool

一个面向多供应商大模型接口的轻量中间件。

它的职责只有几类：

- 直接透传下游请求
- 轮询或填充上游 key
- 处理客户端 key 和管理员 key
- 记录统计
- 提供可选硬盘缓存

当前支持：

- `OpenAI Chat`
- `OpenAI Responses`
- `Claude`
- `Gemini`

## 功能概览

- 代理入口：`/{provider}/...`
- 缓存入口：`/cache/{provider}/...`
- 后缀路径和查询参数直接透传
- 请求体原样转发，不改写消息结构
- 多模态输入直接透传，数组内容允许任意结构
- 缓存键兼容多模态消息结构
- 流式与非流式请求可共用同一份缓存
- 前后端同容器交付
- 默认端口：`18080`
- 默认 `GOMEMLIMIT`：`32MiB`

## 目录结构

```text
backend/        Go 后端
backend/tests/  后端测试
frontend/       状态页和管理页
data/           运行时数据目录
```

## 部署教程

这一节只处理“把服务部署起来”。

### 部署方式

当前仓库推荐两种方式：

1. 使用 Docker Compose 本地构建部署
2. 本机直接运行 Go 后端

### 环境准备

#### 方式一：本机运行

需要：

- Go 运行环境
- 可写目录，用于保存 `data/`

#### 方式二：Docker Compose

需要：

- Docker
- Docker Compose

### 部署前要知道的事

- 服务默认监听 `18080`
- 如果没有显式设置 `GOMEMLIMIT`，程序默认按 `32MiB` 运行内存上限启动
- 首次启动前，需要先提供管理员密钥
- 管理员密钥可以通过环境变量 `ADMIN_KEY` 提供
- 如果配置了客户端访问密钥，代理请求必须带 `Authorization: Bearer <CLIENT_KEY>`
- 项目不提供 Nginx 配置文件，反向代理由你自己决定
- 仓库根目录提供了环境变量示例文件 `.env.example`

### 方式一：本机直接部署

#### 1. 进入后端目录

```bash
cd backend
```

#### 2. 提供管理员密钥并启动

Linux / macOS:

```bash
ADMIN_KEY=admin-demo go run .
```

PowerShell:

```powershell
$env:ADMIN_KEY="admin-demo"
go run .
```

启动后默认监听：

```text
http://127.0.0.1:18080
```

#### 3. 验证服务是否在线

```bash
curl http://127.0.0.1:18080/api/health
```

期望返回：

```json
{"status":"ok"}
```

### 方式二：Docker Compose 本地构建部署

#### 1. 在仓库根目录准备环境变量

Linux / macOS:

```bash
export ADMIN_KEY=admin-demo
docker compose up --build -d
```

PowerShell:

```powershell
$env:ADMIN_KEY="admin-demo"
docker compose up --build -d
```

#### 2. 验证健康状态

```bash
curl http://127.0.0.1:18080/api/health
```

#### 3. 查看页面

- 状态页：`http://127.0.0.1:18080/status`
- 管理页：`http://127.0.0.1:18080/admin`

#### 4. 停止服务

```bash
docker compose down
```

### 部署后的数据位置

#### 本机运行

运行数据会写到仓库根目录下的：

```text
data/
```

#### Docker Compose

容器内数据目录：

```text
/app/data
```

Compose 中已经挂载卷：

```text
app-data
```

### 常用环境变量

- `ADMIN_KEY`：管理员密钥
- `CLIENT_KEYS`：客户端访问密钥，多个值用半角逗号分隔
- `PORT`：监听端口，默认 `18080`
- `GOMEMLIMIT`：Go 运行时内存限制，默认 `32MiB`

### 升级部署

如果你更新了代码并重新部署，Docker 方式可以直接执行：

```bash
docker compose down
docker compose up --build -d
```

如果你关心历史配置和统计，升级前建议先备份 `data/` 或 Docker 卷里的数据。

## 使用教程

这一节只处理“服务已经启动后，怎么配置和调用”。

### 使用流程

推荐按这个顺序使用：

1. 准备管理员密钥
2. 登录管理页或调用管理接口
3. 配置全局参数
4. 新增提供商
5. 导入上游 key
6. 用客户端 key 发起代理请求
7. 查看状态页和缓存统计

### 页面入口

- `/status`：公开状态页
- `/admin`：管理页

### 管理接口总览

所有管理接口都需要：

```text
Authorization: Bearer <ADMIN_KEY>
```

- `POST /api/admin/login`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `GET /api/admin/providers`
- `POST /api/admin/providers`
- `DELETE /api/admin/providers/{name}`
- `POST /api/admin/providers/{name}/keys`
- `DELETE /api/admin/providers/{name}/{key}`

### 代理接口总览

如果你配置了客户端访问密钥，代理请求需要：

```text
Authorization: Bearer <CLIENT_KEY>
```

代理入口：

- `/{provider}/...`
- `/cache/{provider}/...`

示例路径：

- `/openai/v1/chat/completions`
- `/responses/v1/responses`
- `/claude/v1/messages`
- `/gemini/v1beta/models/gemini-2.5-flash:generateContent`

## 初始化配置

### 1. 设置全局配置

这个接口会保存：

- 管理员密钥
- 客户端访问密钥
- Token 估算开关

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

### 2. 新增提供商

下面是一个 `OpenAI Chat` 提供商示例：

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

- `name`：代理入口名称
- `type`：提供商类型
- `base_url`：上游地址
- `key_strategy`：`round_robin` 或 `fill`
- `fail_threshold`：连续失败阈值
- `min_disable_secs`：最小禁用时长
- `max_disable_secs`：最大禁用时长
- `cache_enabled`：是否启用缓存
- `cache_max_entries`：该提供商缓存条目上限

### 3. 导入上游 key

支持：

- 每行一个
- 半角逗号分隔
- 夹杂空格

```bash
curl -X POST http://127.0.0.1:18080/api/admin/providers/openai/keys \
  -H "Authorization: Bearer admin-demo" \
  -H "Content-Type: application/json" \
  -d '{"keys":"sk-a\nsk-b\nsk-c"}'
```

### 4. 读取当前配置

```bash
curl http://127.0.0.1:18080/api/admin/providers \
  -H "Authorization: Bearer admin-demo"
```

## 代理请求示例

这些示例的重点是：请求体按照下游官方格式原样传入。

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

## 缓存使用教程

### 什么时候用缓存入口

如果某个提供商启用了缓存，你可以把普通代理入口：

```text
/{provider}/...
```

换成：

```text
/cache/{provider}/...
```

如果这个提供商没有启用缓存，那么 `/cache/{provider}/...` 的行为等同于普通代理入口。

### 缓存命中规则

当前缓存键按提供商类型提取核心消息字段：

- `OpenAI Chat`：`model + messages`
- `Claude`：`model + messages`
- `OpenAI Responses`：`model + input`
- `Gemini`：`model + contents`

当前缓存键不包含 `routeKey`，也不包含其他生成参数。

这意味着下面两类请求会命中同一份缓存：

- `stream` 和 `stream_options` 不同
- 其他非核心参数不同，但 `model + 消息主体` 一致

### 非流式缓存示例

```bash
curl -X POST http://127.0.0.1:18080/cache/openai/v1/chat/completions \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "缓存测试"}]
  }'
```

### 流式和非流式共用缓存

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

后续非流式请求命中同一份缓存：

```bash
curl -X POST http://127.0.0.1:18080/cache/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent \
  -H "Authorization: Bearer client-demo" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "contents": [{"role": "user", "parts": [{"text": "讲个故事"}]}]
  }'
```

## 状态页和管理页

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

- 浏览器本地保存管理员密钥
- 全局客户端 key 配置
- Token 估算开关
- 提供商新增、修改、删除
- 轮询 / 填充策略配置
- 连续失败阈值和禁用恢复参数配置
- 缓存开关和缓存最大条目数配置
- 批量导入和删除上游 key
- 展示每个 key 的失败次数和当前禁用状态

## 统计与缓存说明

- 成功请求会记录输入 / 输出 Token
- 上游没有返回 Token 时，可按字符串字节数除以 `4` 估算
- 命中缓存时会记录缓存命中次数
- 命中缓存时，返回结果会补充缓存 Token 统计
- 缓存按提供商独立存储为 SQLite 文件，不会为每条记录创建零碎小文件

## 测试

测试统一放在 `backend/tests/`。

当前覆盖重点包括：

- 真实代理路径和查询参数透传
- 上游错误原样透传
- key 轮询、填充、失败禁用和恢复
- 管理接口和配置持久化
- 单提供商单文件缓存
- 流式与非流式缓存共用
- OpenAI Chat / Responses / Claude / Gemini 的 Token 提取
- 多模态请求透传
- 多模态消息参与缓存命中

运行测试：

```bash
cd backend
go test ./...
```
