const express = require('express')
const axios = require('axios')
const multer = require('multer')
const FormData = require('form-data')
const router = express.Router()
const { logger } = require('../utils/logger')
const { apiKeyVerify } = require('../middlewares/authorization')
const { getProxyTarget } = require('../utils/proxy-target')
const dreaminaAccountManager = require('../utils/dreamina-account')
const config = require('../config')

// 任务 4.1: multer memory storage，限制 32MB / 10 文件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024, files: 10 }
})

function applyRegionPrefix(sessionid, region) {
  if (region === 'cn') return sessionid
  const prefix = `${region}-`
  if (sessionid.startsWith(prefix)) return sessionid
  const firstDash = sessionid.indexOf('-')
  if (firstDash > 0 && firstDash <= 3) {
    const existingPrefix = sessionid.slice(0, firstDash)
    if (existingPrefix !== region) return sessionid
  }
  return prefix + sessionid
}

// 任务 4.2: model 映射
function mapModel(model, quality, cfg) {
  const needsMap = !model || String(model).toLowerCase().startsWith('gpt')
  if (!needsMap) return model || cfg.gptQualityAuto

  const q = String(quality || 'auto').toLowerCase()
  if (q === 'low') return cfg.gptQualityLow
  if (q === 'medium') return cfg.gptQualityMedium
  if (q === 'high') return cfg.gptQualityHigh
  // auto / standard / hd / 其他 → auto
  return cfg.gptQualityAuto
}

// 候选比例列表（绝对差最近邻）
const CANDIDATE_RATIOS = [
  { ratio: '1:1', value: 1 / 1 },
  { ratio: '4:3', value: 4 / 3 },
  { ratio: '3:4', value: 3 / 4 },
  { ratio: '16:9', value: 16 / 9 },
  { ratio: '9:16', value: 9 / 16 },
  { ratio: '3:2', value: 3 / 2 },
  { ratio: '2:3', value: 2 / 3 },
  { ratio: '21:9', value: 21 / 9 }
]

// 任务 4.3: size 映射
function mapSize(size) {
  if (!size) return {}

  if (String(size).includes(':')) {
    return { ratio: size }
  }

  if (String(size).toLowerCase() === 'auto') {
    return { intelligent_ratio: true }
  }

  const match = String(size).match(/^(\d+)[xX](\d+)$/)
  if (match) {
    const w = parseInt(match[1], 10)
    const h = parseInt(match[2], 10)
    if (w > 0 && h > 0) {
      const aspect = w / h
      let best = CANDIDATE_RATIOS[0]
      let bestDiff = Math.abs(aspect - best.value)
      for (const candidate of CANDIDATE_RATIOS) {
        const diff = Math.abs(aspect - candidate.value)
        if (diff < bestDiff) {
          bestDiff = diff
          best = candidate
        }
      }
      const result = { ratio: best.ratio }
      if (Math.max(w, h) >= 4096) result.resolution = '4k'
      return result
    }
  }

  return {}
}

// 任务 4.4: 组装出站白名单字段
function buildUpstreamBody(body, cfg) {
  const { prompt, response_format, negative_prompt, model, quality, size, ratio, resolution, intelligent_ratio } = body || {}
  const mappedModel = mapModel(model, quality, cfg)
  // size 存在时走映射；否则直接取 jimeng 原生字段
  const sizeFields = size !== undefined ? mapSize(size) : (() => {
    const f = {}
    if (ratio !== undefined) f.ratio = ratio
    if (resolution !== undefined) f.resolution = resolution
    if (intelligent_ratio !== undefined) f.intelligent_ratio = intelligent_ratio
    return f
  })()

  const out = {}
  if (prompt !== undefined) out.prompt = prompt
  if (response_format !== undefined) out.response_format = response_format
  if (negative_prompt !== undefined) out.negative_prompt = negative_prompt
  if (mappedModel) out.model = mappedModel
  Object.assign(out, sizeFields)
  return out
}

// 任务 4.5 + 5.1: POST /images/generations（含重试）
router.post('/images/generations', apiKeyVerify, async (req, res) => {
  const base = getProxyTarget()
  if (!base) return res.status(503).json({ error: 'proxy target not configured' })

  const targetUrl = base.replace(/\/$/, '') + '/v1/images/generations'
  const upstreamBody = buildUpstreamBody(req.body, config)

  const retryStatuses = new Set([429, 401, 500, 504])
  const maxRetries = Number.isFinite(config.proxyMaxRetry) ? config.proxyMaxRetry : 5
  let attempt = 0

  while (true) {
    const account = await dreaminaAccountManager.pickAccountByWeight()
    if (!account || !account.sessionid) {
      return res.status(503).json({ error: 'no available account' })
    }
    const sid = applyRegionPrefix(account.sessionid, account.region || 'cn')

    logger.network(`REQ[${attempt}] POST -> ${targetUrl} [${sid.split('-')[0] || 'unknown'}]`, 'OPENAI-COMPAT')

    dreaminaAccountManager.incrementDailyCallTotal(account.email).catch(err => {
      logger.error(`统计 total 失败: ${err.message}`, 'OPENAI-COMPAT')
    })

    const _start = Date.now()
    let resp
    try {
      resp = await axios({
        method: 'POST',
        url: targetUrl,
        headers: { authorization: `Bearer ${sid}`, 'content-type': 'application/json' },
        data: upstreamBody,
        timeout: config.proxyTimeoutMs,
        validateStatus: () => true
      })
    } catch (e) {
      dreaminaAccountManager.recordFailure(account)
      if (e.code === 'ECONNABORTED' || (e.message && e.message.toLowerCase().includes('timeout'))) {
        return res.status(504).json({ error: 'gateway timeout', detail: e.message })
      }
      return res.status(502).json({ error: 'bad gateway', detail: e.message })
    }

    logger.network(`RES[${attempt}] ${resp.status} <- ${targetUrl} ${Date.now() - _start}ms`, 'OPENAI-COMPAT')

    if (retryStatuses.has(resp.status) && attempt < maxRetries) {
      if (resp.status === 401) {
        dreaminaAccountManager.recordAuthFailure(account)
      } else {
        dreaminaAccountManager.recordFailure(account)
      }
      attempt++
      logger.warn(`上游 ${resp.status}，切换账号重试（${attempt}/${maxRetries}）`, 'OPENAI-COMPAT')
      continue
    }

    // 记录最终结果
    if (resp.status >= 200 && resp.status < 300) {
      let isBusinessError = false
      try {
        const ct = String(resp.headers['content-type'] || '').toLowerCase()
        if (ct.includes('json') && resp.data && typeof resp.data === 'object') {
          const code = resp.data.code
          const message = typeof resp.data.message === 'string' ? resp.data.message : ''
          if (typeof code === 'number' && code !== 0) {
            isBusinessError = true
            const msgCodeMatch = /错误码[:：]\s*(\d+)/.exec(message)
            const msgCode = msgCodeMatch ? Number(msgCodeMatch[1]) : null
            if (msgCode === 1006) {
              dreaminaAccountManager.recordAuthFailure(account)
            } else {
              dreaminaAccountManager.recordFailure(account)
            }
          }
        }
      } catch (_) {}
      if (!isBusinessError) {
        dreaminaAccountManager.recordSuccess(account)
      }
    } else if (resp.status === 401) {
      dreaminaAccountManager.recordAuthFailure(account)
    } else if (resp.status === 429 || resp.status === 500 || resp.status === 504) {
      dreaminaAccountManager.recordFailure(account)
    }

    // 透传响应
    const skipHeaders = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade'])
    Object.entries(resp.headers || {}).forEach(([k, v]) => {
      if (!skipHeaders.has(String(k).toLowerCase())) {
        try { res.setHeader(k, v) } catch (_) {}
      }
    })
    return res.status(resp.status).send(resp.data)
  }
})

// 任务 4.6 + 5.2: POST /images/edits（multer 解析，单次尝试）
const editUpload = upload.fields([
  { name: 'image', maxCount: 10 },
  { name: 'image[]', maxCount: 10 },
  { name: 'mask', maxCount: 1 }
])

router.post('/images/edits', apiKeyVerify, editUpload, async (req, res) => {
  const base = getProxyTarget()
  if (!base) return res.status(503).json({ error: 'proxy target not configured' })

  const targetUrl = base.replace(/\/$/, '') + '/v1/images/compositions'

  const account = await dreaminaAccountManager.pickAccountByWeight()
  if (!account || !account.sessionid) {
    return res.status(503).json({ error: 'no available account' })
  }
  const sid = applyRegionPrefix(account.sessionid, account.region || 'cn')

  dreaminaAccountManager.incrementDailyCallTotal(account.email).catch(err => {
    logger.error(`统计 total 失败: ${err.message}`, 'OPENAI-COMPAT')
  })

  // 构建 FormData：合并 image 和 image[] 为 images[]
  const form = new FormData()

  const imageFiles = [
    ...((req.files && req.files['image']) || []),
    ...((req.files && req.files['image[]']) || [])
  ]
  for (const file of imageFiles) {
    form.append('images', file.buffer, {
      filename: file.originalname || 'image',
      contentType: file.mimetype
    })
  }

  // 文本字段白名单（model 经 mapModel 映射后写入）
  const allowedTextFields = ['prompt', 'response_format', 'negative_prompt']
  const body = req.body || {}
  for (const field of allowedTextFields) {
    if (body[field] !== undefined) form.append(field, String(body[field]))
  }
  // model 走映射逻辑
  const mappedModel = mapModel(body.model, body.quality, config)
  if (mappedModel) form.append('model', mappedModel)

  // size 映射（OpenAI 格式）或直接透传 jimeng 原生字段
  const sizeFields = body.size !== undefined
    ? mapSize(body.size)
    : (() => {
        const f = {}
        if (body.ratio !== undefined) f.ratio = body.ratio
        if (body.resolution !== undefined) f.resolution = body.resolution
        if (body.intelligent_ratio !== undefined) f.intelligent_ratio = body.intelligent_ratio
        return f
      })()
  for (const [k, v] of Object.entries(sizeFields)) {
    form.append(k, String(v))
  }

  logger.network(`REQ POST -> ${targetUrl} [${sid.split('-')[0] || 'unknown'}]`, 'OPENAI-COMPAT')

  const _start = Date.now()
  let resp
  try {
    resp = await axios({
      method: 'POST',
      url: targetUrl,
      headers: { authorization: `Bearer ${sid}`, ...form.getHeaders() },
      data: form,
      timeout: config.proxyTimeoutMs,
      validateStatus: () => true,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    })
  } catch (e) {
    dreaminaAccountManager.recordFailure(account)
    if (e.code === 'ECONNABORTED' || (e.message && e.message.toLowerCase().includes('timeout'))) {
      return res.status(504).json({ error: 'gateway timeout', detail: e.message })
    }
    return res.status(502).json({ error: 'bad gateway', detail: e.message })
  }

  logger.network(`RES ${resp.status} <- ${targetUrl} ${Date.now() - _start}ms`, 'OPENAI-COMPAT')

  if (resp.status >= 200 && resp.status < 300) {
    dreaminaAccountManager.recordSuccess(account)
  } else if (resp.status === 401) {
    dreaminaAccountManager.recordAuthFailure(account)
  } else if (resp.status >= 500 || resp.status === 429) {
    dreaminaAccountManager.recordFailure(account)
  }

  const skipHeaders = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade'])
  Object.entries(resp.headers || {}).forEach(([k, v]) => {
    if (!skipHeaders.has(String(k).toLowerCase())) {
      try { res.setHeader(k, v) } catch (_) {}
    }
  })
  return res.status(resp.status).send(resp.data)
})

module.exports = router
