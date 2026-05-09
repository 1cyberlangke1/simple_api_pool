# 开发与测试

本文档面向需要修改代码、重建前端或运行测试的开发者。

## 目录结构

```text
src/backend/        Go 后端
src/backend/tests/  后端测试
src/frontend/       前端产物目录
src/frontend/src/   前端模板、样式、脚本和 i18n 源文件
scripts/        检查脚本与前端构建脚本
data/           运行时数据目录
```

## 前端构建

前端最终交付文件是：

```text
src/frontend/index.html
```

源码位于 `src/frontend/src/`。如果你改了模板、样式或脚本，需要重新生成产物：

```bash
go run ./scripts/build_frontend.go -root .
```

Docker 构建会自动执行这一步。

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
