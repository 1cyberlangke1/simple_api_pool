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

这一节只处理“把服务稳定部署起来，并且知道怎么验证、查看日志、升级和保留数据”。

### 部署方式

推荐按下面顺序选择：

1. `Docker Compose` 本地构建部署
2. 使用 `GHCR` 已发布镜像部署
3. 本机直接运行 Go 后端

前两种方式都属于 Docker 部署，差别只有一个：

- `Docker Compose 本地构建`：适合你要自己改代码，或者希望直接从当前仓库构建
- `GHCR 镜像部署`：适合你只想启动现成版本，不关心本地构建过程

### 部署前要知道的事

- 服务默认监听 `18080`
- 容器内服务端口也是 `18080`
- 如果没有显式设置 `GOMEMLIMIT`，程序默认按 `32MiB` 运行内存上限启动
- 首次启动前必须先配置 `ADMIN_KEY`
- 如果配置了 `CLIENT_KEYS`，代理请求需要带 `Authorization: Bearer <CLIENT_KEY>`
- 所有运行时数据都会写入 `/app/data`
- 如果你不挂载卷，容器删除后配置、统计和缓存也会一起丢失

### 环境准备

#### Docker 部署需要

- Docker
- Docker Compose V2

可以先执行下面两个命令确认环境正常：

```bash
docker --version
docker compose version
```

#### 本机运行需要

- Go 运行环境
- 可写目录，用于保存 `data/`

### 环境变量说明

仓库根目录提供了示例文件：`.env.example`。

最常用的变量如下：

| 变量名 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_KEY` | 是 | 无 | 管理员密钥，管理页和管理接口都依赖它 |
| `CLIENT_KEYS` | 否 | 空 | 客户端访问密钥，多个值用半角逗号分隔 |
| `PORT` | 否 | `18080` | 服务监听端口 |
| `GOMEMLIMIT` | 否 | `32MiB` | Go 运行时内存限制 |

最小可用配置通常只需要：

```text
ADMIN_KEY=请改成你自己的管理员密钥
```

如果你希望代理入口也带鉴权，再补一行：

```text
CLIENT_KEYS=client-key-1,client-key-2
```

### 方式一：Docker Compose 本地构建部署

这是最适合当前仓库的部署方式。你可以直接用现有的 `docker-compose.yml` 和 `Dockerfile`。

#### 1. 获取代码并进入目录

```bash
git clone https://github.com/1cyberlangke1/simple_api_pool.git
cd simple_api_pool
```

#### 2. 准备环境变量文件

复制示例文件：

```bash
cp .env.example .env
```

然后编辑 `.env`，至少修改：

```text
ADMIN_KEY=改成你自己的管理员密钥
```

如果你希望调用代理接口时必须带客户端密钥，可以同时设置：

```text
CLIENT_KEYS=client-key-1,client-key-2
```

如果你需要改端口或调整内存限制，也可以一起修改：

```text
PORT=18080
GOMEMLIMIT=32MiB
```

#### 3. 启动服务

```bash
docker compose up --build -d
```

首次启动时会执行镜像构建，时间会比后续重启更长。

#### 4. 确认容器已经起来

```bash
docker compose ps
```

你应该能看到 `app` 服务处于运行状态。

#### 5. 查看启动日志

```bash
docker compose logs -f app
```

这里建议直接用 `docker compose logs -f app`，不要自己猜容器名。

当前仓库自带的 `docker-compose.yml` 已经固定容器名为：

```text
simple-api-pool
```

如果你确实要核对容器名，可以先执行：

```bash
docker compose ps
```

如果你只想看最近 100 行：

```bash
docker compose logs --tail=100 app
```

#### 6. 验证健康检查

```bash
curl http://127.0.0.1:18080/api/health
```

期望返回：

```json
{"status":"ok"}
```

#### 7. 打开页面

- 状态页：`http://127.0.0.1:18080/status`
- 管理页：`http://127.0.0.1:18080/admin`

#### 8. 常用运维命令

查看服务状态：

```bash
docker compose ps
```

停止服务：

```bash
docker compose down
```

重启服务：

```bash
docker compose restart app
```

停止后再重新构建启动：

```bash
docker compose down
docker compose up --build -d
```

#### 9. 数据保存位置

当前 Compose 文件已经挂载了命名卷：

```text
app-data
```

容器内对应目录：

```text
/app/data
```

如果你删除容器但不删卷，配置、统计和缓存还会保留。

#### 10. 升级到最新代码

如果你是从仓库部署的，升级流程通常是：

```bash
git pull
docker compose down
docker compose up --build -d
```

升级前如果你关心历史配置和缓存，建议先备份 Docker 卷。

#### 11. 备份与恢复

先看卷名：

```bash
docker volume ls
```

导出数据卷：

```bash
docker run --rm \
  -v app-data:/source \
  -v "$PWD:/backup" \
  alpine \
  tar czf /backup/simple-api-pool-data.tar.gz -C /source .
```

恢复数据卷：

```bash
docker run --rm \
  -v app-data:/target \
  -v "$PWD:/backup" \
  alpine \
  sh -c "cd /target && tar xzf /backup/simple-api-pool-data.tar.gz"
```

### 方式二：使用 GHCR 镜像部署

镜像地址：

```text
ghcr.io/1cyberlangke1/simple_api_pool
```

如果你不打算本地构建，直接拉镜像会更省事。

#### 1. 准备独立部署目录

```bash
mkdir simple-api-pool
cd simple-api-pool
```

#### 2. 创建 `.env`

把下面内容保存为 `.env`：

```text
ADMIN_KEY=改成你自己的管理员密钥
CLIENT_KEYS=
PORT=18080
GOMEMLIMIT=32MiB
```

#### 3. 方式 A：直接用 `docker run`

```bash
docker pull ghcr.io/1cyberlangke1/simple_api_pool:latest
docker run -d \
  --name simple-api-pool \
  --restart unless-stopped \
  --env-file .env \
  -p 18080:18080 \
  -v simple-api-pool-data:/app/data \
  ghcr.io/1cyberlangke1/simple_api_pool:latest
```

#### 4. 方式 B：自己写一个最小 Compose 文件

如果你希望后续升级、重启、看日志都统一用 `docker compose`，更推荐这一种。

新建 `docker-compose.yml`：

```yaml
services:
  app:
    image: ghcr.io/1cyberlangke1/simple_api_pool:latest
    container_name: simple-api-pool
    env_file:
      - .env
    ports:
      - "18080:18080"
    volumes:
      - app-data:/app/data
    restart: unless-stopped

volumes:
  app-data:
```

启动：

```bash
docker compose up -d
```

#### 5. 验证服务状态

如果你使用 `docker run`：

```bash
docker ps
docker logs -f simple-api-pool
```

这里的 `simple-api-pool` 来自上面的 `--name simple-api-pool`。

如果你使用 Compose：

```bash
docker compose ps
docker compose logs -f app
docker logs -f simple-api-pool
```

当前文档里的 Compose 示例已经固定 `container_name: simple-api-pool`，所以也可以直接使用 `docker logs -f simple-api-pool`。

健康检查：

```bash
curl http://127.0.0.1:18080/api/health
```

#### 6. 页面入口

- 状态页：`http://127.0.0.1:18080/status`
- 管理页：`http://127.0.0.1:18080/admin`

#### 7. 升级镜像

如果你使用 `docker run`：

```bash
docker pull ghcr.io/1cyberlangke1/simple_api_pool:latest
docker rm -f simple-api-pool
docker run -d \
  --name simple-api-pool \
  --restart unless-stopped \
  --env-file .env \
  -p 18080:18080 \
  -v simple-api-pool-data:/app/data \
  ghcr.io/1cyberlangke1/simple_api_pool:latest
```

如果你使用 Compose：

```bash
docker compose pull
docker compose up -d
```

#### 8. 停止与删除

如果你使用 `docker run`：

```bash
docker stop simple-api-pool
docker rm simple-api-pool
```

如果你使用 Compose：

```bash
docker compose down
```

只要你没有删除数据卷，历史配置和缓存会保留。

### 方式三：本机直接运行

如果你不使用 Docker，也可以直接运行 Go 后端。

#### 1. 进入后端目录

```bash
cd backend
```

#### 2. 设置环境变量

至少需要：

```text
ADMIN_KEY=你的管理员密钥
```

按需增加：

```text
CLIENT_KEYS=client-key-1,client-key-2
PORT=18080
GOMEMLIMIT=32MiB
```

#### 3. 启动服务

```bash
go run .
```

#### 4. 验证健康状态

```bash
curl http://127.0.0.1:18080/api/health
```

#### 5. 数据位置

本机运行时，数据默认写到仓库根目录下的：

```text
data/
```

### 常见排查

#### 端口被占用

如果 `18080` 已经被别的程序占用，把 `.env` 里的 `PORT` 改成别的值，然后重新启动容器。

#### 页面打不开

先检查容器是否正常运行：

```bash
docker compose ps
```

再检查健康接口：

```bash
curl http://127.0.0.1:18080/api/health
```

如果健康接口不通，再看日志：

```bash
docker compose logs --tail=200 app
```

#### 重建容器后配置丢失

通常是因为没有挂载 `/app/data`。确认你的部署命令或 Compose 文件里存在：

```text
-v simple-api-pool-data:/app/data
```

或者：

```yaml
volumes:
  - app-data:/app/data
```

## 使用教程

这一节只处理“服务已经启动后，怎么完成初始化、怎么配置提供商、怎么发代理请求、怎么看状态”。

### 先理解三种密钥

项目里常见的密钥有三种，角色不同：

- `ADMIN_KEY`：管理员密钥，用于登录 `/admin` 和调用管理接口
- `CLIENT_KEYS`：客户端访问密钥，用于业务方调用代理接口
- 上游供应商 key：例如 OpenAI、Claude、Gemini 的真实 API key，由你导入到某个提供商下面

可以把它理解成三层：

1. `ADMIN_KEY` 管理整个系统
2. `CLIENT_KEYS` 控制谁能使用你的代理
3. 上游 key 负责真正请求外部模型服务

### 推荐使用顺序

推荐按这个顺序完成初始化：

1. 确认服务已经启动并能访问 `/api/health`
2. 打开 `/admin`，输入管理员密钥登录
3. 配置全局参数，例如客户端 key 和 Token 估算开关
4. 新增一个提供商
5. 给这个提供商导入一个或多个上游 key
6. 用客户端 key 调用代理入口
7. 到 `/status` 查看成功率、错误率、Token 和缓存统计

### 页面入口

- `/status`：公开状态页，不需要登录
- `/admin`：管理页，需要管理员密钥

### 两种使用方式

你可以任选一种：

- 浏览器方式：主要在 `/admin` 页面里完成配置
- API 方式：使用 `curl` 或其他 HTTP 客户端调用管理接口

如果你只是自己使用，浏览器方式更直观。

如果你要写自动化脚本、批量初始化环境、或者做二次集成，API 方式更合适。

## 浏览器方式初始化

### 1. 打开管理页

在浏览器访问：

```text
http://127.0.0.1:18080/admin
```

输入你在环境变量里设置的 `ADMIN_KEY`。

### 2. 设置全局配置

在管理页里至少确认下面几项：

- 管理员密钥是否正确
- 是否需要启用客户端访问密钥
- 是否开启 Token 估算

如果你希望代理入口也带访问控制，先配置至少一个客户端 key。

### 3. 新增提供商

在管理页中新增提供商时，至少要填写：

- 提供商名称
- 提供商类型
- 上游基础地址
- key 策略

建议先从一个最简单的提供商开始，例如：

- 名称：`openai`
- 类型：`openai_chat`
- 地址：`https://api.openai.com`

### 4. 导入上游 key

进入对应提供商后导入 key。

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

### 5. 调用代理接口

提供商保存成功后，就可以用它的名称拼代理路径。

例如你新增的是 `openai`，那入口就是：

```text
http://127.0.0.1:18080/openai/...
```

如果你给系统配置了客户端 key，调用时要带：

```text
Authorization: Bearer <CLIENT_KEY>
```

### 6. 查看运行状态

初始化完成后，可以到下面两个页面确认结果：

- `/status`：看调用是否成功、缓存是否命中、各提供商可用 key 数量
- `/admin`：看每个 key 的禁用状态、失败次数、缓存配置

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

### 1. 先验证管理员密钥

```bash
curl -X POST http://127.0.0.1:18080/api/admin/login \
  -H "Authorization: Bearer admin-demo"
```

这个请求成功，说明管理员密钥可用。

### 2. 设置全局配置

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

如果你不想给代理接口加客户端鉴权，可以把 `client_keys` 设为空数组。

### 3. 新增提供商

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

- `name`：代理入口名称，同时也会出现在 `/status` 和 `/admin`
- `type`：提供商类型，可选值取决于支持的供应商协议
- `base_url`：上游基础地址
- `key_strategy`：`round_robin` 或 `fill`
- `fail_threshold`：连续失败多少次后禁用该 key
- `min_disable_secs`：最小禁用时长
- `max_disable_secs`：最大禁用时长
- `cache_enabled`：是否启用该提供商的缓存入口
- `cache_max_entries`：该提供商缓存条目上限

提供商名称需要注意两点：

- 必须唯一
- 不能使用保留名称 `status` 和 `admin`

### 4. 导入上游 key

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

如果你更喜欢逗号分隔，也可以这样传：

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

### 6. 删除提供商或单个 key

删除整个提供商：

```bash
curl -X DELETE http://127.0.0.1:18080/api/admin/providers/openai \
  -H "Authorization: Bearer admin-demo"
```

删除某一个上游 key：

```bash
curl -X DELETE http://127.0.0.1:18080/api/admin/providers/openai/sk-a \
  -H "Authorization: Bearer admin-demo"
```

删除提供商时，对应的独立缓存也会一起处理。

## 代理接口总览

如果你配置了客户端访问密钥，代理请求需要：

```text
Authorization: Bearer <CLIENT_KEY>
```

代理入口有两类：

- `/{provider}/...`：普通代理入口
- `/cache/{provider}/...`：缓存代理入口

示例路径：

- `/openai/v1/chat/completions`
- `/responses/v1/responses`
- `/claude/v1/messages`
- `/gemini/v1beta/models/gemini-2.5-flash:generateContent`

调用时有几个要点：

- 后缀路径会继续透传给上游
- 查询参数会继续透传给上游
- 请求体按下游官方格式原样传入
- 多模态消息不会被改写

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
