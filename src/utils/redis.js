const Redis = require('ioredis')
const config = require('../config/index.js')
const { logger } = require('./logger')

/**
 * Redis 连接管理器
 * 实现按需连接机制，仅在读写操作时建立连接
 */

// 连接配置
const REDIS_CONFIG = {
  maxRetries: 3,
  connectTimeout: 10000,
  commandTimeout: 15000,
  retryDelayOnFailover: 200,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  lazyConnect: true,
  keepAlive: 30000,
  connectionName: 'qwen2api_on_demand'
}

// 连接状态
let redis = null
let isConnecting = false
let connectionPromise = null
let lastActivity = 0
let idleTimer = null

// 数据库切换状态
let currentDbIndex = 0
let switchInProgress = false
let pendingSwitchPromise = null

// 空闲超时时间 (5分钟)
const IDLE_TIMEOUT = 5 * 60 * 1000

/**
 * 从 Redis URL 中解析数据库编号
 */
const parseDbFromUrl = (url) => {
  if (!url) return 0
  try {
    const match = url.match(/\/(\d+)(?:\?|$)/)
    if (match && match[1]) {
      const db = parseInt(match[1], 10)
      return (db >= 0 && db <= 15) ? db : 0
    }
  } catch (e) {
    logger.warn('解析 Redis URL 数据库编号失败', 'REDIS')
  }
  return 0
}

// 初始化数据库编号
currentDbIndex = parseDbFromUrl(config.redisURL)
if (currentDbIndex > 0) {
  logger.info(`从 REDIS_URL 解析到数据库编号: ${currentDbIndex}`, 'REDIS')
}

/**
 * 判断是否需要TLS
 */
const isTLS = config.redisURL && (config.redisURL.startsWith('rediss://') || config.redisURL.includes('--tls'))

/**
 * 创建Redis连接配置
 */
const createRedisConfig = () => ({
  ...REDIS_CONFIG,
  // TLS配置
  ...(isTLS ? {
    tls: {
      rejectUnauthorized: true
    }
  } : {}),

  // 重试策略
  retryStrategy(times) {
    if (times > REDIS_CONFIG.maxRetries) {
      logger.error(`Redis连接重试次数超限: ${times}`, 'REDIS')
      return null
    }

    const delay = Math.min(100 * Math.pow(2, times), 3000)
    logger.info(`Redis重试连接: ${times}, 延迟: ${delay}ms`, 'REDIS', '🔄')
    return delay
  },

  // 错误重连策略
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']
    return targetErrors.some(e => err.message.includes(e))
  }
})

/**
 * 更新活动时间并重置空闲定时器
 */
const updateActivity = () => {
  lastActivity = Date.now()

  // 清除现有定时器
  if (idleTimer) {
    clearTimeout(idleTimer)
  }

  // 设置新的空闲定时器
  idleTimer = setTimeout(() => {
    if (redis && Date.now() - lastActivity > IDLE_TIMEOUT) {
      logger.info('Redis连接空闲超时，断开连接', 'REDIS', '🔌')
      disconnectRedis()
    }
  }, IDLE_TIMEOUT)
}

/**
 * 建立Redis连接
 */
const connectRedis = async () => {
  if (redis && redis.status === 'ready') {
    updateActivity()
    return redis
  }

  if (isConnecting && connectionPromise) {
    return connectionPromise
  }

  isConnecting = true
  connectionPromise = new Promise(async (resolve, reject) => {
    try {
      logger.info('建立Redis连接...', 'REDIS', '🔌')

      const newRedis = new Redis(config.redisURL, createRedisConfig())

      // 设置事件监听器
      newRedis.on('connect', () => {
        logger.success('Redis连接建立', 'REDIS')
      })

      newRedis.on('ready', () => {
        logger.success('Redis准备就绪', 'REDIS')
        redis = newRedis
        isConnecting = false
        updateActivity()
        resolve(redis)
      })

      newRedis.on('error', (err) => {
        logger.error('Redis连接错误', 'REDIS', '', err)
        if (isConnecting) {
          isConnecting = false
          reject(err)
        }
      })

      newRedis.on('close', () => {
        logger.info('Redis连接关闭', 'REDIS', '🔌')
        redis = null
      })

      newRedis.on('reconnecting', (delay) => {
        logger.info(`Redis重新连接中...延迟: ${delay}ms`, 'REDIS', '🔄')
      })

      // 等待连接就绪
      await newRedis.connect()

    } catch (error) {
      isConnecting = false
      logger.error('Redis连接失败', 'REDIS', '', error)
      reject(error)
    }
  })

  return connectionPromise
}

/**
 * 断开Redis连接
 */
const disconnectRedis = async () => {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }

  if (redis) {
    try {
      await redis.disconnect()
      logger.info('Redis连接已断开', 'REDIS', '🔌')
    } catch (error) {
      logger.error('断开Redis连接时出错', 'REDIS', '', error)
    } finally {
      redis = null
      isConnecting = false
      connectionPromise = null
    }
  }
}

/**
 * 确保Redis连接可用
 */
const ensureConnection = async () => {
  if (config.dataSaveMode !== 'redis') {
    logger.error('当前数据保存模式不是Redis', 'REDIS')
    throw new Error('当前数据保存模式不是Redis')
  }

  // 等待切换完成
  if (switchInProgress && pendingSwitchPromise) {
    await pendingSwitchPromise
  }

  if (!redis || redis.status !== 'ready') {
    return await connectRedis()
  }

  updateActivity()
  return redis
}

/**
 * 获取所有账户
 * @returns {Promise<Array>} 所有账户信息数组
 */
const getAllAccounts = async () => {
  try {
    const client = await ensureConnection()

    // 使用SCAN命令替代KEYS命令，避免阻塞Redis服务器
    const keys = []
    let cursor = '0'

    do {
      const result = await client.scan(cursor, 'MATCH', 'user:*', 'COUNT', 100)
      cursor = result[0]
      keys.push(...result[1])
    } while (cursor !== '0')

    if (!keys.length) {
      logger.info('没有找到任何账户', 'REDIS', '✅')
      return []
    }

    // 使用pipeline一次性获取所有账户数据
    const pipeline = client.pipeline()
    keys.forEach(key => {
      pipeline.hgetall(key)
    })

    const results = await pipeline.exec()
    if (!results) {
      logger.error('获取账户数据失败', 'REDIS')
      return []
    }

    const accounts = results.map((result, index) => {
      // result格式为[err, value]
      const [err, accountData] = result
      if (err) {
        logger.error(`获取账户 ${keys[index]} 数据失败`, 'REDIS', '', err)
        return null
      }
      if (!accountData || Object.keys(accountData).length === 0) {
        logger.error(`账户 ${keys[index]} 数据为空`, 'REDIS')
        return null
      }
      const rawSessionExpires = accountData.sessionid_expires
      const sessionExpires = (rawSessionExpires && !isNaN(rawSessionExpires)) ? Number(rawSessionExpires) : null
      return {
        email: keys[index].replace('user:', ''),
        password: accountData.password || '',
        region: accountData.region || 'cn',
        sessionid: accountData.sessionid || '',
        sessionid_expires: sessionExpires,
        disabled: accountData.disabled === 'true',
        // 可用性字段
        weight: accountData.weight ? Number(accountData.weight) : 100,
        daily_consecutive_fails: accountData.daily_consecutive_fails ? Number(accountData.daily_consecutive_fails) : 0,
        daily_unavailable_date: accountData.daily_unavailable_date || null,
        last_fail_date: accountData.last_fail_date || null,
        consecutive_fail_days: accountData.consecutive_fail_days ? Number(accountData.consecutive_fail_days) : 0,
        overall_unavailable: accountData.overall_unavailable === 'true'
      }
    }).filter(Boolean) // 过滤掉null值

    logger.success(`获取所有账户成功，共 ${accounts.length} 个账户`, 'REDIS')
    return accounts
  } catch (err) {
    logger.error('获取账户时出错', 'REDIS', '', err)
    return []
  }
}

/**
 * 设置账户
 * @param {string} key - 键名（邮箱）
 * @param {Object} value - 账户信息
 * @returns {Promise<boolean>} 设置是否成功
 */
const setAccount = async (key, value) => {
  try {
    const client = await ensureConnection()

    const { password, sessionid, sessionid_expires } = value
    await client.hset(`user:${key}`, {
      password: password || '',
      region: value.region || 'cn',
      sessionid: sessionid || '',
      sessionid_expires: sessionid_expires || '',
      disabled: value.disabled ? 'true' : 'false',
      // 可用性字段
      weight: String(typeof value.weight === 'number' ? value.weight : 100),
      daily_consecutive_fails: String(value.daily_consecutive_fails || 0),
      daily_unavailable_date: value.daily_unavailable_date || '',
      last_fail_date: value.last_fail_date || '',
      consecutive_fail_days: String(value.consecutive_fail_days || 0),
      overall_unavailable: value.overall_unavailable ? 'true' : 'false'
    })

    logger.success(`账户 ${key} 设置成功`, 'REDIS')
    return true
  } catch (err) {
    logger.error(`设置账户 ${key} 失败`, 'REDIS', '', err)
    return false
  }
}

/**
 * 删除账户
 * @param {string} key - 键名（邮箱）
 * @returns {Promise<boolean>} 删除是否成功
 */
const deleteAccount = async (key) => {
  try {
    const client = await ensureConnection()

    const result = await client.del(`user:${key}`)
    if (result > 0) {
      logger.success(`账户 ${key} 删除成功`, 'REDIS')
      return true
    } else {
      logger.warn(`账户 ${key} 不存在`, 'REDIS')
      return false
    }
  } catch (err) {
    logger.error(`删除账户 ${key} 失败`, 'REDIS', '', err)
    return false
  }
}

/**
 * 检查键是否存在
 * @param {string} key - 键名
 * @returns {Promise<boolean>} 键是否存在
 */
const checkKeyExists = async (key = 'headers') => {
  try {
    const client = await ensureConnection()

    const exists = await client.exists(key)
    const result = exists === 1

    logger.info(`键 "${key}" ${result ? '存在' : '不存在'}`, 'REDIS', result ? '✅' : '❌')
    return result
  } catch (err) {
    logger.error(`检查键 "${key}" 时出错`, 'REDIS', '', err)
    return false
  }
}

/**
 * 获取连接状态
 * @returns {Object} 连接状态信息
 */
const getConnectionStatus = () => {
  return {
    connected: redis && redis.status === 'ready',
    status: redis ? redis.status : 'disconnected',
    lastActivity: lastActivity,
    idleTimeout: IDLE_TIMEOUT,
    config: REDIS_CONFIG
  }
}

/**
 * 手动断开连接（用于应用关闭时清理）
 */
const cleanup = async () => {
  logger.info('清理Redis连接...', 'REDIS', '🧹')
  await disconnectRedis()
}

/**
 * 切换 Redis 数据库
 * @param {number} dbIndex - 数据库编号 (0-15)
 * @returns {Promise<number>} 切换后的数据库编号
 */
const switchDatabase = async (dbIndex) => {
  // 参数校验
  if (!Number.isInteger(dbIndex) || dbIndex < 0 || dbIndex > 15) {
    throw new Error(`无效的数据库编号: ${dbIndex}，必须在 0-15 之间`)
  }

  // 如果已经是目标数据库，直接返回
  if (currentDbIndex === dbIndex) {
    logger.info(`已在数据库 ${dbIndex}，无需切换`, 'REDIS')
    return currentDbIndex
  }

  // 如果正在切换，等待完成
  if (switchInProgress && pendingSwitchPromise) {
    await pendingSwitchPromise
    return currentDbIndex
  }

  // 开始切换
  switchInProgress = true
  pendingSwitchPromise = (async () => {
    try {
      const startTime = Date.now()
      logger.info(`开始切换 Redis 数据库: ${currentDbIndex} -> ${dbIndex}`, 'REDIS', '🔄')

      // 确保连接可用
      const client = await connectRedis()

      // 执行 SELECT 命令
      await client.select(dbIndex)

      // 更新当前数据库编号
      const oldDb = currentDbIndex
      currentDbIndex = dbIndex

      const duration = Date.now() - startTime
      logger.success(`Redis 数据库切换成功: ${oldDb} -> ${dbIndex}，耗时 ${duration}ms`, 'REDIS')

      return currentDbIndex
    } catch (error) {
      logger.error(`Redis 数据库切换失败: ${currentDbIndex} -> ${dbIndex}`, 'REDIS', '', error)
      throw error
    } finally {
      switchInProgress = false
      pendingSwitchPromise = null
    }
  })()

  return pendingSwitchPromise
}

/**
 * 获取当前数据库信息
 * @returns {Object} 当前数据库信息
 */
const getCurrentDb = () => {
  return {
    currentDb: currentDbIndex,
    switchInProgress
  }
}

// 创建兼容的Redis客户端对象
const redisClient = {
  getAllAccounts,
  setAccount,
  deleteAccount,
  checkKeyExists,
  getConnectionStatus,
  cleanup,
  ensureConnection,
  switchDatabase,
  getCurrentDb,

  // 直接Redis命令的代理方法（按需连接）
  async hset(key, ...args) {
    const client = await ensureConnection()
    return client.hset(key, ...args)
  },

  async hget(key, field) {
    const client = await ensureConnection()
    return client.hget(key, field)
  },

  async hgetall(key) {
    const client = await ensureConnection()
    return client.hgetall(key)
  },

  async exists(key) {
    const client = await ensureConnection()
    return client.exists(key)
  },

  async keys(pattern) {
    const client = await ensureConnection()
    // 使用SCAN命令替代KEYS命令，避免阻塞Redis服务器
    const keys = []
    let cursor = '0'

    do {
      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = result[0]
      keys.push(...result[1])
    } while (cursor !== '0')

    return keys
  },

  async del(key) {
    const client = await ensureConnection()
    return client.del(key)
  }
}

// 进程退出时清理连接
process.on('exit', cleanup)
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// 根据配置决定是否导出Redis客户端
module.exports = config.dataSaveMode === 'redis' ? redisClient : null
