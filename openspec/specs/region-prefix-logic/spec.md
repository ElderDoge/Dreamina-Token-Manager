## ADDED Requirements

### Requirement: Proxy SHALL use account region for prefix logic

代理层 SHALL 读取账号的 `region` 字段来决定 sessionid 前缀策略，而非使用全局 `config.region`。

#### Scenario: Non-CN account adds region prefix

- **WHEN** 代理层选中 region 为 `us` 的账号，sessionid 为 `abc123`
- **THEN** Authorization header SHALL 为 `Bearer us-abc123`

#### Scenario: Non-CN account with existing prefix

- **WHEN** 代理层选中 region 为 `hk` 的账号，sessionid 已为 `hk-xyz789`
- **THEN** Authorization header SHALL 为 `Bearer hk-xyz789`（不重复添加前缀）

#### Scenario: CN account no prefix

- **WHEN** 代理层选中 region 为 `cn` 的账号，sessionid 为 `cn-session456`
- **THEN** Authorization header SHALL 为 `Bearer cn-session456`（不添加任何前缀）

#### Scenario: Mixed region accounts in pool

- **WHEN** 账号池包含 `us`、`hk`、`cn` 三个区域的账号
- **THEN** 每个账号被选中时 SHALL 使用各自的 region 前缀策略

### Requirement: Prefix logic SHALL be idempotent

对同一账号多次应用前缀逻辑 SHALL 产生相同结果。

#### Scenario: Apply prefix twice to non-CN account

- **WHEN** 对 region 为 `us`、sessionid 为 `abc123` 的账号应用前缀逻辑两次
- **THEN** 两次结果均为 `us-abc123`（不产生 `us-us-abc123`）

#### Scenario: Apply prefix twice to CN account

- **WHEN** 对 region 为 `cn`、sessionid 为 `xyz789` 的账号应用前缀逻辑两次
- **THEN** 两次结果均为 `xyz789`（不添加任何前缀）

### Requirement: System SHALL trust sessionid original value

系统 SHALL 信任用户导入的 sessionid 原值，不进行前缀修正。

#### Scenario: Sessionid prefix matches region

- **WHEN** 用户导入 region 为 `us`、sessionid 为 `us-abc123` 的账号
- **THEN** 系统 SHALL 保留 sessionid 为 `us-abc123`，不做修改

#### Scenario: Sessionid prefix mismatches region

- **WHEN** 用户导入 region 为 `hk`、sessionid 为 `us-abc123` 的账号
- **THEN** 系统 SHALL 保留 sessionid 为 `us-abc123`，记录警告日志 "Region mismatch: account region is hk but sessionid has us- prefix"

#### Scenario: Sessionid without prefix for non-CN region

- **WHEN** 用户导入 region 为 `jp`、sessionid 为 `xyz789`（无前缀）的账号
- **THEN** 代理层使用时 SHALL 添加 `jp-` 前缀，生成 `Bearer jp-xyz789`
