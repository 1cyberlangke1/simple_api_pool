# 开发与测试

本文档面向需要修改代码、重建前端或运行测试的开发者。

## 目录结构

```text
src/backend/        Go 后端
src/backend/tests/  后端测试
src/frontend/       前端源码、构建产物与包管理文件
src/frontend/src/   Preact 页面、stores、services、forms 和消息文件
scripts/            检查脚本与前端构建脚本
data/               运行时数据目录
```

## 前端构建

前端最终交付文件是：

```text
src/frontend/index.html
src/frontend/assets/app.js
src/frontend/assets/styles.css
src/frontend/assets/build-manifest.json
```

源码位于 `src/frontend/src/`，依赖定义在 `src/frontend/package.json`。如果你改了模板、样式或脚本，需要重新生成产物：

```bash
go run ./scripts/build_frontend.go -root .
```

Docker 构建会自动执行这一步。

`build_frontend.go` 会在当前系统内按需执行 `npm ci`，然后生成单 bundle。Windows 和 WSL 各自运行时，会使用各自系统里的 Node 依赖，不应跨系统复用原生构建依赖。

前端路由层当前进一步拆成：

- `routes/app_router.js`：页面壳层与顶部导航装配
- `routes/admin_route_controller.js`：管理页 controller
- `routes/status_route_controller.js`：状态页 controller
- `routes/admin_polling.js`：轮询、ETag 和可见性刷新
- `routes/admin_actions.js`：管理页写操作协调
- `routes/app_effects.js`：文档状态和全局事件副作用
- `routes/route_state.js`：页面级派生状态

## 测试

测试统一放在 `src/backend/tests/`。

当前覆盖重点包括：

- 真实代理路径和查询参数透传
- 上游错误原样透传
- key 轮询、填充、失败禁用和恢复
- 管理接口和配置持久化
- 单提供商缓存与流式 / 非流式缓存分离
- OpenAI Chat / Responses / Claude / Gemini 的 Token 提取
- 多模态请求透传
- 多模态消息参与缓存命中
- 前端入口、资源版本和管理页布局结构
- 前端 route/controller 模块边界

## 常用命令

运行全部测试：

```bash
cd src/backend
go test ./...
```

在仓库根目录运行统一检查：

Windows：

```powershell
.\scripts\check.ps1
```

Linux / WSL：

```bash
./scripts/check.sh
```

统一检查会处理：

- 前端重建
- 前端脚本语法检查
- `go test ./...`
- `go test -race ./tests`

## 后端扩展边界

后端当前职责边界建议按下面理解：

- `adminapi/`、`statusapi/`：HTTP transport
- `service/`：业务 mutation 与 overview 聚合
- `domain/`：纯规则
- `config/`、`store/`、`cache/`：持久化与状态读写

如果要新增 provider 或新增管理操作，优先把规则放到 `service/` 或 `domain/`，不要直接把新规则堆回 HTTP handler。

### 新增管理操作

建议按下面顺序扩展：

1. 在 `adminapi/handler.go` 注册路由，并在 `adminapi/` 定义 transport struct。
2. 在 `service/` 新增对应 mutation service，负责协调 `config/`、`cache/`、`stats/`。
3. 在 `domain/` 放纯规则：
   - 名称校验
   - 时间与禁用时长规范化
   - 默认值和去重
4. 在 `src/backend/tests/` 补两层测试：
   - HTTP 输入 / 输出测试
   - service 或 domain 规则测试

现有可直接参考的文件：

- `service/global_config_service.go`
- `service/provider_mutation_service.go`
- `service/key_action_service.go`
- `tests/service_mutation_test.go`
- `tests/domain_rules_test.go`

## 基准测试

如果要观察 proxy 与缓存热路径，可以在 `src/backend` 目录运行：

```bash
go test ./tests -run ^$ -bench 'Benchmark(Cache|Proxy|Direct|Large)' -benchmem -count=1
```

当前基准覆盖重点包括：

- 缓存命中路径
- 并发缓存命中读取
- 普通流式直通
- 大响应不缓存直通
- 流式累计超限后继续透传
