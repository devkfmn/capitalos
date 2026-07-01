import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initializeAdmin, verifyAuth } from '../_lib/firebaseAdmin.js'
import { fetchCryptoPrices, fetchUsdToChfRate } from '../_lib/cryptoCompare.js'

export const config = { maxDuration: 30 }

const MAX_TICKERS_PER_REQUEST = 50
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 30

const rateLimitBuckets = new Map<string, number[]>()

function isRateLimited(uid: string): boolean {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (rateLimitBuckets.get(uid) || []).filter(ts => ts > windowStart)
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(uid, recent)
    return true
  }
  recent.push(now)
  rateLimitBuckets.set(uid, recent)
  if (rateLimitBuckets.size > 5000) {
    for (const [key, timestamps] of rateLimitBuckets) {
      const stillValid = timestamps.filter(ts => ts > windowStart)
      if (stillValid.length === 0) rateLimitBuckets.delete(key)
      else rateLimitBuckets.set(key, stillValid)
    }
  }
  return false
}

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const apiKey = process.env.CRYPTOCOMPARE_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'Crypto price service not configured',
    })
  }

  try {
    initializeAdmin()

    const uid = await verifyAuth(req, res)
    if (!uid) return

    if (isRateLimited(uid)) {
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' })
    }

    const { tickers, includeUsdToChf } = req.body as {
      tickers?: string[]
      includeUsdToChf?: boolean
    }

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'Tickers array is required' })
    }
    if (tickers.length > MAX_TICKERS_PER_REQUEST) {
      return res.status(400).json({ error: `Too many tickers. Maximum ${MAX_TICKERS_PER_REQUEST} per request.` })
    }
    if (!tickers.every(t => typeof t === 'string' && t.length > 0)) {
      return res.status(400).json({ error: 'All tickers must be non-empty strings' })
    }

    const normalizedTickers = [...new Set(tickers.map(normalizeTicker))]
    const wantUsdToChf = includeUsdToChf === true

    const prices = await fetchCryptoPrices(normalizedTickers, apiKey)
    let usdToChfRate: number | null = null
    if (wantUsdToChf) {
      await new Promise((r) => setTimeout(r, 1100))
      usdToChfRate = await fetchUsdToChfRate(apiKey)
    }

    const fetched = Object.keys(prices)
    const missing = normalizedTickers.filter(t => !(t in prices))

    return res.status(200).json({
      success: true,
      prices,
      usdToChfRate,
      fetched,
      missing: missing.length > 0 ? missing : undefined,
      source: 'cryptocompare',
    })
  } catch (error) {
    console.error('[CryptoPrices] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    })
  }
}
