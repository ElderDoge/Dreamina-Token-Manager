## 1. 数据模型与持久化

- [x] 1.1 在账号对象中添加 `region` 字段（必填，字符串类型）
- [x] 1.2 在 `data-persistence.js` 的 `_saveToFile` 中添加 `region` 字段序列化
- [x] 1.3 在 `data-persistence.js` 的 `_saveAllToFile` 中添加 `region` 字段序列化
- [x] 1.4 在 `data-persistence.js` 的 `_loadFromFile` 中添加 `region` 字段反序列化
- [x] 1.5 在 `redis.js` 的 `setAccount` 中添加 `region` 字段到 hset
- [x] 1.6 在 `redis.js` 的 `getAllAccounts` 中添加 `region` 字段读取
- [x] 1.7 在 `dreamina-account.js` 的 `_reloadAccountList` 中同步 `region` 字段

## 2. Region 校验与规范化

- [x] 2.1 创建 `normalizeRegion(region)` 函数：转小写、trim、校验合法性
- [x] 2.2 创建 `isValidRegion(region)` 函数：检查是否在 `us/hk/jp/sg/cn` 枚举中
- [x] 2.3 在所有接收 region 的入口调用 `normalizeRegion`（addAccount、批量导入、API）

## 3. 不可登录账号判定

- [x] 3.1 创建 `isPasswordEmpty(password)` 函数：判断密码为空/null/undefined/纯空白
- [x] 3.2 创建 `canAutoLogin(account)` 函数：返回 `!isPasswordEmpty(password) && region !== 'cn'`
- [x] 3.3 在 `addAccount` 中使用 `canAutoLogin` 判断是否调用 login
- [x] 3.4 在 `_validateAndCleanSessionIds` 中使用 `canAutoLogin` 判断是否重新登录
- [x] 3.5 在 `autoRefreshSessionIds` 中使用 `canAutoLogin` 过滤账号列表
- [x] 3.6 在 `refreshAccount` 中使用 `canAutoLogin` 判断是否刷新

## 4. CN 区域特殊处理

- [x] 4.1 在 `addAccount` 中，CN 区域且无 sessionid 时返回错误 "CN region requires sessionid"
- [x] 4.2 在 `_validateAndCleanSessionIds` 中，CN 账号过期时不标记 disabled，仅记录日志
- [x] 4.3 在批量导入解析中，region 为空字符串时统一转为 "cn"
- [x] 4.4 在批量导入校验中，CN 区域缺 sessionid 时记录错误

## 5. 代理层前缀逻辑

- [x] 5.1 在 `proxy.js` 中移除对 `config.region` 的引用
- [x] 5.2 创建 `applyRegionPrefix(sessionid, region)` 函数实现前缀逻辑
- [x] 5.3 在 `applyRegionPrefix` 中，region 为 `cn` 时直接返回原 sessionid
- [x] 5.4 在 `applyRegionPrefix` 中，非 CN 区域检查是否已有前缀，无前缀则添加 `${region}-`
- [x] 5.5 在 `proxy.js` 选中账号后调用 `applyRegionPrefix(accountForAttempt.sessionid, accountForAttempt.region)`
- [x] 5.6 添加日志：当 sessionid 已有前缀但与 region 不匹配时记录警告

## 6. 批量导入格式更新

- [x] 6.1 在 `dreamina-accounts.js` 的批量导入解析中，解析第 3 段为 region
- [x] 6.2 在批量导入解析中，解析第 4 段为 sessionid（可选）
- [x] 6.3 实现批量导入原子性：先校验所有行，任一行失败则拒绝全部
- [x] 6.4 在批量导入校验中，检查 region 是否为空，为空则记录错误 "Region is required"
- [x] 6.5 在批量导入校验中，检查 region 是否合法，非法则记录错误 "Invalid region: {region}"
- [x] 6.6 在批量导入校验中，CN 区域缺 sessionid 则记录错误 "CN region requires sessionid"
- [x] 6.7 批量导入失败时返回详细错误消息列表（包含行号和错误原因）

## 7. 单个账号 API 更新

- [x] 7.1 在 `POST /api/dreamina/setAccount` 中接收 `region` 字段
- [x] 7.2 在 `setAccount` API 中校验 region 必填，缺失则返回 400 错误
- [x] 7.3 在 `setAccount` API 中调用 `normalizeRegion` 规范化 region
- [x] 7.4 将 region 传递给 `dreaminaAccountManager.addAccount`
- [x] 7.5 在 `GET /api/dreamina/getAllAccounts` 返回中包含 `region` 字段

## 8. 过期时间更新

- [x] 8.1 在 `addAccount` 的 `existingSessionId` 路径中，将过期时间从 30 天改为 60 天
- [x] 8.2 确认所有区域（包括 CN）均使用 60 天过期时间

## 9. 全局配置清理

- [x] 9.1 从 `src/config/index.js` 中移除 `region` 字段定义
- [x] 9.2 从 `.env.example` 中移除 `REGION` 环境变量说明
- [x] 9.3 搜索代码中所有 `config.region` 引用并清理（除 proxy.js 已在步骤 5.1 处理）

## 10. 前端 UI 更新

- [x] 10.1 在 `dreamina-dashboard.vue` 的单个账号添加表单中添加 region 下拉选择（us/hk/jp/sg/cn）
- [x] 10.2 在 `newAccount` ref 对象中添加 `region` 字段，默认值为 `us`
- [x] 10.3 在 `addToken` 方法中将 `region` 字段发送到 `/api/dreamina/setAccount`
- [x] 10.4 在批量导入格式提示文字中更新为 `email:password:region[:sessionid]`
- [x] 10.5 在批量导入格式提示中添加 CN 区域示例：`user@example.com::cn:cnSessionIdHere`
- [x] 10.6 在账号列表（Card View 和 List View）中显示 region 标签
- [x] 10.7 在 `exportAccounts` 方法中更新导出格式为 `email:password:region:sessionid`

## 11. 测试与验证

- [ ] 11.1 测试 CN 账号导入（有 sessionid）并验证不触发自动登录
- [ ] 11.2 测试 CN 账号请求时 Authorization header 无前缀
- [ ] 11.3 测试非 CN 账号请求时 Authorization header 有正确前缀
- [ ] 11.4 测试混合区域账号池（us/hk/cn）共存并正确使用各自前缀
- [ ] 11.5 测试批量导入原子性：部分行错误时全部回滚
- [ ] 11.6 测试 region 大小写不敏感（CN/cn/Cn 均转为 cn）
- [ ] 11.7 测试 region 持久化：重启后 region 字段正确读取（File 和 Redis 模式）
- [ ] 11.8 测试 CN 账号过期后仍可使用（不标记 disabled）
- [ ] 11.9 测试导出后重新导入，数据一致性（export-import symmetry）
- [ ] 11.10 测试非法 region 值被拒绝并返回详细错误消息
