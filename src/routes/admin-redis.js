const express = require('express')
const router = express.Router()
const { adminKeyVerify } = require('../middlewares/authorization')
const dreaminaAccountManager = require('../utils/dreamina-account')
const redisClient = require('../utils/redis')
const { logger } = require('../utils/logger')

// 获取当前数据库
router.get('/db', adminKeyVerify, (req, res) => {
  try {
    if (!redisClient) {
      return res.status(400).json({ error: '当前数据保存模式不是 Redis' })
    }

    const dbInfo = redisClient.getCurrentDb()
    return res.json(dbInfo)
  } catch (error) {
    logger.error('获取当前数据库失败', 'REDIS', '', error)
    return res.status(500).json({ error: error.message })
  }
})

// 切换数据库
router.post('/db', adminKeyVerify, async (req, res) => {
  try {
    if (!redisClient) {
      return res.status(400).json({ error: '当前数据保存模式不是 Redis' })
    }

    const { db } = req.body
    if (typeof db !== 'number' || db < 0 || db > 15) {
      return res.status(400).json({ error: '数据库编号必须在 0-15 之间' })
    }

    const result = await dreaminaAccountManager.switchRedisDb(db)
    return res.json(result)
  } catch (error) {
    logger.error('切换数据库失败', 'REDIS', '', error)
    return res.status(500).json({ error: error.message })
  }
})

module.exports = router
