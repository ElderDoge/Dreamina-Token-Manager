# Dreamina Token Manager

管理 Dreamina 账号池的代理服务。核心职责是维护一组账号的 SessionID，对外暴露一个透明的 HTTP 代理——调用方像直接调用上游 API 一样发请求，服务自动选一个可用账号注入认证头并转发。

附带一个 Web 管理后台用于增删账号、手动刷新 SessionID、查看账号状态。

## 功能特性

### 账号管理

- 支持单个或批量添加账号（`email:password:region` 格式）
- 非大陆区账号通过 Playwright 自动登录，免手动获取 SessionID
- 可手动删除账号或恢复被标记为不可用的账号

### SessionID 管理

- 每日定时自动刷新即将过期的 SessionID
- 可手动触发单账号或全量刷新
- 上游返回 401 时自动标记当日不可用，次日自动解封

### 代理透传

- `POST /v1/images/generations` 和 `POST /v1/images/edits` 提供 OpenAI Images 兼容入口，自动转换参数格式
- 其余 `/api/*`、`/v1/*`、`/token/*` 请求原样透传到上游
- 上游出错时自动切换账号重试，调用方无感知

### 管理后台

- Vue 3 单页应用，分页展示账号状态和 SessionID 有效期
- 批量操作：导入、刷新、删除
- 异步任务通过 SSE 推送进度，无需轮询

## 环境要求

- Node.js >= 18
- npm >= 9
- 可选：Redis（`DATA_SAVE_MODE=redis` 时必需）

## 快速开始

### 直接部署

```bash
# 1. 安装后端依赖
npm install

# 2. 安装并构建前端
cd public && npm install && npm run build && cd ..

# 3. 复制并编辑配置
cp .env.example .env
# 至少填写 API_KEY 和 PROXY_TARGET

# 4. 启动服务
npm start
```

启动后访问 `http://localhost:3000` 进入管理后台。

### Docker 部署

```bash
docker compose up -d
```

默认将容器端口 `3000` 映射到宿主机 `3103`，按需修改 `docker-compose.yml`。

### PM2 部署

```bash
# 启动（集群模式，进程数由 PM2_INSTANCES 控制）
npm run pm2

# 常用命令
npm run pm2:status   # 查看进程状态
npm run pm2:logs     # 查看日志
npm run pm2:restart  # 重启
npm run pm2:delete   # 停止并删除
```

## 配置说明

创建 `.env` 文件（可从 `.env.example` 复制），完整说明见该文件。

### 核心配置

| 变量 | 说明 |
|---|---|
| `SERVICE_PORT` | 服务端口，默认 `3000` |
| `API_KEY` | API 密钥，逗号分隔多个；**第一个为管理员密钥** |
| `DATA_SAVE_MODE` | 存储模式：`none`（不持久化）/ `file`（本地文件）/ `redis` |
| `PROXY_TARGET` | 上游 API 地址，例如 jimeng-api 的地址 |

### 可选配置

| 变量 | 说明 |
|---|---|
| `LISTEN_ADDRESS` | 监听地址，留空使用默认值 |
| `REDIS_URL` | Redis 连接地址（`redis` 模式必填），例如 `redis://localhost:6379` |
| `PROXY_TIMEOUT_MS` | 透传超时毫秒数，默认 `600000` |
| `PROXY_MAX_RETRY` | 上游失败时最多切换账号重试的次数 |
| `PM2_INSTANCES` | `npm start` 集群进程数，支持 `max` |
| `DAILY_SESSION_UPDATE_TIME` | 每日定时刷新时间，格式 `HH:mm`；留空关闭 |
| `TIMEZONE` | 定时刷新时区，默认 `UTC` |
| `BROWSER_PROXY_ENABLE` | Playwright 登录时是否使用代理（`true`/`false`） |
| `BROWSER_PROXY_URL` | Playwright 代理地址，支持 http/https/socks5 |
| `GPT_QUALITY_LOW` | `quality=low` 时映射的 jimeng 模型名 |
| `GPT_QUALITY_MEDIUM` | `quality=medium` 时映射的模型名 |
| `GPT_QUALITY_HIGH` | `quality=high` 时映射的模型名 |
| `GPT_QUALITY_AUTO` | `quality` 缺失/未知时映射的模型名 |

## 鉴权

所有接口都需要携带 API Key，支持两种方式：

```
Authorization: Bearer <API_KEY>
```
```
x-api-key: <API_KEY>
```

**权限分级**：`API_KEY` 中第一个值为管理员密钥，可访问管理接口和前端。其余密钥只能调用代理接口。

验证密钥是否有效：

```bash
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sk-xxx"}'
```

## 使用指南

### 通过管理后台操作

1. 打开 `http://localhost:3000`，输入管理员密钥登录
2. 点击「添加账号」，输入 `email:password:region` 格式，支持批量粘贴多行
3. 添加后后台自动登录获取 SessionID，进度通过 SSE 实时推送到页面
4. 账号列表显示每个账号的状态和 SessionID 到期时间

### 添加账号（API）

**单个添加**：

```bash
curl -X POST http://localhost:3000/api/dreamina/setAccount \
  -H "Authorization: Bearer <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "pass123",
    "region": "us"
  }'
```

`region` 可选值：`us` / `hk` / `jp` / `sg` / `cn`。`cn` 区无法自动登录，必须手动提供 `sessionid` 字段。

**批量添加**：

```bash
curl -X POST http://localhost:3000/api/dreamina/setAccounts \
  -H "Authorization: Bearer <ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": "u1@example.com:pass1:us\nu2@example.com:pass2:jp\nu3@example.com::cn:your-cn-sessionid"
  }'
```

每行格式为 `email:password:region[:sessionid]`。添加为异步任务，响应返回 `jobId`，结果通过 SSE 推送。

### 发送代理请求

配置好 `PROXY_TARGET` 后，将上游 API 的 base URL 替换为本服务地址，其余不变：

```bash
# 直接透传（去掉 /api 前缀后转发）
curl -X POST http://localhost:3000/api/v1/images/generations \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model": "jimeng-4.0", "prompt": "a cat"}'

# OpenAI 兼容入口（自动转换参数格式）
curl -X POST http://localhost:3000/v1/images/generations \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "prompt": "a cat", "quality": "high", "size": "1024x1024"}'
```

服务会自动选一个可用账号注入 SessionID，如果上游返回错误则切换账号重试。

## 接口文档

### 代理接口

| 路由 | 说明 |
|---|---|
| `ALL /api/*` | 剥离 `/api` 前缀后透传；`/api/dreamina/*` 和 `/api/events` 除外（本地管理接口） |
| `POST /v1/images/generations` | OpenAI 兼容，参数自动转为 jimeng 格式 |
| `POST /v1/images/edits` | OpenAI 兼容，`multipart/form-data`，`image[]` 转为上游 `images`，转发到 `/v1/images/compositions` |
| `ALL /v1/*` | 除上述两个端点外，其余原样透传 |
| `ALL /token/*` | 原样透传 |

**OpenAI 兼容说明**：`model` 为空或以 `gpt-` 开头时，按 `quality` 字段查 `GPT_QUALITY_*` 环境变量映射实际模型；`size` 字段支持 `WxH`（最近邻匹配比例）、`W:H`（直接作为 ratio）、`auto`（启用智能比例）三种格式。

### 账号管理接口

以下接口均需要管理员 API Key。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/dreamina/getAllAccounts` | 账号列表，支持分页和排序 |
| `POST` | `/api/dreamina/setAccount` | 新增单个账号（异步，返回 `jobId`） |
| `POST` | `/api/dreamina/setAccounts` | 批量新增（异步，返回 `jobId`） |
| `DELETE` | `/api/dreamina/deleteAccount` | 删除指定账号 |
| `POST` | `/api/dreamina/refreshAccount` | 刷新指定账号的 SessionID |
| `POST` | `/api/dreamina/refreshAllAccounts` | 刷新即将过期的账号 |
| `POST` | `/api/dreamina/forceRefreshAllAccounts` | 强制刷新全部账号 |
| `POST` | `/api/dreamina/restoreAccount` | 手动恢复被标记为不可用的账号 |
| `POST` | `/api/dreamina/refreshUnavailableAccounts` | 刷新当日不可用或整体不可用的账号 |

### SSE 事件流

管理员订阅异步任务进度：

```bash
curl "http://localhost:3000/api/events?apiKey=<ADMIN_KEY>"
```

事件类型：
- `account:add:done`：单账号添加完成
- `account:batchAdd:done`：批量添加完成
- `ping`：心跳保活

### Redis 管理接口

仅 `DATA_SAVE_MODE=redis` 时有效，需要管理员 API Key。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/admin/redis/db` | 查看当前使用的 Redis DB 编号 |
| `POST` | `/admin/redis/db` | 切换 Redis DB（0-15） |

## 故障排查

**账号添加后状态一直是失败**

- 检查账号密码是否正确
- 确认 Playwright 能访问 Dreamina 登录页（有防火墙限制时配置 `BROWSER_PROXY_URL`）
- 查看日志：`npm run pm2:logs` 或 `logs/app.log`

**代理请求返回错误**

- 确认 `PROXY_TARGET` 配置正确且上游可访问
- 检查账号列表中是否有可用账号（有效 SessionID 且未被标记不可用）
- 确认请求携带了有效的 API Key

**前端页面打不开**

- 确认前端已构建：`cd public && npm run build`
- 检查 `public/dist` 目录是否存在构建产物

## 项目结构

```
.
├── src/
│   ├── config/         # 配置加载
│   ├── middlewares/    # 鉴权等中间件
│   ├── routes/         # 路由（proxy、openai-compat、管理接口）
│   ├── utils/          # 账号管理、SessionID 刷新、数据持久化
│   ├── server.js       # Express 应用和路由挂载
│   └── start.js        # PM2 入口
├── public/             # 前端（Vue 3）
│   ├── src/
│   └── dist/           # 构建产物
├── data/               # file 模式的数据文件
├── logs/
├── docker-compose.yml
├── Dockerfile
└── package.json
```
