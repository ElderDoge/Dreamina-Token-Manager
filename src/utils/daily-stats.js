/**
 * 每日调用统计工具
 * Redis Key: stats:daily (Hash)
 * Hash 字段: {email}:total, {email}:success
 * 北京时间 00:00 自动清零（通过 EXPIREAT）
 */

const config = require('../config')

// 获取下一个北京时间 00:00 的时间戳（秒）
const getNextMidnightBeijing = () => {
  const now = new Date()
  // 北京时间 = UTC + 8
  const beijingOffset = 8 * 60 * 60 * 1000
  const beijingNow = new Date(now.getTime() + beijingOffset)

  // 计算北京时间的下一个 00:00
  const beijingMidnight = new Date(beijingNow)
  beijingMidnight.setUTCHours(0, 0, 0, 0)
  beijingMidnight.setUTCDate(beijingMidnight.getUTCDate() + 1)

  // 转换回 UTC 时间戳
  const utcMidnight = new Date(beijingMidnight.getTime() - beijingOffset)
  return Math.floor(utcMidnight.getTime() / 1000)
}

const STATS_KEY = 'stats:daily'

/**
 * 增加调用总次数（原子操作：HINCRBY + EXPIREAT）
 * @param {string} email 账号邮箱
 */
const incrTotal = async (email) => {
  if (config.dataSaveMode !== 'redis') return

  const redis = require('./redis')
  const client = await redis.ensureConnection()

  await client.multi()
    .hincrby(STATS_KEY, `${email}:total`, 1)
    .expireat(STATS_KEY, getNextMidnightBeijing())
    .exec()
}

/**
 * 增加成功次数（原子操作：HINCRBY + EXPIREAT）
 * @param {string} email 账号邮箱
 */
const incrSuccess = async (email) => {
  if (config.dataSaveMode !== 'redis') return

  const redis = require('./redis')
  const client = await redis.ensureConnection()

  await client.multi()
    .hincrby(STATS_KEY, `${email}:success`, 1)
    .expireat(STATS_KEY, getNextMidnightBeijing())
    .exec()
}

/**
 * 批量获取多个账号的统计数据
 * @param {string[]} emails 邮箱列表
 * @returns {Promise<Object>} { email: { daily_call_total, daily_call_success }, ... }
 */
const batchGet = async (emails) => {
  if (config.dataSaveMode !== 'redis' || !emails.length) {
    return {}
  }

  const redis = require('./redis')
  const client = await redis.ensureConnection()

  // 构建批量获取的字段列表
  const fields = []
  for (const email of emails) {
    fields.push(`${email}:total`, `${email}:success`)
  }

  const values = await client.hmget(STATS_KEY, ...fields)

  // 组装结果
  const result = {}
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]
    result[email] = {
      daily_call_total: parseInt(values[i * 2]) || 0,
      daily_call_success: parseInt(values[i * 2 + 1]) || 0
    }
  }

  return result
}

module.exports = {
  incrTotal,
  incrSuccess,
  batchGet
}
