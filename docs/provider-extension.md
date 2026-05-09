# 提供商扩展指南

本文档面向需要新增 provider 支持的开发者。

## 目标

新增一个 provider 时，尽量把改动限制在 provider 能力注册和少量测试文件内，不要把判断逻辑散落到多个包里。

## 需要改的主要位置

### 1. provider 类型与默认地址

先检查：

- `src/backend/config/config.go`
- `src/backend/domain/provider_rules.go`

需要保证：

- `config.ProviderType` 有新的类型常量
- `domain.DefaultBaseURL` 能返回默认上游地址

### 2. provider capability

当前 provider registry 位于：

- `src/backend/providerapi/providerapi.go`

不同 provider 的实现细节分别在：

- `src/backend/providerapi/openai_capability.go`
- `src/backend/providerapi/claude_capability.go`
- `src/backend/providerapi/gemini_capability.go`

新增 provider 时，应新增一个同风格文件，并提供 capability，覆盖以下能力：

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

然后在 `providerapi.go` 的 registry 里注册。

## 缓存与 token 规则

新增 provider 时，必须明确两件事：

### 缓存键核心字段

缓存键只看：

- `model`
- provider 对应的核心消息字段

不要把非核心生成参数塞进缓存键。

### token 来源

必须优先使用上游官方返回的 usage 字段。

只有当上游没有返回输入或输出 token 时，才允许回退到估算逻辑。

## 必补测试

至少补以下测试：

- `src/backend/tests/providerapi_test.go`
- `src/backend/tests/providerapi_usage_test.go`
- `src/backend/tests/token_test.go`
- `src/backend/tests/cache_test.go`
- `src/backend/tests/proxy_official_roundtrip_test.go`

建议覆盖：

- 鉴权头或 query key 注入
- model 提取
- 模型发现请求判定
- 非流式 usage 提取
- 流式 usage 提取
- 缓存命中后的响应塑形
- 真实代理 round-trip

## 不建议的做法

- 不要在 `proxyapi`、`token`、`cache` 里重新加 provider 类型 `switch`
- 不要把 provider 私有协议细节写回 `adminapi` 或 `statusapi`
- 不要把 provider 缓存规则和路由规则绑死在一起

## 验证命令

新增 provider 后，至少运行：

```bash
cd src/backend
go test ./tests -run "TestProviderAPI.*|TestToken.*|TestCache.*|TestOfficialProviderRoundTripAndCacheHit" -count=1
go test ./... -count=1
```
