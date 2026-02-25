# Proposal: CN 区域支持 + 账号级别区域前缀管理

## Context

当前系统通过全局配置 `config.region`（如 `us`/`hk`/`jp`/`sg`）统一管理所有账号的区域前缀。代理层在发送请求时，统一将 `config.region-` 前缀添加到所有账号的 sessionid 上（`proxy.js:159`）。

用户需要：
1. **支持 CN 区域**：CN 区域的 sessionid 不需要添加任何区域前缀，且无法通过账号密码自动登录，只能手动导入 sessionid。
2. **账号级别前缀管理**：不同账号可以有不同的区域前缀，而非所有账号使用统一的全局前缀。导入账号时可以指定各自的区域前缀。

**用户确认的决策：**
- `REGION` 环境变量及 `config.region` 完全移除，不再需要
- 不存在旧账号迁移问题（已清空）
- sessionid 默认过期时间全区域统一改为 **60 天**（原为 30 天）

## Discovered Constraints

### Hard Constraints（不可违反）

- `proxy.js:159` — 当前使用 `config.region` 全局前缀，格式为：若 sessionid 已有前缀则跳过，否则添加 `${region}-` 前缀。此逻辑需改为读取**账号自身的 region 字段**。CN 区域不加任何前缀。
- `dreamina-account.js:addAccount` — 账号添加时若无 existingSessionId，会调用 `tokenManager.login(email, password)`。不可登录条件（见 Soft Constraints）满足时必须跳过登录，否则返回失败。
- `dreamina-account.js:_validateAndCleanSessionIds` — 校验无效 sessionid 时若有 password 会尝试重新登录，不可登录的账号不能触发此逻辑；CN 区域账号 sessionid 失效时**不标记 disabled**（因无法确认实际过期，仅作显示参考）。
- `dreamina-account.js:autoRefreshSessionIds` — 自动刷新时调用 `refreshSessionId` → `login()`，不可登录的账号不能进入此流程。
- `data-persistence.js` + `redis.js` — 账号数据结构在文件和 Redis 中均有对应的序列化/反序列化，新增 `region` 字段需要两处同步更新。
- 批量导入格式（`dreamina-accounts.js:192`）：新格式为 `email:password:region[:sessionid]`，不向后兼容旧格式，region 必填。
- 导出格式（前端 `dashboard.vue:919`）：当前导出 `email:password:sessionid`，需同步更新为 `email:password:region:sessionid`。
- `config.region` 被移除后，所有引用它的代码均需清理。

### Soft Constraints（约定惯例）

- 区域前缀规则：现有前缀格式为 `${region}-`（如 `us-xxxx`），CN 区域不加前缀。
- **不可登录判定**：满足以下任一条件即视为不可登录账号：密码为空字符串、密码为纯空白字符（trim 后为空）、或账号 region 为 `cn`。
- **CN 区域识别**：导入时 region 字段为 `"cn"` 或空字符串 `""` 均视为 CN 区域，统一存储为 `"cn"`。
- **CN 区域 sessionid 过期时间**：仅作为用户参考展示，不影响账号是否被调用（`_validateAndCleanSessionIds` 中 CN 账号过期不标记 disabled）。
- sessionid 默认过期时间统一改为 60 天（所有区域，仅手动导入路径）。
- **CN 区域 sessionid 必填**：导入时若 region 为 cn 且 sessionid 为空，则拒绝导入并返回错误。

### Dependencies（跨模块依赖）

| 影响点 | 文件 | 修改内容 |
|--------|------|----------|
| 全局配置 | `src/config/index.js` | 移除 `region` 字段 |
| 账号数据结构 | `src/utils/data-persistence.js`, `src/utils/redis.js` | 新增 `region` 字段，序列化/反序列化 |
| 代理前缀逻辑 | `src/routes/proxy.js:159` | 读取账号 `region` 字段，CN 区域不加前缀 |
| 账号添加逻辑 | `src/utils/dreamina-account.js:addAccount` | 密码为空时跳过登录，必须提供 sessionid |
| 账号验证逻辑 | `src/utils/dreamina-account.js:_validateAndCleanSessionIds` | 密码为空时跳过自动重新登录 |
| 自动刷新逻辑 | `src/utils/dreamina-account.js:autoRefreshSessionIds` | 密码为空时跳过刷新 |
| 批量导入解析 | `src/routes/dreamina-accounts.js:192` | 解析第 4 段为 region 字段 |
| 单个账号导入 | `src/routes/dreamina-accounts.js:setAccount` | 接收 region 字段 |
| 过期时间常量 | `src/utils/dreamina-account.js:addAccount` | 从 30 天改为 60 天 |
| 前端导入格式说明 | `public/src/views/dreamina-dashboard.vue` | 更新格式提示文字 |
| 前端账号展示 | `public/src/views/dreamina-dashboard.vue` | 账号列表显示 region 标签 |
| 前端导出格式 | `public/src/views/dreamina-dashboard.vue:919` | 包含 region 字段 |
| 单个账号添加表单 | `public/src/views/dreamina-dashboard.vue` | 新增 region 选择字段 |

## Requirements

### REQ-1: 移除全局 region 配置

- 从 `src/config/index.js` 中移除 `region` 字段
- 从 `.env.example` 中移除 `REGION` 环境变量说明
- 清理所有引用 `config.region` 的代码

### REQ-2: 账号数据结构扩展

每个账号新增 `region` 字段：
- 类型：字符串，必填（导入时设定，无默认值）
- 合法值：`us`/`hk`/`jp`/`sg`/`cn`
- CN 区域：`"cn"` — 表示此账号不加前缀

序列化要求：
- `data-persistence.js`：`_saveToFile`/`_saveAllToFile` 包含 `region` 字段
- `redis.js`：`saveAccount`/`loadAccounts` 包含 `region` 字段

### REQ-3: 代理层前缀逻辑修改

修改 `proxy.js` 中的 sessionid 前缀逻辑：
- 读取 `accountForAttempt.region` 而非全局 `config.region`
- 若 `region === 'cn'`：sessionid 不加任何前缀，直接使用原值
- 否则：添加 `${region}-` 前缀（若 sessionid 已有该前缀则跳过）

**场景**：CN 区域账号被选中时，`headers.authorization = \`Bearer ${sessionid}\`` （无前缀修改）。

### REQ-4: 不可登录账号跳过所有自动登录路径

**不可登录判定**：满足以下任一条件即为不可登录账号：
- `account.password` 为空或 trim 后为空
- `account.region === 'cn'`

修改以下位置，对不可登录账号：
- `addAccount`：跳过登录步骤，若无 `existingSessionId` 则返回失败
- `_validateAndCleanSessionIds`：跳过重新登录；**CN 区域账号 sessionid 过期时不标记 disabled**（过期时间仅供参考），其他区域不可登录账号失效则标记 disabled
- `autoRefreshSessionIds`：跳过该账号（不进入刷新队列）

### REQ-5: sessionid 默认过期时间改为 60 天

将 `addAccount` 中 `existingSessionId` 路径的过期时间：
```js
// 旧
Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
// 新
Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60
```

### REQ-6: 批量导入格式重定义

批量导入新格式：`email:password:region[:sessionid]`
- **region 必填**（第 3 段），不提供则拒绝该行
- **sessionid 可选**（第 4 段），非 CN 区域可不提供（由登录获取）
- **CN 区域 sessionid 必填**：region 为 `cn` 或空字符串时，若 sessionid 缺失则拒绝导入并记录失败原因
- region 为空字符串 `""` 等同于 `"cn"`，存储时统一转为 `"cn"`
- 示例：
  - CN 区域：`user@example.com::cn:cnSessionIdHere`（密码留空）
  - 非 CN 有密码：`user@example.com:password123:us`
  - 非 CN 有密码和 sessionid：`user@example.com:password123:hk:hkSessionIdHere`

### REQ-7: 单个账号 API 扩展

`POST /api/dreamina/setAccount` 请求体增加 `region` 字段：
- 必填，账号所属区域

### REQ-8: 前端 UI 更新

- **单个账号添加表单**：新增 region 下拉选择（`us`/`hk`/`jp`/`sg`/`cn`）
- **批量导入格式提示**：更新说明文字，包含 region 字段格式和 CN 区域示例
- **账号列表**：显示每个账号的 region 标签（可在 sessionid 旁边显示）
- **导出格式**：`email:password:sessionid:region`（包含 region 字段）

## Success Criteria

1. **CN 账号不加前缀**：CN 区域账号发送请求时，Authorization header 为 `Bearer <原始sessionid>`，无任何前缀。
2. **非 CN 账号正确加前缀**：`us` 区域账号使用 `us-<sessionid>` 格式。
3. **不可登录账号跳过自动流程**：密码为空/纯空白或 region 为 `cn` 的账号，在任何情况下均不触发 Playwright 登录流程。
4. **CN 账号过期不下线**：CN 区域账号 sessionid 到达 `sessionid_expires` 时间后，账号仍可被正常调用，不被标记 disabled。
5. **混合区域共存**：同一实例下可同时存在 `us`/`hk`/`cn` 等不同区域的账号，各自使用正确前缀。
6. **新批量导入格式**：格式为 `email:password:region[:sessionid]`，缺少 region 或 CN 区域缺少 sessionid 的行被拒绝并记录失败原因。
7. **60 天过期时间**：手动导入的 sessionid 默认 60 天后显示过期。
8. **数据持久化正确**：`region` 字段在 Redis 和文件模式下均能正确保存和读取。
9. **config.region 完全移除**：代码中无残留 `config.region` 引用。
