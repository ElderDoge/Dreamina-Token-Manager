## ADDED Requirements

### Requirement: Account SHALL have region field

每个账号对象 SHALL 包含 `region` 字段，用于标识账号所属区域。

- 类型：字符串
- 必填：是（导入时必须提供）
- 合法值：`us`、`hk`、`jp`、`sg`、`cn`（固定枚举）
- 大小写：不区分大小写，存储前统一转小写

#### Scenario: Account created with valid region

- **WHEN** 用户导入账号时提供 region 字段为 `us`
- **THEN** 账号对象的 `region` 字段为 `us`

#### Scenario: Account created with uppercase region

- **WHEN** 用户导入账号时提供 region 字段为 `CN`
- **THEN** 账号对象的 `region` 字段为 `cn`（统一转小写）

#### Scenario: Account created with invalid region

- **WHEN** 用户导入账号时提供 region 字段为 `eu`
- **THEN** 系统 SHALL 拒绝导入并返回错误消息 "Invalid region: eu. Allowed values: us, hk, jp, sg, cn"

#### Scenario: Account created without region

- **WHEN** 用户导入账号时未提供 region 字段
- **THEN** 系统 SHALL 拒绝导入并返回错误消息 "Region is required"

### Requirement: Region SHALL persist across restarts

账号的 `region` 字段 SHALL 在文件和 Redis 持久化模式下正确保存和读取。

#### Scenario: Region persists in file mode

- **WHEN** 账号 region 为 `us` 并保存到文件
- **THEN** 重启后读取该账号，region 字段为 `us`

#### Scenario: Region persists in Redis mode

- **WHEN** 账号 region 为 `cn` 并保存到 Redis
- **THEN** 重启后从 Redis 读取该账号，region 字段为 `cn`

#### Scenario: Region syncs in multi-instance

- **WHEN** 实例 A 更新账号 region 为 `hk`
- **THEN** 实例 B 调用 `_reloadAccountList` 后，该账号的 region 为 `hk`

### Requirement: Region SHALL be immutable after creation

账号创建后，`region` 字段 SHALL NOT 允许修改。

#### Scenario: Update account region via API

- **WHEN** 用户尝试通过 `POST /api/dreamina/setAccount` 更新已存在账号的 region
- **THEN** 系统 SHALL 忽略 region 字段更新，保留原 region 值

#### Scenario: Region preserved during reload

- **WHEN** `_reloadAccountList` 同步账号数据
- **THEN** 系统 SHALL 保留账号原有的 region 值，不覆盖

### Requirement: Batch import SHALL validate all lines before importing

批量导入 SHALL 采用原子性策略：全部成功或全部失败。

#### Scenario: All lines valid

- **WHEN** 用户批量导入 10 行账号，所有行格式正确且 region 合法
- **THEN** 系统 SHALL 成功导入全部 10 个账号

#### Scenario: One line invalid

- **WHEN** 用户批量导入 10 行账号，第 5 行 region 为非法值 `eu`
- **THEN** 系统 SHALL 拒绝全部导入，返回错误消息列表，包含第 5 行的错误原因

#### Scenario: CN region missing sessionid

- **WHEN** 用户批量导入包含 CN 区域账号但未提供 sessionid
- **THEN** 系统 SHALL 拒绝全部导入，返回错误消息 "CN region requires sessionid"

### Requirement: Batch import format SHALL be email:password:region[:sessionid]

批量导入格式 SHALL 为 `email:password:region[:sessionid]`，其中 region 必填，sessionid 可选（CN 区域除外）。

#### Scenario: Import non-CN account with password only

- **WHEN** 用户导入行 `user@example.com:password123:us`
- **THEN** 系统 SHALL 创建账号，email 为 `user@example.com`，password 为 `password123`，region 为 `us`，并自动登录获取 sessionid

#### Scenario: Import non-CN account with sessionid

- **WHEN** 用户导入行 `user@example.com:password123:hk:hk-sessionid123`
- **THEN** 系统 SHALL 创建账号，email 为 `user@example.com`，password 为 `password123`，region 为 `hk`，sessionid 为 `hk-sessionid123`，过期时间为 60 天后

#### Scenario: Import CN account with sessionid

- **WHEN** 用户导入行 `user@example.com::cn:cn-sessionid456`（密码为空）
- **THEN** 系统 SHALL 创建账号，email 为 `user@example.com`，password 为空，region 为 `cn`，sessionid 为 `cn-sessionid456`，过期时间为 60 天后

#### Scenario: Import CN account without sessionid

- **WHEN** 用户导入行 `user@example.com::cn`（密码和 sessionid 均为空）
- **THEN** 系统 SHALL 拒绝导入并返回错误消息 "CN region requires sessionid"

### Requirement: Export format SHALL be email:password:region:sessionid

导出格式 SHALL 为 `email:password:region:sessionid`，与导入格式顺序一致。

#### Scenario: Export account with all fields

- **WHEN** 用户导出账号，email 为 `user@example.com`，password 为 `pass123`，region 为 `us`，sessionid 为 `us-session789`
- **THEN** 导出行为 `user@example.com:pass123:us:us-session789`

#### Scenario: Export CN account

- **WHEN** 用户导出 CN 区域账号，email 为 `cn@example.com`，password 为空，region 为 `cn`，sessionid 为 `cn-session456`
- **THEN** 导出行为 `cn@example.com::cn:cn-session456`

#### Scenario: Export-import symmetry

- **WHEN** 用户导出账号列表并重新导入
- **THEN** 导入后的账号数据 SHALL 与导出前一致（email、password、region、sessionid 均相同）
