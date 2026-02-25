## Context

当前系统使用全局 `config.region` 统一管理所有账号的区域前缀。代理层在 `proxy.js:159` 将 `${config.region}-` 前缀添加到所有账号的 sessionid 上。

**现状问题：**
- 无法支持 CN 区域（CN 区域 sessionid 不需要前缀）
- 无法混合使用不同区域的账号（所有账号共享同一个全局前缀）
- CN 区域账号无法通过密码自动登录，只能手动导入 sessionid

**变更范围：**
- 后端：`config.js`、`dreamina-account.js`、`data-persistence.js`、`redis.js`、`proxy.js`、`dreamina-accounts.js`
- 前端：`dreamina-dashboard.vue`
- 数据模型：账号对象新增 `region` 字段
- API 协议：批量导入/导出格式变更

**约束条件：**
- 无旧账号迁移需求（用户已清空）
- region 枚举固定为 `us`/`hk`/`jp`/`sg`/`cn`
- CN 区域账号永不触发自动登录
- 批量导入采用原子性（全部成功或全部失败）

## Goals / Non-Goals

**Goals:**
- 支持 CN 区域账号（无前缀、不可自动登录）
- 实现账号级别的 region 管理，替代全局配置
- 混合区域账号池可在同一实例下共存
- 保证 region 字段在 File/Redis 模式下持久化一致性
- 批量导入/导出格式包含 region 字段

**Non-Goals:**
- 不支持旧账号迁移（用户已确认无需迁移）
- 不支持动态扩展 region 列表（固定枚举）
- 不支持账号创建后修改 region（region 不可变）
- 前端不做 CN 区域表单动态调整（仅后端校验）

## Decisions

### Decision 1: Region 字段存储位置

**选择：** 将 `region` 作为账号对象的一级字段，与 `email`/`password`/`sessionid` 平级。

**理由：**
- region 是账号的固有属性，与账号生命周期绑定
- 便于在 proxy 层直接读取 `account.region` 决定前缀策略
- 避免引入额外的映射表或查找逻辑

**替代方案：**
- 方案 A：维护独立的 `email → region` 映射表 → 增加数据一致性风险
- 方案 B：在 sessionid 中编码 region 信息 → 与现有前缀逻辑冲突

### Decision 2: Region 大小写处理

**选择：** 不区分大小写，存储前统一转小写。

**理由：**
- 用户可能输入 `CN`/`cn`/`Cn`，统一处理避免歧义
- 存储层统一小写，比较时无需 case-insensitive 逻辑
- 符合 URL/域名等常见标识符的规范

**实现：**
```js
const normalizedRegion = (region || '').toLowerCase().trim();
```

### Decision 3: 前缀冲突处理策略

**选择：** 信任 sessionid 原值，不做前缀修正。

**理由：**
- 用户手动导入的 sessionid 可能已包含正确前缀
- 自动修正可能引入错误（如 `us-xxx` 被错误修正为 `hk-us-xxx`）
- 简化逻辑，避免前缀检测和替换的复杂性

**实现：**
```js
// proxy.js
if (account.region === 'cn') {
  bearerToken = sessionid; // 不加前缀
} else {
  // 信任原值，仅在无前缀时添加
  const prefix = `${account.region}-`;
  bearerToken = sessionid.startsWith(prefix) ? sessionid : prefix + sessionid;
}
```

### Decision 4: 批量导入原子性

**选择：** 全部成功或全部失败（原子性）。

**理由：**
- 避免部分成功导致数据不一致
- 用户可以修正错误后重新导入全部数据
- 实现简单，无需复杂的回滚逻辑

**实现：**
```js
// 先校验所有行
const validationErrors = [];
for (const line of lines) {
  const error = validateLine(line);
  if (error) validationErrors.push(error);
}

// 任一行失败则拒绝全部
if (validationErrors.length > 0) {
  return { success: false, errors: validationErrors };
}

// 全部校验通过后再执行导入
for (const line of lines) {
  await addAccount(parseLine(line));
}
```

### Decision 5: CN 区域过期行为

**选择：** CN 账号过期后仅显示过期标记，不影响实际使用。

**理由：**
- CN 账号无法自动刷新，过期时间仅供用户参考
- 实际 sessionid 是否有效由 Dreamina 服务端决定
- 避免误判导致可用账号被禁用

**实现：**
```js
// _validateAndCleanSessionIds
if (account.region === 'cn' && isExpired(account.sessionid_expires)) {
  // 不标记 disabled，仅前端显示过期提示
  continue;
}
```

### Decision 6: Region 不可变性

**选择：** 账号创建后 region 不可修改。

**理由：**
- region 变更会影响 sessionid 前缀，可能导致鉴权失败
- 简化逻辑，避免 region 变更时的前缀同步问题
- 用户可删除账号后重新导入来变更 region

**实现：**
- `setAccount` API 不接受 region 更新
- `_reloadAccountList` 同步时保留原 region，不覆盖

### Decision 7: 空密码判定策略

**选择：** 宽松判定 — 空字符串、null、undefined、纯空白符均视为无密码。

**理由：**
- 用户可能通过不同方式表达"无密码"（空字符串、留空、空格）
- 宽松判定避免误触发自动登录
- 符合 JavaScript 的 falsy 值语义

**实现：**
```js
function isPasswordEmpty(password) {
  return !password || password.trim() === '';
}

function canAutoLogin(account) {
  return !isPasswordEmpty(account.password) && account.region !== 'cn';
}
```

### Decision 8: 导出格式顺序

**选择：** `email:password:region:sessionid`（与导入格式一致）。

**理由：**
- 导出后可直接用于批量导入，无需手动调整字段顺序
- region 在 sessionid 之前，符合"属性 → 值"的逻辑顺序
- 避免用户混淆导入/导出格式

## Risks / Trade-offs

### Risk 1: Region 持久化不完整

**风险：** 内存中有 region，但写入 file/redis 时丢失；重启后账号 region 为空，proxy 生成错误 bearer。

**缓解措施：**
- 在 `data-persistence.js` 的 `_saveToFile`/`_saveAllToFile` 中显式包含 `region`
- 在 `redis.js` 的 `setAccount` 中显式 `hset` region 字段
- 在 `_reloadAccountList` 中同步 `existing.region = freshAcc.region`
- 启动时检查所有账号是否有合法 region，缺失则记录警告

### Risk 2: CN 不可登录路径遗漏

**风险：** `_validateAndCleanSessionIds`/`refreshAccount`/`autoRefreshSessionIds` 任一遗漏都会触发 Playwright 登录，违背设计且持续失败。

**缓解措施：**
- 抽取统一的 `canAutoLogin(account)` 函数，所有路径调用此函数判断
- 在每个自动登录入口显式检查 `canAutoLogin`，不满足则跳过
- 添加日志记录跳过原因（如 "Skip auto-login for CN account"）

### Risk 3: 批量导入原子性实现复杂

**风险：** 校验通过后，导入过程中某个账号失败（如 Redis 写入失败），导致部分成功。

**缓解措施：**
- 先校验所有行，任一行失败则立即返回错误，不执行任何导入
- 导入过程中捕获异常，失败时记录详细错误信息
- 考虑使用事务（如 Redis MULTI/EXEC）保证原子性（可选）

### Risk 4: 前缀冲突未检测

**风险：** 账号 region 为 `hk`，但 sessionid 已有 `us-` 前缀，导致 `hk-us-xxx` 错误 token。

**缓解措施：**
- 信任 sessionid 原值，不做自动修正（Decision 3）
- 在导入时记录警告日志，提示用户检查 sessionid 前缀
- 文档中说明：手动导入 sessionid 时，应确保前缀与 region 一致

### Risk 5: 多实例 region 不同步

**风险：** A 实例更新 region，B 实例 `_reloadAccountList` 若不同步该字段会覆盖内存状态。

**缓解措施：**
- 在 `_reloadAccountList` 中显式同步 `region` 字段
- 确保 `_reloadAccountList` 的字段白名单包含 `region`

## Migration Plan

**部署步骤：**

1. **代码部署**
   - 部署包含 region 字段的新版本代码
   - 确保 `data-persistence.js` 和 `redis.js` 已更新序列化逻辑

2. **配置清理**
   - 从 `.env` 中移除 `REGION` 环境变量
   - 重启服务，确认无 `config.region` 引用错误

3. **数据导入**
   - 用户使用新格式 `email:password:region:sessionid` 批量导入账号
   - 验证账号列表显示 region 标签

4. **功能验证**
   - 测试 CN 区域账号请求（无前缀）
   - 测试非 CN 区域账号请求（有前缀）
   - 验证 CN 账号不触发自动登录

**回滚策略：**

- 如果发现严重问题，回滚到旧版本代码
- 重新设置 `REGION` 环境变量
- 清空账号数据，使用旧格式重新导入

**注意事项：**

- 无旧账号迁移需求，直接使用新格式导入即可
- 部署前确认用户已备份账号数据

## Open Questions

无待解决问题。所有歧义已在规划阶段消除。
