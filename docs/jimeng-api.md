# jimeng-api 上游接口规范

> 来源：`/Users/ztk/others/jimeng-api`（v1.6.3）
> 更新日期：2026-03-01

## 概述

jimeng-api 是基于即梦 AI（国内）/ Dreamina（国际）逆向工程的图像和视频生成 API 服务，提供 OpenAI 兼容接口。

- **服务端口**：5100
- **技术栈**：Node.js 18+、TypeScript 5.0+、Koa 2.15

---

## 认证

所有请求通过 `Authorization` 头传入 `sessionid`：

```
Authorization: Bearer YOUR_SESSION_ID
```

### 区域前缀

| 区域 | 前缀 | 示例 |
|------|------|------|
| 中国（CN） | 无 | `Bearer abc123` |
| 美国（US） | `us-` | `Bearer us-abc123` |
| 香港（HK） | `hk-` | `Bearer hk-abc123` |
| 日本（JP） | `jp-` | `Bearer jp-abc123` |
| 新加坡（SG） | `sg-` | `Bearer sg-abc123` |

### 多 Token

多个 token 用逗号分隔，API 随机选一个使用：

```
Authorization: Bearer TOKEN1,TOKEN2,TOKEN3
```

---

## 接口列表

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/ping` | 健康检查，返回 `pong` |
| GET | `/v1/models` | 获取可用模型列表 |
| POST | `/v1/images/generations` | 文生图 |
| POST | `/v1/images/compositions` | 图生图（图像合成） |
| POST | `/v1/videos/generations` | 视频生成 |
| POST | `/v1/chat/completions` | 对话补全（封装图像生成） |
| POST | `/token/check` | 检查 token 有效性 |
| POST | `/token/points` | 查询积分 |
| POST | `/token/receive` | 领取每日积分 |

---

## 文生图 POST /v1/images/generations

### 请求

```json
{
  "model": "jimeng-4.5",
  "prompt": "A beautiful girl",
  "negative_prompt": "ugly",
  "ratio": "1:1",
  "resolution": "2k",
  "intelligent_ratio": false,
  "sample_strength": 0.7,
  "response_format": "url"
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `prompt` | string | ✓ | - | 图像描述 |
| `model` | string | - | `jimeng-4.5` | 模型 ID |
| `negative_prompt` | string | - | - | 反向提示词 |
| `ratio` | string | - | `1:1` | 宽高比 |
| `resolution` | string | - | `2k` | 分辨率档位 |
| `intelligent_ratio` | boolean | - | `false` | 从 prompt 自动推断比例 |
| `sample_strength` | number | - | - | 采样强度，0.0–1.0 |
| `response_format` | string | - | `url` | `url` 或 `b64_json` |

### 支持的模型

| 模型 | 支持区域 |
|------|--------|
| `jimeng-4.5` | 所有 |
| `jimeng-4.1` | 所有 |
| `jimeng-4.0` | 所有 |
| `jimeng-3.0` | 所有 |
| `jimeng-3.1` | CN 专属 |
| `jimeng-2.1` | CN 专属 |
| `jimeng-xl-pro` | 所有 |
| `nanobanana` | 国际专属 |
| `nanobananapro` | 国际专属 |

### 支持的宽高比

`1:1` / `4:3` / `3:4` / `16:9` / `9:16` / `3:2` / `2:3` / `21:9`

### 支持的分辨率

| 档位 | 像素范围 |
|------|--------|
| `1k` | 1024×1024 ~ 1195×512 |
| `2k` | 2048×2048 ~ 3024×1296（默认） |
| `4k` | 4096×4096 ~ 6048×2592 |

> `intelligent_ratio` 仅对 `jimeng-4.0` / `jimeng-4.1` / `jimeng-4.5` 有效。

### 响应

```json
{
  "created": 1759058768,
  "data": [
    { "url": "https://example.com/image.jpg" }
  ]
}
```

`b64_json` 格式：
```json
{
  "created": 1759058768,
  "data": [
    { "b64_json": "base64_encoded_string" }
  ]
}
```

---

## 图生图 POST /v1/images/compositions

支持 JSON 和 multipart/form-data 两种请求格式。

### JSON 请求

```json
{
  "model": "jimeng-4.5",
  "prompt": "Convert to oil painting",
  "images": [
    "https://example.com/photo.jpg",
    { "url": "https://example.com/photo2.jpg" }
  ],
  "ratio": "1:1",
  "resolution": "2k",
  "intelligent_ratio": false,
  "sample_strength": 0.7,
  "negative_prompt": "ugly",
  "response_format": "url"
}
```

### Multipart 请求

```
Content-Type: multipart/form-data

prompt=A cute cat, anime style
model=jimeng-4.5
ratio=1:1
resolution=1k
sample_strength=0.7
images=@/path/to/image1.jpg
images=@/path/to/image2.png
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | ✓ | 目标图像描述 |
| `images` | array/files | ✓ | 输入图像，1–10 张，URL 或文件 |
| `model` | string | - | 默认 `jimeng-4.5` |
| `ratio` | string | - | 默认 `1:1` |
| `resolution` | string | - | 默认 `2k` |
| `intelligent_ratio` | boolean | - | 默认 `false` |
| `sample_strength` | number | - | 0.0–1.0 |
| `negative_prompt` | string | - | 反向提示词 |
| `response_format` | string | - | `url` 或 `b64_json` |

> 同时提供文件和 URL 时，文件优先。

### 响应

```json
{
  "created": 1703123456,
  "data": [
    { "url": "https://p3-sign.toutiaoimg.com/..." }
  ],
  "input_images": 1,
  "composition_type": "multi_image_synthesis"
}
```

---

## 视频生成 POST /v1/videos/generations

支持三种模式（自动识别）：

| 输入图像数 | 模式 |
|----------|------|
| 0 | 文生视频 |
| 1 | 图生视频（首帧） |
| 2 | 首尾帧生视频 |

支持 JSON 和 multipart/form-data 两种格式。

### JSON 请求

```json
{
  "model": "jimeng-video-3.0",
  "prompt": "A lion running on grassland",
  "ratio": "16:9",
  "resolution": "1080p",
  "duration": 10,
  "response_format": "url"
}
```

### Multipart 请求（图生视频）

```
Content-Type: multipart/form-data

prompt=A man talking
model=jimeng-video-3.0
ratio=9:16
duration=5
image_file_1=@/path/to/first-frame.png
image_file_2=@/path/to/last-frame.png
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | ✓ | 视频描述 |
| `model` | string | - | 默认 `jimeng-video-3.5-pro` |
| `ratio` | string | - | 默认 `1:1`（有图时忽略） |
| `resolution` | string | - | `720p` 或 `1080p`，默认 `720p` |
| `duration` | number | - | 视频时长（秒），取值见模型限制 |
| `file_paths` / `filePaths` | array | - | 图像 URL，最多 2 个 |
| `image_file_1` / `image_file_2` | file | - | 上传图像文件，最多 2 个 |
| `response_format` | string | - | `url` 或 `b64_json` |

### 支持的视频模型

| 模型 | 支持区域 | 时长选项（秒） |
|------|--------|--------------|
| `jimeng-video-3.5-pro` | 所有（默认） | 5、10、12 |
| `jimeng-video-veo3` | HK/JP/SG | 固定 8 |
| `jimeng-video-veo3.1` | HK/JP/SG | 固定 8 |
| `jimeng-video-sora2` | HK/JP/SG | 4、8、12 |
| `jimeng-video-3.0-pro` | CN + HK/JP/SG | 5、10 |
| `jimeng-video-3.0` | 所有 | 5、10 |
| `jimeng-video-3.0-fast` | CN | 5、10 |
| `jimeng-video-2.0-pro` | CN + HK/JP/SG | 5、10 |
| `jimeng-video-2.0` | CN + HK/JP/SG | 5、10 |

### 响应

```json
{
  "created": 1759058768,
  "data": [{
    "url": "https://example.com/video.mp4",
    "revised_prompt": "A lion running on grassland"
  }]
}
```

---

## 对话补全 POST /v1/chat/completions

本质是将对话转为图像生成请求，返回带图像 URL 的 markdown 消息。

### 请求

```json
{
  "model": "jimeng-4.5",
  "messages": [
    { "role": "user", "content": "Draw a landscape painting" }
  ],
  "stream": false
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | ✓ | 消息列表 |
| `model` | string | - | 默认 `jimeng-4.5` |
| `stream` | boolean | - | 是否启用 SSE 流式输出 |

消息对象：`{ "role": "user|assistant|system|function", "content": "..." }`

### 响应（非流式）

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1759058768,
  "model": "jimeng-4.5",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "![image](https://example.com/generated-image.jpg)"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### 响应（流式 SSE）

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1759058768,...}
data: [DONE]
```

---

## Token 管理接口

### 检查 Token 有效性 POST /token/check

```json
// 请求
{ "token": "your_session_id" }

// 响应
{ "live": true }
```

### 查询积分 POST /token/points

```
Authorization: Bearer TOKEN1,TOKEN2,TOKEN3
```

响应：
```json
[
  {
    "token": "token1",
    "points": {
      "giftCredit": 10,
      "purchaseCredit": 0,
      "vipCredit": 0,
      "totalCredit": 10
    }
  }
]
```

### 领取每日积分 POST /token/receive

请求格式同 `/token/points`，响应格式相同（字段名为 `credits`）。

---

## 响应格式说明

| 格式 | 字段 | 说明 |
|------|------|------|
| `url`（默认） | `data[].url` | 图像/视频的 HTTP 链接 |
| `b64_json` | `data[].b64_json` | base64 编码的内容 |

---

## 成功与失败响应结构

jimeng-api 的所有接口（除 token 管理外）使用统一的响应外壳：

### 成功

HTTP 200，`code` 为 0：

```json
{
  "code": 0,
  "message": "OK",
  "data": { ... }
}
```

### 失败

HTTP 200，`code` 为负数：

```json
{
  "code": -2001,
  "message": "错误描述，有时包含「错误码: 1006」",
  "data": null
}
```

### 应用层错误码

| code | 含义 | 说明 |
|------|------|------|
| `-2000` | 请求参数非法 | 参数格式错误 |
| `-2001` | 请求失败 | 通用错误，网络或未知问题 |
| `-2002` | Token 已失效 | 对应即梦 `ret=1015`，账号需重新登录 |
| `-2003` | 远程文件 URL 非法 | 图像 URL 无法访问 |
| `-2004` | 远程文件超出大小 | 图像文件过大 |
| `-2005` | 已有对话流正在输出 | 并发流式请求冲突 |
| `-2006` | 内容违规 | 对应即梦 `ret=4001` |
| `-2007` | 图像生成失败 | 对应即梦 `ret=5001` |
| `-2008` | 视频生成失败 | 对应即梦 `ret=5002` |
| `-2009` | 积分不足 | 对应即梦 `ret=5000` |

### 业务错误码 1006

`-2001` 的 `message` 字段有时包含更具体的错误码，格式为：

```
错误码: 1006
```

`1006` 表示积分不足，是 jimeng-api 对外暴露的业务层错误标识（不同于内部用的 `ret=5000`）。本项目通过正则 `/错误码[:：]\s*(\d+)/` 从 message 中提取此码，用于账号管理。

---

## 错误处理

- 智能轮询：默认 5 秒间隔，最长 15 分钟等待生成结果
- HTTP 4xx/5xx 会自动重试，重试耗尽后返回 `-2001`
- `APIException`（如 `-2002` Token 失效）直接抛出，不重试
