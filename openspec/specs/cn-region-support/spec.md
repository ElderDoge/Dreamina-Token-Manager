## ADDED Requirements

### Requirement: CN region accounts SHALL NOT trigger auto-login

CN 区域账号 SHALL NOT 在任何情况下触发自动登录流程（Playwright）。

#### Scenario: CN account added without sessionid

- **WHEN** 用户尝试添加 region 为 `cn`、有密码但无 sessionid 的账号
- **THEN** 系统 SHALL 拒绝添加并返回错误消息 "CN region requires sessionid"

#### Scenario: CN account sessionid expires

- **WHEN** CN 区域账号的 sessionid 到达过期时间
- **THEN** 系统 SHALL NOT 调用自动登录，SHALL NOT 标记账号为 disabled，仅在前端显示过期提示

#### Scenario: CN account in auto-refresh queue

- **WHEN** `autoRefreshSessionIds` 遍历账号列表
- **THEN** 系统 SHALL 跳过所有 region 为 `cn` 的账号，不进入刷新队列

#### Scenario: CN account validation

- **WHEN** `_validateAndCleanSessionIds` 检测到 CN 账号 sessionid 无效
- **THEN** 系统 SHALL NOT 尝试重新登录，SHALL 保留账号在列表中（不删除）

### Requirement: Empty password accounts SHALL NOT trigger auto-login

密码为空的账号 SHALL NOT 触发自动登录流程。

#### Scenario: Account with empty string password

- **WHEN** 账号 password 为空字符串 `""`
- **THEN** 系统 SHALL NOT 调用自动登录

#### Scenario: Account with whitespace-only password

- **WHEN** 账号 password 为纯空白字符 `"   "`
- **THEN** 系统 SHALL NOT 调用自动登录（trim 后为空）

#### Scenario: Account with null password

- **WHEN** 账号 password 为 `null` 或 `undefined`
- **THEN** 系统 SHALL NOT 调用自动登录

#### Scenario: Empty password account added without sessionid

- **WHEN** 用户添加 password 为空、region 为 `us`、无 sessionid 的账号
- **THEN** 系统 SHALL 拒绝添加并返回错误消息 "Password or sessionid is required"

### Requirement: CN region accounts SHALL have 60-day default expiry

CN 区域账号手动导入的 sessionid SHALL 默认设置 60 天过期时间。

#### Scenario: Import CN account with sessionid

- **WHEN** 用户导入 CN 区域账号，提供 sessionid 但无过期时间
- **THEN** 系统 SHALL 设置 `sessionid_expires` 为当前时间 + 60 天

#### Scenario: CN account expiry is display-only

- **WHEN** CN 账号的 `sessionid_expires` 时间已过
- **THEN** 前端 SHALL 显示过期标记，但账号仍可被代理层选中使用

### Requirement: CN region SHALL accept empty or "cn" as input

导入时，region 字段为空字符串 `""` 或 `"cn"` SHALL 均视为 CN 区域。

#### Scenario: Import with empty region string

- **WHEN** 用户导入账号，region 字段为空字符串 `""`
- **THEN** 系统 SHALL 将 region 存储为 `"cn"`

#### Scenario: Import with "cn" region

- **WHEN** 用户导入账号，region 字段为 `"cn"`
- **THEN** 系统 SHALL 将 region 存储为 `"cn"`

#### Scenario: Empty region requires sessionid

- **WHEN** 用户导入账号，region 为空字符串 `""`，但未提供 sessionid
- **THEN** 系统 SHALL 拒绝导入并返回错误消息 "CN region requires sessionid"

### Requirement: Non-CN accounts SHALL support auto-login

非 CN 区域账号 SHALL 支持通过密码自动登录获取 sessionid。

#### Scenario: Non-CN account auto-login on add

- **WHEN** 用户添加 region 为 `us`、有密码但无 sessionid 的账号
- **THEN** 系统 SHALL 调用 Playwright 自动登录获取 sessionid

#### Scenario: Non-CN account auto-refresh

- **WHEN** 非 CN 区域账号 sessionid 即将过期
- **THEN** `autoRefreshSessionIds` SHALL 将该账号加入刷新队列并自动刷新

#### Scenario: Non-CN account re-login on validation

- **WHEN** `_validateAndCleanSessionIds` 检测到非 CN 账号 sessionid 无效且有密码
- **THEN** 系统 SHALL 尝试重新登录获取新 sessionid

### Requirement: All regions SHALL use 60-day default expiry

所有区域的账号手动导入 sessionid 时 SHALL 默认设置 60 天过期时间（原为 30 天）。

#### Scenario: Import US account with sessionid

- **WHEN** 用户导入 region 为 `us` 的账号，提供 sessionid 但无过期时间
- **THEN** 系统 SHALL 设置 `sessionid_expires` 为当前时间 + 60 天

#### Scenario: Import HK account with sessionid

- **WHEN** 用户导入 region 为 `hk` 的账号，提供 sessionid 但无过期时间
- **THEN** 系统 SHALL 设置 `sessionid_expires` 为当前时间 + 60 天
