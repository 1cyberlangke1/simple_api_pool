# Simple API Pool

`Simple API Pool` 是一个面向多供应商大模型接口的轻量中间件。

它的职责主要有几类：

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

## 项目特点

- 代理入口：`/{provider}/...`
- 缓存入口：`/cache/{provider}/...`
- 后缀路径和查询参数直接透传
- 请求体原样转发，不改写消息结构
- 多模态输入直接透传，数组内容允许任意结构
- 缓存键兼容多模态消息结构
- 流式与非流式请求分别使用独立缓存条目
- 状态使用单 SQLite 数据库，缓存按 provider 独立 SQLite 数据库
- 前端源码使用 `Preact + signals + wouter-preact + valibot`，交付仍是单 bundle
- 前后端同容器交付
- 默认端口：`18080`
- 默认 `GOMEMLIMIT`：`32MiB`

## 文档目录

- [部署指南](docs/deployment.md)
- [使用指南](docs/usage.md)
- [架构说明](docs/architecture.md)
- [缓存与统计说明](docs/cache-and-statistics.md)
- [开发与测试](docs/development.md)
- [提供商扩展指南](docs/provider-extension.md)

如果你准备新增 provider 或扩展管理能力，优先阅读：

- [架构说明](docs/architecture.md)
- [提供商扩展指南](docs/provider-extension.md)
- [开发与测试](docs/development.md)
