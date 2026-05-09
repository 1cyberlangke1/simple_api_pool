# 部署指南

本文档只处理一件事：把 `Simple API Pool` 稳定部署起来，并知道怎么验证、升级、备份和查看日志。

## 部署方式

推荐按下面顺序选择：

1. `Docker Compose` 本地构建部署
2. 使用 `GHCR` 已发布镜像部署
3. 本机直接运行 Go 后端

前两种方式都属于 Docker 部署，差别主要在构建来源：

- `Docker Compose 本地构建`：适合你要自己改代码，或者希望直接从当前仓库构建
- `GHCR 镜像部署`：适合你只想启动现成版本，不关心本地构建过程

## 部署前要知道的事

- 服务默认监听 `18080`
- 容器内服务端口也是 `18080`
- 如果没有显式设置 `GOMEMLIMIT`，程序默认按 `32MiB` 运行内存上限启动
- 首次启动前必须先配置 `ADMIN_KEY`
- 代理接口默认要求客户端密钥；如果 `CLIENT_KEYS` 为空，所有代理请求都会返回 `401`
- 所有运行时数据都会写入 `/app/data`
- 如果你不挂载卷，容器删除后配置、统计和缓存也会一起丢失

## 环境变量

仓库根目录提供了示例文件：`.env.example`。

最常用的变量如下：

| 变量名 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_KEY` | 是 | 无 | 管理员密钥，管理页和管理接口都依赖它 |
| `CLIENT_KEYS` | 否 | 空 | 客户端访问密钥，多个值用半角逗号分隔；为空时代理接口会拒绝所有业务请求 |
| `PORT` | 否 | `18080` | 服务监听端口 |
| `GOMEMLIMIT` | 否 | `32MiB` | Go 运行时内存限制 |
| `UPSTREAM_RESPONSE_LIMIT_BYTES` | 否 | `8388608` | 非流式上游响应的本地可缓存体上限；超过后直接透传且不缓存 |
| `ADMIN_COOKIE_SECURE` | 否 | 自动判断 | 管理员会话 Cookie 是否仅通过 HTTPS 发送 |

最小可用配置通常只需要：

```text
ADMIN_KEY=请改成你自己的管理员密钥
```

如果你要实际转发业务请求，还需要补上客户端密钥：

```text
CLIENT_KEYS=client-key-1,client-key-2
```

## 方式一：Docker Compose 本地构建部署

### 1. 获取代码并进入目录

```bash
git clone https://github.com/1cyberlangke1/simple_api_pool.git
cd simple_api_pool
```

### 2. 准备环境变量文件

```bash
cp .env.example .env
```

至少修改：

```text
ADMIN_KEY=改成你自己的管理员密钥
```

如果你要调用代理接口，同时设置：

```text
CLIENT_KEYS=client-key-1,client-key-2
```

按需增加：

```text
PORT=18080
GOMEMLIMIT=32MiB
UPSTREAM_RESPONSE_LIMIT_BYTES=8388608
ADMIN_COOKIE_SECURE=false
```

### 3. 启动服务

```bash
docker compose up --build -d
```

### 4. 确认容器已经起来

```bash
docker compose ps
```

### 5. 查看启动日志

```bash
docker compose logs -f app
```

最近 100 行：

```bash
docker compose logs --tail=100 app
```

### 6. 验证健康检查

```bash
curl http://127.0.0.1:18080/api/health
```

期望返回：

```json
{"status":"ok"}
```

### 7. 打开页面

- 状态页：`http://127.0.0.1:18080/status`
- 管理页：`http://127.0.0.1:18080/admin`

### 8. 常用运维命令

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

重新构建启动：

```bash
docker compose down
docker compose up --build -d
```

### 9. 数据保存位置

当前 Compose 文件已经挂载了命名卷：

```text
app-data
```

容器内对应目录：

```text
/app/data
```

### 10. 升级到最新代码

```bash
git pull
docker compose down
docker compose up --build -d
```

### 11. 备份与恢复

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

## 方式二：使用 GHCR 镜像部署

镜像地址：

```text
ghcr.io/1cyberlangke1/simple_api_pool
```

### 1. 准备独立部署目录

```bash
mkdir simple-api-pool
cd simple-api-pool
```

### 2. 创建 `.env`

```text
ADMIN_KEY=改成你自己的管理员密钥
CLIENT_KEYS=
PORT=18080
GOMEMLIMIT=32MiB
ADMIN_COOKIE_SECURE=false
```

### 3. 直接用 `docker run`

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

### 4. 或者使用最小 Compose 文件

`docker-compose.yml`：

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

### 5. 验证服务状态

`docker run`：

```bash
docker ps
docker logs -f simple-api-pool
```

Compose：

```bash
docker compose ps
docker compose logs -f app
```

健康检查：

```bash
curl http://127.0.0.1:18080/api/health
```

### 6. 页面入口

- 状态页：`http://127.0.0.1:18080/status`
- 管理页：`http://127.0.0.1:18080/admin`

### 7. 升级镜像

`docker run`：

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

Compose：

```bash
docker compose pull
docker compose up -d
```

## 方式三：本机直接运行

### 1. 进入后端目录

```bash
cd src/backend
```

### 2. 设置环境变量

至少需要：

```text
ADMIN_KEY=你的管理员密钥
```

按需增加：

```text
CLIENT_KEYS=client-key-1,client-key-2
PORT=18080
GOMEMLIMIT=32MiB
ADMIN_COOKIE_SECURE=false
```

### 3. 启动服务

```bash
go run .
```

### 4. 验证健康状态

```bash
curl http://127.0.0.1:18080/api/health
```

### 5. 数据位置

本机运行时，数据默认写到仓库根目录下的：

```text
data/
```

## 常见排查

### 端口被占用

如果 `18080` 已经被别的程序占用，把 `.env` 里的 `PORT` 改成别的值，然后重新启动服务。

### 页面打不开

先检查服务状态：

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

### 重建容器后配置丢失

确认部署命令或 Compose 文件里存在：

```text
-v simple-api-pool-data:/app/data
```

或者：

```yaml
volumes:
  - app-data:/app/data
```
