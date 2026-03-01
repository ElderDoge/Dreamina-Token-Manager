# Dreamina Token Manager — 项目上下文

## 项目定位

这是一个**自用的 Dreamina API Token 管理代理**。核心职责只有一件事：管理账号池（sessionid 轮换、健康检测、失败重试），对外表现为一个透明的 HTTP 代理。

## 代理设计原则

**代理层只做 token 管理，不做业务逻辑。**

| 原则 | 含义 |
|------|------|
| 透传优先 | 上游的响应体、状态码、响应头，原样转发给调用方，不包装、不转换 |
| 不过滤 | 不过滤上游响应中的任何字段，包括敏感字段 |
| 不统一格式 | 不对响应结构做标准化，调用方直接面对上游 API 的格式 |
| 不做业务判断 | 业务错误（如积分不足）只用于账号健康管理，不影响响应透传 |

## 账号管理行为

- 上游返回 429/500：记录失败，切换 sessionid 重试
- 上游返回 401：标记账号当日不可用
- 业务错误码 1006（积分不足）：标记账号当日不可用
- 其他业务错误：记录失败，不影响最终响应

## 错误处理策略

详见 `openspec/specs/proxy-error-propagation/spec.md`。

核心原则：上游有真实响应时透传，纯网络层故障时返回网关级错误。

## 路由挂载顺序

`server.js` 中路由的挂载顺序决定优先级（先挂载先匹配）：

1. `app.use('/api', proxyRouter)` — 原始代理，去除 `/api` 前缀后透传
2. `app.use('/v1', openAiCompatRouter)` — OpenAI 兼容适配（拦截 `/images/generations` 和 `/images/edits`）
3. `app.use('/v1', proxyRouter)` — 其余 `/v1/*` 直接透传
4. `app.use('/token', proxyRouter)` — `/token/*` 直接透传

## OpenAI 兼容适配层

`src/routes/openai-compat.js` 实现 OpenAI 格式到 jimeng 格式的参数转换：

- **`POST /v1/images/generations`**：将 `model`/`quality`/`size` 转换为 jimeng 的 `model`/`ratio`/`resolution`/`intelligent_ratio`，支持账号池重试
  - `gpt-*` 前缀模型按 `quality` 查 `GPT_QUALITY_*` 环境变量映射；其他 model 原样透传
  - `size` 格式：`16:9` 直接作为 ratio；`WxH` 按绝对差算法匹配最近邻比例；`auto` → `intelligent_ratio: true`
- **`POST /v1/images/edits`**：multipart 表单，`image`/`image[]` 映射为上游 `images[]`，`mask` 丢弃，转发到 `/v1/images/compositions`，不重试

## 上游 API 规范

上游为 jimeng-api（v1.6.3），详细接口文档见 `docs/jimeng-api.md`。

主要接口：
- `POST /v1/images/generations` — 文生图
- `POST /v1/images/compositions` — 图生图
- `POST /v1/videos/generations` — 视频生成
- `POST /v1/chat/completions` — 对话（封装图像生成）
- `POST /token/check|points|receive` — Token 管理
