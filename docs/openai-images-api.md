# OpenAI Images API 标准规范

> 来源：[platform.openai.com/docs/api-reference/images](https://platform.openai.com/docs/api-reference/images)、[docs.newapi.pro](https://docs.newapi.pro/en/docs/api/ai-model/images/openai/post-v1-images-generations)
> 更新日期：2026-03-01

## 概述

当前使用模型：`gpt-image-1`（dall-e-2 / dall-e-3 已弃用，2026 年 5 月关闭）

`gpt-image-1` 支持两个端点：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/v1/images/generations` | POST | 文生图：根据文本提示生成图像 |
| `/v1/images/edits` | POST | 图生图：对原图进行编辑或扩展（可选遮罩）|

---

## 认证

```
Authorization: Bearer $OPENAI_API_KEY
```

---

## POST /v1/images/generations（文生图）

**Content-Type**: `application/json`

### 参数

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `prompt` | string | **是** | 图像文本描述，最长 32000 字符 |
| `model` | string | 否 | `gpt-image-1`（默认）|
| `n` | integer | 否 | 生成数量，1-10，默认 `1` |
| `size` | string | 否 | `1024x1024`（默认）/ `1536x1024`（横）/ `1024x1536`（竖）/ `auto` |
| `quality` | string | 否 | `low` / `medium` / `high` / `auto`（默认）|
| `background` | string | 否 | 背景透明度：`transparent` / `opaque` / `auto`（默认）。`transparent` 时 `output_format` 需为 `png` 或 `webp` |
| `output_format` | string | 否 | `png`（默认）/ `webp` / `jpeg` |
| `moderation` | string | 否 | 内容审核级别：`auto`（默认）/ `low` |
| `stream` | boolean | 否 | 是否启用流式输出，默认 `false` |
| `user` | string | 否 | 终端用户唯一标识，用于滥用检测 |

> `gpt-image-1` 响应默认返回 `b64_json`，不支持 `response_format=url`。

### 请求示例

```bash
curl https://api.openai.com/v1/images/generations \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "a white siamese cat sitting on a windowsill",
    "n": 1,
    "size": "1024x1024",
    "quality": "high"
  }'
```

### 响应

```json
{
  "created": 1710000000,
  "data": [
    {
      "b64_json": "..."
    }
  ],
  "usage": {
    "total_tokens": 100,
    "input_tokens": 30,
    "output_tokens": 70,
    "input_tokens_details": {
      "text_tokens": 20,
      "image_tokens": 10
    }
  }
}
```

| 字段 | 类型 | 描述 |
|------|------|------|
| `created` | integer | Unix 时间戳 |
| `data[].b64_json` | string | Base64 编码的图像数据 |
| `usage` | object | token 用量统计 |

### 流式响应（`stream=true`）

返回 SSE 事件流，事件类型：

- **`image_generation.partial_image`**：中间帧可用时触发
  - `b64_json`: 当前帧 Base64
  - `partial_image_index`: 0-based 序号
  - `background`、`output_format`、`quality`、`size`、`created_at`

- **`image_generation.completed`**：生成完成
  - `b64_json`: 最终图像 Base64
  - `usage`: token 用量

---

## POST /v1/images/edits（图生图 - 编辑）

对原图进行局部编辑或整体扩展，可选提供遮罩指定编辑区域。

**Content-Type**: `multipart/form-data`

### 参数

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `image` | file | **是** | 要编辑的图像。PNG 格式，小于 4MB。若未提供 `mask`，图像需含透明区域（作为遮罩）|
| `prompt` | string | **是** | 期望编辑结果的文本描述 |
| `mask` | file | 否 | 遮罩图像，全透明区域（alpha=0）指示编辑位置。PNG 格式，与原图尺寸相同，小于 4MB |
| `model` | string | 否 | `gpt-image-1`（默认）|
| `n` | integer | 否 | 生成数量，1-10，默认 `1` |
| `size` | string | 否 | `1024x1024`（默认）/ `1536x1024` / `1024x1536` / `auto` |
| `quality` | string | 否 | `low` / `medium` / `high` / `auto`（默认）|
| `background` | string | 否 | 背景透明度：`transparent` / `opaque` / `auto`（默认）|
| `output_format` | string | 否 | `png`（默认）/ `webp` / `jpeg` |
| `user` | string | 否 | 终端用户唯一标识 |

### 请求示例

```bash
curl https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@original.png" \
  -F mask="@mask.png" \
  -F prompt="Replace the background with a sunny beach" \
  -F n=1 \
  -F size="1024x1024"
```

```python
from openai import OpenAI

client = OpenAI()

response = client.images.edit(
    model="gpt-image-1",
    image=open("original.png", "rb"),
    mask=open("mask.png", "rb"),
    prompt="Replace the background with a sunny beach",
    n=1,
    size="1024x1024",
)
# gpt-image-1 返回 b64_json
import base64
img_data = base64.b64decode(response.data[0].b64_json)
with open("result.png", "wb") as f:
    f.write(img_data)
```

### 响应

结构与 generations 响应相同（`data[].b64_json` + `usage`）。

### 流式响应（`stream=true`）

返回 SSE 事件流，事件类型：

- **`image_edit.partial_image`**：中间帧可用时触发
- **`image_edit.completed`**：编辑完成，含 `usage`

---

## new-api 兼容性说明

[new-api](https://github.com/QuantumNous/new-api) 完整兼容以上两个端点，替换 Base URL 即可：

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="your-new-api-key",
)
```

---

## 参考链接

- [OpenAI Images API Reference](https://platform.openai.com/docs/api-reference/images)
- [OpenAI Images Guide](https://platform.openai.com/docs/guides/images)
- [new-api 文档 - Generate Images](https://docs.newapi.pro/en/docs/api/ai-model/images/openai/post-v1-images-generations)
- [new-api 文档 - Edit Images](https://docs.newapi.pro/en/docs/api/ai-model/images/openai/post-v1-images-edits)
