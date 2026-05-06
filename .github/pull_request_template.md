## 变更内容

- 

## 验证结果

- [ ] `go test ./...`
- [ ] `go test -race ./tests`
- [ ] `docker build -t simple-api-pool:ci .`

## 自查清单

- [ ] 没有改动与当前任务无关的文件
- [ ] 新增或变更的公共行为已经补测试
- [ ] README 没有混入本地协作约束或内部验证口径

## 提供商协议检查

- [ ] 如果本次改动涉及 `OpenAI Chat`、`OpenAI Responses`、`Claude`、`Gemini` 的协议、请求格式、响应格式、流式格式、鉴权头或 token 字段，已经对照官方文档核对
- [ ] 本次没有涉及提供商协议细节
