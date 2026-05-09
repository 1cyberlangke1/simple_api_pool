# 架构说明

本文档说明当前版本的核心目录边界、请求路径、存储模型，以及新增 provider 或管理能力时应该从哪里扩展。

## 后端结构

后端当前按下面几类职责组织：

- `app/`
  - 运行时装配、根路由、HTTP Server 生命周期
- `adminapi/`
  - 管理端 transport 层
  - 请求绑定、输入校验、管理端响应形状
- `statusapi/`
  - 状态页 transport 层
- `service/`
  - 管理页和状态页共用的 overview 聚合逻辑
- `domain/`
  - provider 默认值、BaseURL 规范化、保留名称规则
  - key 失败退避与禁用时长规则
- `providerapi/`
  - provider capability registry
  - 上游鉴权写入、客户端鉴权提取、缓存核心字段、模型提取、模型发现请求判定
  - provider 级 token usage 提取
  - provider 级缓存响应塑形与流式缓存回放
  - 当前按 `openai / claude / gemini` 分文件组织
- `proxyapi/`
  - 代理热路径
  - 请求鉴权、provider 解析、请求分析、上游请求转发
  - 流式透传、受限缓冲、缓存命中与缓存写入协调
- `cache/`
  - 每 provider 一库的缓存存储与缓存响应塑形
- `store/`
  - 状态单库存储
- `stats/`
  - 内存统计、快照持久化、恢复与停止流程
- `auth/`
  - 客户端与管理员鉴权、会话 Cookie、失败限制

## 路由结构

- `GET /api/health`
- `GET /api/status/overview`
- `GET /api/status/stats`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET|PUT /api/admin/config`
- `GET|POST /api/admin/providers`
- `GET|DELETE /api/admin/providers/{provider}`
- `POST /api/admin/providers/{provider}/keys`
- `POST /api/admin/providers/{provider}/keys/bulk`
- `DELETE /api/admin/providers/{provider}/cache`
- `DELETE /api/admin/providers/{provider}/{key}`
- `/{provider}/...`
- `/cache/{provider}/...`

`/status` 和 `/admin` 页面由前端单页入口承接，provider 代理入口继续保留原有对外语义。

## 存储模型

状态数据使用单 SQLite 库：

- `data/simple-api-pool.db`

当前用于持久化：

- 全局配置
- provider 配置与 key 状态
- 统计快照
- schema version 元数据

缓存按 provider 单独存储：

- `data/cache/<provider>/cache.db`

这样可以保留 provider 之间的写隔离，避免高频缓存写入集中到同一个 SQLite 写点。

## Provider 扩展点

新增 provider 时，优先看 `providerapi/providerapi.go`。

当前 registry 负责：

- `CacheField`
- `ExtractClientCredential`
- `ApplyUpstreamAuth`
- `ExtractRequestModel`
- `IsModelDiscoveryRequest`
- `ExtractResponseUsage`
- `ExtractStreamUsage`
- `DecorateCachedResponse`
- `BuildCachedStreamBody`
- `DecorateCachedStreamBody`

新增 provider 的最小改动通常包括：

1. 在 registry 注册一个 capability。
2. 补 provider 默认 base URL。
3. 补缓存响应和 token 统计测试。
4. 补真实路径转发和缓存命中测试。

更详细的说明见：

- [provider-extension.md](provider-extension.md)

## 管理端扩展点

新增管理操作时，建议沿用现有边界，而不是把新规则直接写回 handler：

1. 在 `adminapi/handler.go` 注册新 HTTP 路由。
2. 在 `adminapi/` 定义 transport 输入、输出和鉴权要求。
3. 把参数归一化、默认值、去重、状态迁移规则放到 `service/` 或 `domain/`。
4. 只有持久化读写和状态更新细节留在 `config/`、`store/` 或 `cache/`。
5. 为新操作补至少一类 transport 测试和一类 service/domain 规则测试。

当前可以直接参照：

- `service/global_config_service.go`
- `service/provider_mutation_service.go`
- `service/key_action_service.go`

## 前端结构

前端源码位于 `src/frontend/src/`，当前边界如下：

- `routes/`
  - 页面路由、controller、polling 和副作用绑定
- `stores/`
  - `signals` 状态
- `services/`
  - 管理页、状态页请求
- `forms/`
  - `valibot` 表单 schema、默认值和 payload 构造
- `views/`
  - 页面和页面片段
- `shared/`
  - 格式化函数、基础展示片段
- `styles/`
  - tokens、layout、status、admin、forms、logs

最终交付仍然只有：

- `index.html`
- `assets/app.js`
- `assets/styles.css`
- `assets/build-manifest.json`
