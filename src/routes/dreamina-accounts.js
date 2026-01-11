const express = require('express')
const router = express.Router()
const dreaminaAccountManager = require('../utils/dreamina-account')
const dailyStats = require('../utils/daily-stats')
const { logger } = require('../utils/logger')
const { adminKeyVerify } = require('../middlewares/authorization')
const DataPersistence = require('../utils/data-persistence')
const sse = require('../utils/sse')
const config = require('../config')

const dataPersistence = new DataPersistence()

router.get('/getAllAccounts', adminKeyVerify, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 1000
    const sortBy = req.query.sortBy || ''
    const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc'
    const allowedSortFields = ['email', 'sessionid_expires', 'weight', 'daily_call_total']

    if (sortBy && !allowedSortFields.includes(sortBy)) {
      return res.status(400).json({ error: `invalid sortBy: ${sortBy}` })
    }

    const allAccounts = [...dreaminaAccountManager.getAllAccounts()]
    const total = allAccounts.length

    // 排序需要 daily_call_total 时，先获取全部 stats
    let allStats = {}
    if (sortBy === 'daily_call_total') {
      const allEmails = allAccounts.map(a => a.email)
      allStats = await dailyStats.batchGet(allEmails)
    }

    // 排序
    if (sortBy) {
      allAccounts.sort((a, b) => {
        let valA, valB
        if (sortBy === 'daily_call_total') {
          valA = allStats[a.email]?.daily_call_total || 0
          valB = allStats[b.email]?.daily_call_total || 0
        } else if (sortBy === 'weight') {
          valA = a.weight ?? 100
          valB = b.weight ?? 100
        } else {
          valA = a[sortBy] ?? ''
          valB = b[sortBy] ?? ''
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDir === 'asc' ? valA - valB : valB - valA
        }
        return sortDir === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
    }

    // 分页
    const start = (page - 1) * pageSize
    const paginatedAccounts = allAccounts.slice(start, start + pageSize)

    // 批量获取当日统计数据（如果排序时已获取全部，则复用）
    const emails = paginatedAccounts.map(a => a.email)
    const stats = sortBy === 'daily_call_total' ? allStats : await dailyStats.batchGet(emails)

    const accounts = paginatedAccounts.map(account => ({
      email: account.email,
      password: account.password,
      sessionid: account.sessionid,
      sessionid_expires: account.sessionid_expires,
      disabled: account.disabled,
      // 可用性字段
      weight: account.weight ?? 100,
      daily_consecutive_fails: account.daily_consecutive_fails || 0,
      daily_unavailable_date: account.daily_unavailable_date || null,
      last_fail_date: account.last_fail_date || null,
      consecutive_fail_days: account.consecutive_fail_days || 0,
      overall_unavailable: account.overall_unavailable || false,
      // 当日统计
      daily_call_total: stats[account.email]?.daily_call_total || 0,
      daily_call_success: stats[account.email]?.daily_call_success || 0
    }))

    res.json({ total, page, pageSize, sortBy, sortDir, data: accounts })
  } catch (error) {
    logger.error('获取 Dreamina 账号列表失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/setAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email, password, sessionid } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (exists) {
      return res.status(409).json({ error: '账号已存在' })
    }

    const jobId = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    res.status(202).json({ message: '任务已提交', jobId, email })

    setImmediate(async () => {
      try {
        const success = await dreaminaAccountManager.addAccount(email, password, sessionid || null)
        sse.broadcast('account:add:done', { jobId, email, success })
      } catch (err) {
        logger.error('后台创建账号任务失败', 'DREAMINA', '', err)
        sse.broadcast('account:add:done', { jobId, email, success: false, error: err.message })
      }
    })
  } catch (error) {
    logger.error('创建 Dreamina 账号失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/deleteAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email } = req.body

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (!exists) {
      return res.status(404).json({ error: '账号不存在' })
    }

    const success = await dreaminaAccountManager.removeAccount(email)

    if (success) {
      await dataPersistence.saveAllAccounts(dreaminaAccountManager.getAllAccounts())
      res.json({ message: 'Dreamina 账号删除成功' })
    } else {
      res.status(500).json({ error: 'Dreamina 账号删除失败' })
    }
  } catch (error) {
    logger.error('删除 Dreamina 账号失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/setAccounts', adminKeyVerify, async (req, res) => {
  try {
    let { accounts } = req.body
    if (!accounts) {
      return res.status(400).json({ error: '账号列表不能为空' })
    }

    const list = accounts
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(item => item !== '')

    // 去重
    const uniqueList = []
    const seenEmails = new Set()
    for (const item of list) {
      const [email] = item.split(':')
      if (email && !seenEmails.has(email)) {
        seenEmails.add(email)
        uniqueList.push(item)
      }
    }
    const finalList = uniqueList

    const jobId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    res.status(202).json({ message: '批量任务已提交', jobId, total: finalList.length })

    setImmediate(async () => {
      let successCount = 0
      const failed = []
      const concurrency = config.batchAddConcurrency

      // 简单的并发控制函数
      const processBatch = async (items, limit, fn) => {
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

      await processBatch(finalList, concurrency, async (line) => {
        const parts = line.split(':')
        const email = parts[0]
        const password = parts[1]
        const sessionid = parts.slice(2).join(':') || null
        if (!email || !password) return

        const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
        if (exists) {
          failed.push({ email, reason: 'exists' })
          return
        }

        try {
          const ok = await dreaminaAccountManager.addAccount(email, password, sessionid)
          if (ok) successCount++
          else failed.push({ email, reason: 'failed' })
        } catch (e) {
          failed.push({ email, reason: e.message || 'failed' })
        }
      })

      sse.broadcast('account:batchAdd:done', {
        jobId,
        total: finalList.length,
        successCount,
        failed
      })
    })
  } catch (error) {
    logger.error('批量创建 Dreamina 账号失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/refreshAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' })
    }

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (!exists) {
      return res.status(404).json({ error: '账号不存在' })
    }

    const success = await dreaminaAccountManager.refreshAccount(email)

    if (success) {
      res.json({ message: 'Dreamina 账号 SessionID 刷新成功', email })
    } else {
      res.status(500).json({ error: 'Dreamina 账号 SessionID 刷新失败' })
    }
  } catch (error) {
    logger.error('刷新 Dreamina 账号 SessionID 失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/refreshAllAccounts', adminKeyVerify, async (req, res) => {
  try {
    const { thresholdHours = 24 } = req.body
    const refreshedCount = await dreaminaAccountManager.autoRefreshSessionIds(thresholdHours)
    res.json({ message: 'Dreamina 批量刷新完成', refreshedCount, thresholdHours })
  } catch (error) {
    logger.error('批量刷新 Dreamina 账号 SessionID 失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/forceRefreshAllAccounts', adminKeyVerify, async (req, res) => {
  try {
    const refreshedCount = await dreaminaAccountManager.autoRefreshSessionIds(8760)
    res.json({ message: 'Dreamina 强制刷新完成', refreshedCount, totalAccounts: dreaminaAccountManager.getAllAccounts().length })
  } catch (error) {
    logger.error('强制刷新 Dreamina 账号 SessionID 失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

// 恢复账号可用性
router.post('/restoreAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' })
    }

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (!exists) {
      return res.status(404).json({ error: '账号不存在' })
    }

    const success = await dreaminaAccountManager.restoreAccount(email)

    if (success) {
      res.json({ message: '账号可用性已恢复', email })
    } else {
      res.status(500).json({ error: '恢复账号可用性失败' })
    }
  } catch (error) {
    logger.error('恢复账号可用性失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

