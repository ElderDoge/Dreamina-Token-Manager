# Redis 数据库动态切换功能实施计划

## 概述
- 后端：SELECT 切换（单连接 + client.select(db)）
- 前端：原生 select 下拉框
- DB 范围：0-15（16个库）

---

## 后端实施步骤

### 1. 修改 src/utils/redis.js
- 新增 `currentDbIndex` 状态变量（默认 0）
- 新增 `switchInProgress` 互斥标记
- 实现 `switchDatabase(targetDb)` 方法：
  - 参数校验（0-15）
  - 并发切换排队
  - 执行 `client.select(targetDb)`
  - 更新 `currentDbIndex`
- 新增 `getCurrentDb()` 方法返回当前 DB 信息
- 在 `redisClient` 导出中添加这两个方法

### 2. 修改 src/utils/dreamina-account.js
- 新增 `switchRedisDb(dbIndex)` 方法：
  - 调用 `redisClient.switchDatabase(dbIndex)`
  - 清空 `dreaminaAccounts` 缓存
  - 重新调用 `loadAccounts()`
  - 返回新账号数量

### 3. 新增 src/routes/admin-redis.js
- `GET /admin/redis/db`：获取当前 DB
- `POST /admin/redis/db`：切换 DB（需 adminKeyVerify）

### 4. 修改 src/server.js
- 挂载新路由 `/admin/redis`

---

## 前端实施步骤

### 1. 修改 public/src/views/dreamina-dashboard.vue

#### 删除代码
- 模板：删除第 66-72 行的目标设置 div
- 脚本：删除 `proxyTarget` ref
- 脚本：删除 `saveProxyTarget` 函数
- 脚本：删除 onMounted 中获取 proxyTarget 的逻辑

#### 新增代码
- 脚本：新增 `selectedDb` ref
- 脚本：新增 `isSwitchingDb` ref
- 脚本：新增 `availableDbs` 数组 (0-15)
- 脚本：新增 `getCurrentDb()` 函数
- 脚本：新增 `switchDatabase()` 函数
- 模板：在原位置添加 select 下拉框

---

## API 设计

### GET /admin/redis/db
```json
{
  "currentDb": 0
}
```

### POST /admin/redis/db
请求：`{ "db": 5 }`
响应：
```json
{
  "currentDb": 5,
  "accountsReloaded": 42
}
```

---

## 实施顺序
1. 后端 redis.js 添加切换逻辑
2. 后端 dreamina-account.js 添加切换入口
3. 后端新增路由
4. 前端删除旧代码
5. 前端添加新功能
