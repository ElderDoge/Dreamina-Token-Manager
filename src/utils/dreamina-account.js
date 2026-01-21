const config = require('../config/index.js')
const DataPersistence = require('./data-persistence')
const DreaminaTokenManager = require('./dreamina-token-manager')
const { logger } = require('./logger')
const dailyStats = require('./daily-stats')

class DreaminaAccount {
    constructor() {
        this.dataPersistence = new DataPersistence()
        this.tokenManager = new DreaminaTokenManager()

        this.dreaminaAccounts = []
        this.isInitialized = false
        this._dailyTimer = null
        this._lastDailyRunDate = null
        this._isReloading = false
        this._lastAccountListRefresh = 0  // 上次账号列表刷新时间
        this._accountListLock = Promise.resolve()  // 账号列表操作锁
        this._lastDailyResetDate = null  // 上次日切重置日期
        this.processingEmails = new Set()

        // 活跃状态同步相关
        this._accountSyncTimer = null  // 后台同步定时器
        this._lastActivityAt = 0  // 上次活跃时间（调用 pickAccountByWeight）
        this._idleTimeoutMs = 15 * 60 * 1000  // 闲置超时：15 分钟

        this._initialize()
    }

    async _initialize() {
        try {
            await this.loadAccounts()

            if (config.autoRefresh) {
                this.refreshInterval = setInterval(
                    () => this.autoRefreshSessionIds(),
                    (config.autoRefreshInterval || 21600) * 1000
                )
            }

            // 设置每日定时刷新（按指定时区与时间）
            this._setupDailyRefresh()

            this.isInitialized = true
            logger.success(`Dreamina 账户管理器初始化完成，共加载 ${this.dreaminaAccounts.length} 个账户`, 'DREAMINA')
        } catch (error) {
            logger.error('Dreamina 账户管理器初始化失败', 'DREAMINA', '', error)
        }
    }

    _setupDailyRefresh() {
        try {
            const timeStr = config.dailySessionUpdateTime
            if (!timeStr) {
                logger.info('未配置 DAILY_SESSION_UPDATE_TIME，跳过每日刷新调度', 'SCHEDULE')
            }

            // 清理旧定时器
            if (this._dailyTimer) clearInterval(this._dailyTimer)

            // 每分钟检查一次：日切重置 + 目标时区时间刷新
            this._dailyTimer = setInterval(() => {
                // 始终检查日切重置（北京时间 00:00）
                this.resetDailyAvailability()

                // 如果配置了每日刷新时间，检查是否需要刷新 SessionID
                if (timeStr) {
                    const [hStr, mStr] = timeStr.split(':')
                    const hour = Number(hStr)
                    const minute = Number(mStr)
                    if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                        this._checkDailyRefresh(hour, minute)
                    }
                }
            }, 60 * 1000)

            if (timeStr) {
                const [hStr, mStr] = timeStr.split(':')
                const hour = Number(hStr)
                const minute = Number(mStr)
                if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                    logger.warn(`无效的 DAILY_SESSION_UPDATE_TIME: ${timeStr}，期望 HH:mm（24小时制）`, 'SCHEDULE')
                } else {
                    logger.info(`已启用每日刷新调度：${timeStr} @ ${config.timeZone || 'UTC'}`, 'SCHEDULE', '⏰')
                }
            }
            logger.info('已启用每分钟日切检查（北京时间 00:00）', 'SCHEDULE')
        } catch (e) {
            logger.error('每日刷新调度初始化失败', 'SCHEDULE', '', e)
        }
    }

    /**
     * 获取账号列表操作锁，确保同一时间只有一个操作在修改账号列表
     */
    async _withAccountListLock(fn) {
        const prevLock = this._accountListLock
        let resolve
        this._accountListLock = new Promise(r => { resolve = r })
        try {
            await prevLock
            return await fn()
        } finally {
            resolve()
        }
    }

    /**
     * 检查是否需要刷新账号列表（按需刷新，带节流）
     * @param {boolean} force 是否强制刷新（忽略节流）
     * @returns {Promise<boolean>} 是否真正执行了同步
     */
    async _checkAndReloadAccountList(force = false) {
        const interval = config.accountListRefreshInterval
        if (!interval || interval <= 0) return false

        const now = Date.now()
        if (!force && now - this._lastAccountListRefresh < interval * 1000) return false

        const synced = await this._reloadAccountList()
        if (synced) {
            this._lastAccountListRefresh = Date.now()
        }
        return synced
    }

    /**
     * 重新加载账号列表
     * @returns {Promise<boolean>} 是否真正完成了同步
     */
    async _reloadAccountList() {
        if (this._isReloading) return false
        this._isReloading = true

        let synced = false
        try {
            await this._withAccountListLock(async () => {
                const freshAccounts = await this.dataPersistence.loadAccounts()

                // 空数组保护：如果 Redis 返回空但当前有账号，可能是连接问题，跳过本次同步
                if (freshAccounts.length === 0 && this.dreaminaAccounts.length > 0) {
                    logger.warn('账号列表同步: Redis 返回空列表，跳过本次同步（可能是连接问题）', 'SYNC')
                    return
                }

                const validFresh = freshAccounts.filter(a => a.sessionid || a.password)

                const currentEmails = new Set(this.dreaminaAccounts.map(a => a.email))
                const freshEmails = new Set(validFresh.map(a => a.email))

                // 计算新增和删除
                const added = validFresh.filter(a => !currentEmails.has(a.email))
                const removed = this.dreaminaAccounts.filter(a => !freshEmails.has(a.email))

                // 更新已有账号的字段（从 Redis 同步）
                for (const freshAcc of validFresh) {
                    const existing = this.dreaminaAccounts.find(a => a.email === freshAcc.email)
                    if (existing) {
                        existing.password = freshAcc.password
                        existing.weight = freshAcc.weight
                        existing.daily_consecutive_fails = freshAcc.daily_consecutive_fails
                        existing.daily_unavailable_date = freshAcc.daily_unavailable_date
                        existing.last_fail_date = freshAcc.last_fail_date
                        existing.consecutive_fail_days = freshAcc.consecutive_fail_days
                        existing.overall_unavailable = freshAcc.overall_unavailable
                        existing.disabled = freshAcc.disabled
                        existing.sessionid = freshAcc.sessionid
                        existing.sessionid_expires = freshAcc.sessionid_expires
                        // daily_call_total 在下面统一从 Redis 同步
                    }
                }

                // 添加新账号
                for (const acc of added) {
                    this.dreaminaAccounts.push(acc)
                }

                // 移除已删除的账号
                for (const acc of removed) {
                    const idx = this.dreaminaAccounts.findIndex(a => a.email === acc.email)
                    if (idx !== -1) {
                        this.dreaminaAccounts.splice(idx, 1)
                    }
                }

                // 同步所有账号的当日调用计数（从 Redis 获取最新值）
                await this._syncDailyCallTotals()

                // 对新增账号进行 sessionid 验证和登录
                if (added.length > 0) {
                    await this._validateAndCleanSessionIds()
                }

                if (added.length > 0 || removed.length > 0) {
                    logger.info(`账号列表同步: +${added.length} -${removed.length}，当前共 ${this.dreaminaAccounts.length} 个`, 'SYNC')
                }

                synced = true  // 标记同步成功
            })
        } catch (e) {
            logger.error('账号列表重载失败', 'SYNC', '', e)
        } finally {
            this._isReloading = false
        }
        return synced
    }

    /**
     * 获取北京时间的日期字符串（用于日切判断）
     * @returns {string} 格式: YYYY-MM-DD
     */
    _getBeijingDateStr() {
        const now = new Date()
        // 北京时间 = UTC + 8
        const beijingOffset = 8 * 60 * 60 * 1000
        const beijingNow = new Date(now.getTime() + beijingOffset)
        const y = beijingNow.getUTCFullYear()
        const m = String(beijingNow.getUTCMonth() + 1).padStart(2, '0')
        const d = String(beijingNow.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }

    _getNowInTimezoneParts() {
        const tz = config.timeZone || 'UTC'
        try {
            const fmt = new Intl.DateTimeFormat('en-CA', {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            })
            const parts = fmt.formatToParts(new Date())
            const map = {}
            for (const p of parts) map[p.type] = p.value
            return {
                year: map.year,
                month: map.month,
                day: map.day,
                hour: map.hour,
                minute: map.minute,
                dateStr: `${map.year}-${map.month}-${map.day}`
            }
        } catch (e) {
            // 回退到本地时间
            const now = new Date()
            const y = String(now.getFullYear())
            const mo = String(now.getMonth() + 1).padStart(2, '0')
            const d = String(now.getDate()).padStart(2, '0')
            const h = String(now.getHours()).padStart(2, '0')
            const mi = String(now.getMinutes()).padStart(2, '0')
            logger.warn(`无效的 TIMEZONE: ${config.timeZone}，已回退为本地时区`, 'SCHEDULE')
            return { year: y, month: mo, day: d, hour: h, minute: mi, dateStr: `${y}-${mo}-${d}` }
        }
    }

    async _checkDailyRefresh(targetHour, targetMinute) {
        try {
            if (!this.isInitialized) return
            const now = this._getNowInTimezoneParts()
            if (Number(now.hour) === targetHour && Number(now.minute) === targetMinute) {
                if (this._lastDailyRunDate === now.dateStr) return

                this._lastDailyRunDate = now.dateStr
                logger.info(`触发每日 SessionID 批量刷新（全部账户）`, 'SCHEDULE', '🔁', { date: now.dateStr, time: `${now.hour}:${now.minute}`, tz: config.timeZone })
                // 刷新全部账户（用超大阈值确保覆盖）
                try {
                    const count = await this.autoRefreshSessionIds(8760)
                    logger.success(`每日批量刷新完成，成功数量：${count}`, 'SCHEDULE')
                } catch (err) {
                    logger.error('每日批量刷新执行失败', 'SCHEDULE', '', err)
                }
            }
        } catch (e) {
            logger.error('每日刷新检查异常', 'SCHEDULE', '', e)
        }
    }

    async loadAccounts() {
        try {
            const allAccounts = await this.dataPersistence.loadAccounts()
            // 保留有 sessionid 或有密码（可以登录获取 sessionid）的账号
            this.dreaminaAccounts = allAccounts.filter(account => account.sessionid || account.password)

            if (this.dreaminaAccounts.length === 0) {
                this.dreaminaAccounts = []
            }

            await this._validateAndCleanSessionIds()

            // 从 Redis 同步当日调用计数到内存
            await this._syncDailyCallTotals()

            logger.success(`成功加载 ${this.dreaminaAccounts.length} 个 Dreamina 账户`, 'DREAMINA')
        } catch (error) {
            logger.error('加载 Dreamina 账户失败', 'DREAMINA', '', error)
            this.dreaminaAccounts = []
        }
    }

    async _syncDailyCallTotals() {
        if (this.dreaminaAccounts.length === 0) return

        try {
            const emails = this.dreaminaAccounts.map(acc => acc.email)
            const stats = await dailyStats.batchGet(emails)
            for (const acc of this.dreaminaAccounts) {
                acc.daily_call_total = stats[acc.email]?.daily_call_total || 0
            }
            logger.info(`已同步 ${emails.length} 个账户的当日调用计数`, 'AVAILABILITY')
        } catch (e) {
            logger.warn(`同步当日调用计数失败: ${e.message}`, 'AVAILABILITY')
            // 失败时初始化为 0
            for (const acc of this.dreaminaAccounts) {
                acc.daily_call_total = acc.daily_call_total || 0
            }
        }
    }

    async _validateAndCleanSessionIds() {
        const validAccounts = []

        for (const account of this.dreaminaAccounts) {
            if (account.sessionid && this.tokenManager.validateSessionId(account.sessionid, account.sessionid_expires)) {
                validAccounts.push(account)
            } else if (account.email && account.password) {
                logger.info(`SessionID 无效，尝试重新登录: ${account.email}`, 'DREAMINA', '🔄')
                const result = await this.tokenManager.login(account.email, account.password)
                if (result) {
                    account.sessionid = result.sessionid
                    account.sessionid_expires = result.expires
                    account.disabled = false
                    validAccounts.push(account)
                }
            }
        }

        this.dreaminaAccounts = validAccounts
    }

    async autoRefreshSessionIds(thresholdHours = 24) {
        if (!this.isInitialized) {
            logger.warn('Dreamina 账户管理器尚未初始化，跳过自动刷新', 'DREAMINA')
            return 0
        }

        logger.info('开始自动刷新 Dreamina SessionID...', 'DREAMINA', '🔄')

        const needsRefresh = this.dreaminaAccounts.filter(account =>
            this.tokenManager.isSessionIdExpiringSoon(account.sessionid_expires, thresholdHours)
        )

        if (needsRefresh.length === 0) {
            logger.info('没有需要刷新的 SessionID', 'DREAMINA')
            return 0
        }

        logger.info(`发现 ${needsRefresh.length} 个 SessionID 需要刷新`, 'DREAMINA')

        let successCount = 0
        let failedCount = 0
        const concurrency = config.batchAddConcurrency

        await this._processBatch(needsRefresh, concurrency, async (account) => {
            try {
                const updatedAccount = await this.tokenManager.refreshSessionId(account)
                if (updatedAccount) {
                    updatedAccount.disabled = false
                    const index = this.dreaminaAccounts.findIndex(acc => acc.email === account.email)
                    if (index !== -1) {
                        this.dreaminaAccounts[index] = updatedAccount
                    }

                    await this.dataPersistence.saveAccount(account.email, {
                        password: updatedAccount.password,
                        sessionid: updatedAccount.sessionid,
                        sessionid_expires: updatedAccount.sessionid_expires,
                        disabled: false,
                        // 保留可用性字段
                        weight: account.weight,
                        daily_consecutive_fails: account.daily_consecutive_fails,
                        daily_unavailable_date: account.daily_unavailable_date,
                        last_fail_date: account.last_fail_date,
                        consecutive_fail_days: account.consecutive_fail_days,
                        overall_unavailable: account.overall_unavailable
                    })

                    // 更新内存中的状态
                    account.disabled = false

                    successCount++
                    logger.info(`账户 ${account.email} SessionID 刷新并保存成功`, 'DREAMINA', '✅')
                } else {
                    failedCount++
                    account.disabled = true
                    logger.error(`账户 ${account.email} SessionID 刷新失败，已禁用该账户`, 'DREAMINA', '❌')
                }
            } catch (error) {
                failedCount++
                account.disabled = true
                logger.error(`账户 ${account.email} 刷新过程中出错，已禁用该账户`, 'DREAMINA', '', error)
            }
        })

        logger.success(`SessionID 刷新完成: 成功 ${successCount} 个，失败 ${failedCount} 个`, 'DREAMINA')
        return successCount
    }

    async _processBatch(items, limit, fn) {
        const results = []
        const executing = []
        for (const item of items) {
            const p = Promise.resolve().then(() => fn(item))
            results.push(p)
            if (limit <= items.length) {
                const e = p.then(() => executing.splice(executing.indexOf(e), 1))
                executing.push(e)
                if (executing.length >= limit) {
                    await Promise.race(executing)
                }
            }
        }
        return Promise.all(results)
    }

    async addAccount(email, password, existingSessionId = null) {
        try {
            const existingAccount = this.dreaminaAccounts.find(acc => acc.email === email)
            if (existingAccount) {
                logger.warn(`Dreamina 账户 ${email} 已存在`, 'DREAMINA')
                return false
            }

            if (this.processingEmails.has(email)) {
                logger.warn(`Dreamina 账户 ${email} 正在添加中，请勿重复提交`, 'DREAMINA')
                return false
            }

            this.processingEmails.add(email)

            try {
                let sessionid, sessionid_expires

                if (existingSessionId) {
                    sessionid = existingSessionId
                    sessionid_expires = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
                    logger.info(`使用已有 SessionID 添加账户: ${email}`, 'DREAMINA')
                } else {
                    const result = await this.tokenManager.login(email, password)
                    if (!result) {
                        logger.error(`Dreamina 账户 ${email} 登录失败，无法添加`, 'DREAMINA')
                        return false
                    }
                    sessionid = result.sessionid
                    sessionid_expires = result.expires
                }

                const newAccount = {
                    email,
                    password,
                    sessionid,
                    sessionid_expires,
                    disabled: false,
                    // 可用性字段
                    weight: 100,
                    daily_consecutive_fails: 0,
                    daily_unavailable_date: null,
                    last_fail_date: null,
                    consecutive_fail_days: 0,
                    overall_unavailable: false,
                    daily_call_total: 0
                }

                await this._withAccountListLock(async () => {
                    // 再次检查是否已存在（可能在等待锁期间被添加）
                    if (this.dreaminaAccounts.find(acc => acc.email === email)) {
                        logger.warn(`Dreamina 账户 ${email} 已存在（并发添加）`, 'DREAMINA')
                        return
                    }
                    this.dreaminaAccounts.push(newAccount)
                })

                await this.dataPersistence.saveAccount(email, newAccount)

                logger.success(`成功添加 Dreamina 账户: ${email}`, 'DREAMINA')
                return true
            } finally {
                this.processingEmails.delete(email)
            }
        } catch (error) {
            logger.error(`添加 Dreamina 账户失败 (${email})`, 'DREAMINA', '', error)
            return false
        }
    }

    async removeAccount(email) {
        try {
            return await this._withAccountListLock(async () => {
                const index = this.dreaminaAccounts.findIndex(acc => acc.email === email)
                if (index === -1) {
                    logger.warn(`Dreamina 账户 ${email} 不存在`, 'DREAMINA')
                    return false
                }

                this.dreaminaAccounts.splice(index, 1)

                logger.success(`成功移除 Dreamina 账户: ${email}`, 'DREAMINA')
                return true
            })
        } catch (error) {
            logger.error(`移除 Dreamina 账户失败 (${email})`, 'DREAMINA', '', error)
            return false
        }
    }

    async refreshAccount(email) {
        const account = this.dreaminaAccounts.find(acc => acc.email === email)
        if (!account) {
            logger.error(`未找到邮箱为 ${email} 的 Dreamina 账户`, 'DREAMINA')
            return false
        }

        const updatedAccount = await this.tokenManager.refreshSessionId(account)
        if (updatedAccount) {
            // 刷新成功：重置权重（视为没有失败过），但保留调用次数降权
            let newWeight = 100
            const calls = account.daily_call_total || 0
            const threshold = config.callCountThreshold || 0
            const weightDecrease = config.callCountWeightDecrease || 0
            const minWeight = config.callCountWeightMin || 0
            if (threshold > 0 && calls > threshold) {
                newWeight = Math.max(newWeight - (calls - threshold) * weightDecrease, minWeight)
            }

            updatedAccount.disabled = false
            updatedAccount.weight = newWeight
            updatedAccount.daily_consecutive_fails = 0
            updatedAccount.daily_unavailable_date = null
            updatedAccount.consecutive_fail_days = 0
            updatedAccount.overall_unavailable = false
            updatedAccount.daily_call_total = calls

            await this._withAccountListLock(async () => {
                const index = this.dreaminaAccounts.findIndex(acc => acc.email === email)
                if (index !== -1) {
                    this.dreaminaAccounts[index] = updatedAccount
                }
            })

            await this.dataPersistence.saveAccount(email, {
                password: updatedAccount.password,
                sessionid: updatedAccount.sessionid,
                sessionid_expires: updatedAccount.sessionid_expires,
                disabled: false,
                weight: newWeight,
                daily_consecutive_fails: 0,
                daily_unavailable_date: null,
                last_fail_date: account.last_fail_date,
                consecutive_fail_days: 0,
                overall_unavailable: false
            })

            logger.info(`账户 ${email} 刷新成功，权重重置为 ${newWeight}`, 'AVAILABILITY')

            return true
        }

        account.disabled = true // Mark as disabled on refresh failure
        await this.dataPersistence.saveAccount(email, { ...account, disabled: true }) // Persist disabled state
        return false
    }

    getAllAccounts() {
        return this.dreaminaAccounts
    }

    getHealthStats() {
        const sessionIdStats = this.tokenManager.getSessionIdHealthStats(this.dreaminaAccounts)

        return {
            accounts: sessionIdStats,
            initialized: this.isInitialized
        }
    }

    // ==================== 可用性管理 ====================

    /**
     * 记录调用成功，恢复权重并重置连续失败计数
     */
    async recordSuccess(account) {
        if (!account) return

        const acc = this.dreaminaAccounts.find(a => a.email === account.email)
        if (!acc) return

        // 重置当日连续失败计数
        acc.daily_consecutive_fails = 0

        // 恢复权重
        const oldWeight = typeof acc.weight === 'number' ? acc.weight : 100
        const weightIncrease = config.availabilityWeightOnSuccess || 5
        let newWeight = Math.min(oldWeight + weightIncrease, 100)

        // 根据当日调用次数进一步调整权重
        const calls = acc.daily_call_total || 0
        const threshold = config.callCountThreshold
        const weightDecrease = config.callCountWeightDecrease
        const minWeight = config.callCountWeightMin
        if (calls > threshold) {
            newWeight = Math.max(newWeight - (calls - threshold) * weightDecrease, minWeight)
        }

        acc.weight = newWeight

        if (acc.weight !== oldWeight) {
            logger.info(`账户 ${acc.email} 权重变化: ${oldWeight} -> ${acc.weight}`, 'AVAILABILITY')
        }

        // 异步持久化，不阻塞
        this.dataPersistence.saveAccount(acc.email, acc).catch(e =>
            logger.error(`保存账户可用性状态失败: ${acc.email}`, 'AVAILABILITY', '', e)
        )
    }

    /**
     * 记录认证失败（401），直接标记当日不可用
     */
    async recordAuthFailure(account) {
        if (!account) return

        const acc = this.dreaminaAccounts.find(a => a.email === account.email)
        if (!acc) return

        const today = this._getBeijingDateStr()
        const maxFailDays = config.availabilityMaxFailDays || 2

        // 直接标记为当日不可用
        acc.weight = 0
        acc.daily_unavailable_date = today
        logger.warn(`账户 ${acc.email} 认证失败 (401)，标记为当日不可用`, 'AVAILABILITY')

        // 更新连续失败天数
        if (acc.last_fail_date) {
            const lastDate = new Date(acc.last_fail_date)
            const todayDate = new Date(today)
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24))

            if (diffDays === 1) {
                acc.consecutive_fail_days = (acc.consecutive_fail_days || 0) + 1
            } else if (diffDays > 1) {
                acc.consecutive_fail_days = 1
            }
        } else {
            acc.consecutive_fail_days = 1
        }

        acc.last_fail_date = today

        // 检查是否应标记为整体不可用
        if (acc.consecutive_fail_days >= maxFailDays) {
            acc.overall_unavailable = true
            logger.error(`账户 ${acc.email} 连续 ${acc.consecutive_fail_days} 天不可用，标记为整体不可用`, 'AVAILABILITY')
        }

        // 异步持久化
        this.dataPersistence.saveAccount(acc.email, acc).catch(e =>
            logger.error(`保存账户可用性状态失败: ${acc.email}`, 'AVAILABILITY', '', e)
        )
    }

    /**
     * 记录调用失败（429/500），降低权重并增加连续失败计数
     */
    async recordFailure(account) {
        if (!account) return

        const acc = this.dreaminaAccounts.find(a => a.email === account.email)
        if (!acc) return

        const today = this._getBeijingDateStr()
        const failThreshold = config.availabilityDailyFailThreshold || 5
        const failWeightDecrease = config.availabilityWeightOnFail || 10
        const maxFailDays = config.availabilityMaxFailDays || 2

        // 降低权重
        const oldWeight = typeof acc.weight === 'number' ? acc.weight : 100
        let newWeight = Math.max(oldWeight - failWeightDecrease, 0)

        // 根据当日调用次数进一步调整权重
        const calls = acc.daily_call_total || 0
        const callThreshold = config.callCountThreshold
        const callWeightDecrease = config.callCountWeightDecrease
        const minWeight = config.callCountWeightMin
        if (calls > callThreshold) {
            newWeight = Math.max(newWeight - (calls - callThreshold) * callWeightDecrease, minWeight)
        }

        acc.weight = newWeight
        logger.info(`账户 ${acc.email} 权重变化: ${oldWeight} -> ${acc.weight}`, 'AVAILABILITY')

        // 增加当日连续失败计数
        acc.daily_consecutive_fails = (acc.daily_consecutive_fails || 0) + 1

        // 检查是否达到当日不可用阈值
        if (acc.daily_consecutive_fails >= failThreshold && acc.daily_unavailable_date !== today) {
            acc.daily_unavailable_date = today
            acc.weight = 0
            logger.warn(`账户 ${acc.email} 当日连续失败 ${failThreshold} 次，标记为当日不可用`, 'AVAILABILITY')

            // 更新连续失败天数
            if (acc.last_fail_date) {
                const lastDate = new Date(acc.last_fail_date)
                const todayDate = new Date(today)
                const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24))

                if (diffDays === 1) {
                    // 连续天
                    acc.consecutive_fail_days = (acc.consecutive_fail_days || 0) + 1
                } else if (diffDays > 1) {
                    // 非连续，重置
                    acc.consecutive_fail_days = 1
                }
                // diffDays === 0 表示同一天，不增加
            } else {
                acc.consecutive_fail_days = 1
            }

            acc.last_fail_date = today

            // 检查是否应标记为整体不可用
            if (acc.consecutive_fail_days >= maxFailDays) {
                acc.overall_unavailable = true
                logger.error(`账户 ${acc.email} 连续 ${acc.consecutive_fail_days} 天不可用，标记为整体不可用`, 'AVAILABILITY')
            }
        }

        // 异步持久化，不阻塞
        this.dataPersistence.saveAccount(acc.email, acc).catch(e =>
            logger.error(`保存账户可用性状态失败: ${acc.email}`, 'AVAILABILITY', '', e)
        )
    }

    /**
     * 日切重置：清除过期的当日不可用状态和连续失败计数
     * 使用北京时间 00:00 作为日切基准，与 Redis stats:daily 保持一致
     */
    resetDailyAvailability() {
        const today = this._getBeijingDateStr()

        // 如果今天已经重置过，跳过
        if (this._lastDailyResetDate === today) return

        // 只在北京时间 00:00-00:05 窗口内执行日切，避免新实例启动时误触发
        const now = new Date()
        const beijingHour = (now.getUTCHours() + 8) % 24
        const beijingMinute = now.getUTCMinutes()
        if (beijingHour !== 0 || beijingMinute > 5) {
            // 不在日切窗口内，标记今天已处理（跳过），避免后续重复检查
            this._lastDailyResetDate = today
            return
        }

        this._lastDailyResetDate = today
        let resetCount = 0

        for (const acc of this.dreaminaAccounts) {
            let needsSave = false

            // 重置当日不可用状态（如果不是今天标记的）
            if (acc.daily_unavailable_date && acc.daily_unavailable_date !== today) {
                acc.daily_unavailable_date = null
                // 恢复权重到默认值（如果不是整体不可用）
                if (!acc.overall_unavailable) {
                    acc.weight = 100
                }
                needsSave = true
                resetCount++
            }

            // 重置当日连续失败计数
            if (acc.daily_consecutive_fails > 0) {
                acc.daily_consecutive_fails = 0
                needsSave = true
            }

            // 重置当日调用计数并恢复因调用次数降权的账号
            if (acc.daily_call_total > 0) {
                acc.daily_call_total = 0
                // 如果账号未被标记为当日不可用且不是整体不可用，恢复权重
                if (!acc.daily_unavailable_date && !acc.overall_unavailable && acc.weight < 100) {
                    acc.weight = 100
                    needsSave = true
                }
            }

            if (needsSave) {
                // 异步持久化
                this.dataPersistence.saveAccount(acc.email, acc).catch(() => {})
            }
        }

        if (resetCount > 0) {
            logger.info(`日切重置：${resetCount} 个账户的当日可用性已重置`, 'AVAILABILITY')
        }
    }

    /**
     * 手动恢复账号可用性
     */
    async restoreAccount(email) {
        const acc = this.dreaminaAccounts.find(a => a.email === email)
        if (!acc) {
            logger.error(`未找到账户: ${email}`, 'AVAILABILITY')
            return false
        }

        acc.weight = 100
        acc.daily_consecutive_fails = 0
        acc.daily_unavailable_date = null
        acc.consecutive_fail_days = 0
        acc.overall_unavailable = false

        await this.dataPersistence.saveAccount(email, acc)
        logger.success(`账户 ${email} 可用性已恢复`, 'AVAILABILITY')
        return true
    }

    /**
     * 刷新不可用账号
     */
    async refreshUnavailableAccounts() {
        const today = this._getBeijingDateStr()
        const targets = this.dreaminaAccounts.filter(account =>
            account.overall_unavailable === true || account.daily_unavailable_date === today
        )

        let refreshedCount = 0
        let failedCount = 0

        for (const account of targets) {
            const success = await this.refreshAccount(account.email)
            if (success) {
                refreshedCount++
            } else {
                failedCount++
            }
        }

        return { total: targets.length, refreshedCount, failedCount }
    }

    /**
     * 递增账号的当日调用计数（同时更新内存和 Redis）
     * @param {string} email 账号邮箱
     */
    async incrementDailyCallTotal(email) {
        const acc = this.dreaminaAccounts.find(a => a.email === email)
        if (acc) {
            acc.daily_call_total = (acc.daily_call_total || 0) + 1
        }
        // 同时写入 Redis（增量），由 daily-stats 的 incrTotal 处理
        await dailyStats.incrTotal(email)
    }

    /**
     * 标记活跃状态并启动/恢复后台同步循环
     */
    _markActive() {
        this._lastActivityAt = Date.now()
        this._ensureAccountSyncLoop()
    }

    /**
     * 确保后台同步循环正在运行
     */
    _ensureAccountSyncLoop() {
        const interval = config.accountListRefreshInterval
        if (!interval || interval <= 0) return
        if (this._accountSyncTimer) return  // 已经在运行

        // 启动时立即执行一次同步
        this._checkAndReloadAccountList(true).catch(e => {
            logger.error('启动同步失败', 'SYNC', '', e)
        })

        // 启动后台定时器
        this._accountSyncTimer = setInterval(() => {
            this._accountSyncTick()
        }, interval * 1000)

        logger.info(`已启动后台账号同步（间隔 ${interval} 秒）`, 'SYNC')
    }

    /**
     * 后台同步定时器回调
     */
    async _accountSyncTick() {
        const now = Date.now()
        const idleTime = now - this._lastActivityAt

        // 检查是否已闲置超过阈值
        if (idleTime >= this._idleTimeoutMs) {
            logger.info(`已闲置 ${Math.floor(idleTime / 60000)} 分钟，停止后台同步`, 'SYNC')
            this._stopAccountSyncLoop()
            return
        }

        // 执行同步
        await this._checkAndReloadAccountList()
    }

    /**
     * 停止后台同步循环并清理 Redis 连接
     */
    _stopAccountSyncLoop() {
        if (this._accountSyncTimer) {
            clearInterval(this._accountSyncTimer)
            this._accountSyncTimer = null
        }

        // 重置刷新时间戳，确保下次恢复时立即刷新
        this._lastAccountListRefresh = 0

        // 如果是 Redis 模式，断开连接
        if (config.dataSaveMode === 'redis') {
            try {
                const redis = require('./redis')
                if (redis && typeof redis.cleanup === 'function') {
                    redis.cleanup().catch(e => {
                        logger.warn(`断开 Redis 连接失败: ${e.message}`, 'SYNC')
                    })
                    logger.info('已断开 Redis 连接（闲置）', 'SYNC')
                }
            } catch (e) {
                // 忽略
            }
        }
    }

    /**
     * 获取可用于选账的账户列表（过滤整体不可用和当日不可用）
     */
    getAvailableAccounts() {
        const today = this._getBeijingDateStr()

        // 先做日切重置
        this.resetDailyAvailability()

        return this.dreaminaAccounts.filter(acc =>
            acc.sessionid &&
            !acc.disabled &&
            !acc.overall_unavailable &&
            acc.daily_unavailable_date !== today
        )
    }

    /**
     * 根据权重选择账户
     */
    async pickAccountByWeight() {
        // 标记活跃并确保后台同步循环运行
        this._markActive()

        const available = this.getAvailableAccounts()
        if (available.length === 0) return null

        const weights = available.map(acc => typeof acc.weight === 'number' ? acc.weight : 100)
        const totalWeight = weights.reduce((sum, w) => sum + w, 0)

        if (totalWeight === 0) {
            return available[Math.floor(Math.random() * available.length)]
        }

        let random = Math.random() * totalWeight
        for (let i = 0; i < available.length; i++) {
            random -= weights[i]
            if (random <= 0) return available[i]
        }

        return available[0]
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval)
            this.refreshInterval = null
        }
        if (this._dailyTimer) {
            clearInterval(this._dailyTimer)
            this._dailyTimer = null
        }
        // 清理后台同步定时器
        this._stopAccountSyncLoop()

        logger.info('Dreamina 账户管理器已清理资源', 'DREAMINA', '🧹')
    }

    /**
     * 切换 Redis 数据库
     * @param {number} dbIndex - 数据库编号 (0-15)
     * @returns {Promise<Object>} 切换结果
     */
    async switchRedisDb(dbIndex) {
        if (config.dataSaveMode !== 'redis') {
            throw new Error('当前数据保存模式不是 Redis')
        }

        const startTime = Date.now()
        const redisClient = require('./redis')

        // 切换数据库
        await redisClient.switchDatabase(dbIndex)

        // 清空当前账号缓存
        this.dreaminaAccounts = []
        this.processingEmails.clear()
        this._lastAccountListRefresh = 0

        // 重新加载账号
        await this.loadAccounts()

        const duration = Date.now() - startTime
        logger.success(`Redis 数据库切换完成，加载 ${this.dreaminaAccounts.length} 个账户，耗时 ${duration}ms`, 'DREAMINA')

        return {
            currentDb: dbIndex,
            accountsReloaded: this.dreaminaAccounts.length,
            durationMs: duration
        }
    }
}

const dreaminaAccountManager = new DreaminaAccount()

process.on('exit', () => {
    if (dreaminaAccountManager) {
        dreaminaAccountManager.destroy()
    }
})

process.on('SIGINT', () => {
    if (dreaminaAccountManager) {
        dreaminaAccountManager.destroy()
    }
    process.exit(0)
})

module.exports = dreaminaAccountManager
