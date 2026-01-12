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

// Lua 脚本：HINCRBY + 仅在 key 没有 TTL 时设置过期时间
// 避免每次调用都延长 TTL，确保数据在北京时间 00:00 准确过期
const LUA_INCR_AND_EXPIRE = `
local key = KEYS[1]
local field = ARGV[1]
local expireAt = tonumber(ARGV[2])
local delta = tonumber(ARGV[3])
local value = redis.call('HINCRBY', key, field, delta)
local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIREAT', key, expireAt)
end
return value
`

/**
 * 原子递增 Hash 字段，仅在 key 无 TTL 时设置过期时间
 * @param {string} field Hash 字段名
 */
const incrementWithDailyExpire = async (field) => {
  const redis = require('./redis')
  const client = await redis.ensureConnection()
  const expireAt = getNextMidnightBeijing()
  await client.eval(LUA_INCR_AND_EXPIRE, 1, STATS_KEY, field, expireAt, 1)
}

/**
 * 增加调用总次数（原子操作：HINCRBY + 条件 EXPIREAT）
 * @param {string} email 账号邮箱
 */
const incrTotal = async (email) => {
  if (config.dataSaveMode !== 'redis') return
  await incrementWithDailyExpire(`${email}:total`)
}

/**
 * 增加成功次数（原子操作：HINCRBY + 条件 EXPIREAT）
 * @param {string} email 账号邮箱
 */
const incrSuccess = async (email) => {
  if (config.dataSaveMode !== 'redis') return
  await incrementWithDailyExpire(`${email}:success`)
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

/**
 * 获取单个账号的调用总次数
 * @param {string} email 账号邮箱
 * @returns {Promise<number>} 调用总次数
 */
const getTotal = async (email) => {
  if (config.dataSaveMode !== 'redis') return 0

  const redis = require('./redis')
  const client = await redis.ensureConnection()

  const value = await client.hget(STATS_KEY, `${email}:total`)
  return parseInt(value) || 0
}

module.exports = {
  incrTotal,
  incrSuccess,
  batchGet,
  getTotal
}
