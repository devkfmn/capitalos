import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initializeAdmin, verifyAuth, getDb, getAuthAdmin, type Firestore } from '../_lib/firebaseAdmin.js'
import { timingSafeEqual } from 'crypto'
import type { NetWorthSummary, NetWorthItem, NetWorthCategory, NetWorthTransaction } from '../_lib/types.js'
import { NetWorthCalculationService } from '../_lib/netWorthCalculation.js'
import { fetchCryptoDataForSnapshot } from '../_lib/cryptoCompare.js'
import { fetchHyperliquidAccountEquity } from '../_lib/hyperliquidApi.js'
import { fetchMexcAccountEquityUsd } from '../_lib/mexcEquity.js'
import { fetchStockPrices } from '../_lib/yahooFinance.js'
import { validateSnapshotPrices } from '../_lib/snapshotPriceValidation.js'

export const config = {
  maxDuration: 60,
}

async function verifyFirebaseAuth(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  return verifyAuth(req, res)
}

function safeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function verifyCronSecret(req: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return false
  return safeStringEquals(h.slice(7), expected)
}

interface NetWorthSnapshot {
  date: string
  timestamp: number
  categories: Record<string, number>
  total: number
  priceQuality: 'live'
}

type ApiKeys = {
  hyperliquidWalletAddress?: string | null
  mexcApiKey?: string | null
  mexcSecretKey?: string | null
}

type ExchangeRates = {
  base: string
  rates: Record<string, number>
}

export type SnapshotMetaStatus = 'created' | 'exists' | 'skipped_no_live_prices' | 'error'

export interface SnapshotMeta {
  lastDate: string
  lastStatus: SnapshotMetaStatus
  lastAttemptAt: number
  lastError?: string
  missingTickers?: string[]
}

const SNAPSHOT_CATEGORIES: NetWorthCategory[] = [
  'Cash',
  'Bank Accounts',
  'Retirement Funds',
  'Index Funds',
  'Stocks',
  'Commodities',
  'Crypto',
  'Perpetuals',
  'Real Estate',
  'Depreciating Assets',
]

async function fetchExchangeRatesChf(): Promise<ExchangeRates> {
  const resp = await fetch('https://api.exchangerate-api.com/v4/latest/CHF')
  if (!resp.ok) {
    throw new Error(`Exchange rate API returned ${resp.status}`)
  }
  const json = (await resp.json()) as any
  const rates = (json?.rates && typeof json.rates === 'object') ? (json.rates as Record<string, number>) : {}
  return {
    base: 'CHF',
    rates: {
      CHF: 1,
      ...rates,
    },
  }
}

function makeConvertToChf(exchangeRates: ExchangeRates) {
  return (amount: number, from: string): number => {
    if (!Number.isFinite(amount)) return 0
    if (from === 'CHF') return amount
    const rate = exchangeRates.rates[from]
    if (!rate || !Number.isFinite(rate) || rate === 0) return amount
    return amount / rate
  }
}

function getUtcDateParts(now: Date): { year: number; monthIndex: number; day: number } {
  return {
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth(),
    day: now.getUTCDate(),
  }
}

function formatUtcDateYmd(parts: { year: number; monthIndex: number; day: number }): string {
  const month = String(parts.monthIndex + 1).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

function summaryToSnapshot(summary: NetWorthSummary): Omit<NetWorthSnapshot, 'priceQuality'> {
  const byKey = new Map<string, number>()
  for (const cat of summary.categories || []) {
    if (cat && typeof (cat as any).categoryKey === 'string') {
      const k = (cat as any).categoryKey as string
      const v = (cat as any).total
      byKey.set(k, typeof v === 'number' && Number.isFinite(v) ? v : 0)
    }
  }

  const categories: Record<string, number> = {}
  for (const k of SNAPSHOT_CATEGORIES) {
    categories[k] = byKey.get(k) ?? 0
  }

  return {
    date: '',
    timestamp: 0,
    categories,
    total: typeof summary.totalNetWorth === 'number' && Number.isFinite(summary.totalNetWorth) ? summary.totalNetWorth : 0,
  }
}

function getSnapshotDateAndTimestamp(): { date: string; timestamp: number } {
  const now = new Date()
  const target = getUtcDateParts(now)
  return { date: formatUtcDateYmd(target), timestamp: now.getTime() }
}

async function writeSnapshotMeta(
  uid: string,
  db: Firestore,
  meta: SnapshotMeta
): Promise<void> {
  const settingsRef = db.collection('users').doc(uid).collection('settings').doc('user')
  await settingsRef.set({ snapshotMeta: meta }, { merge: true })
}

interface SnapshotResult {
  uid: string
  date: string
  status: SnapshotMetaStatus
  error?: string
  replacedDegraded?: boolean
}

async function createSnapshotForUser(
  uid: string,
  db: Firestore,
): Promise<SnapshotResult> {
  const { date, timestamp } = getSnapshotDateAndTimestamp()
  const attemptedAt = Date.now()

  const existingRef = db.collection(`users/${uid}/snapshots`).doc(date)
  const existing = await existingRef.get()
  let replacedDegraded = false

  if (existing.exists) {
    const existingData = existing.data()
    if (existingData?.priceQuality === 'live') {
      await writeSnapshotMeta(uid, db, {
        lastDate: date,
        lastStatus: 'exists',
        lastAttemptAt: attemptedAt,
      })
      return { uid, date, status: 'exists' }
    }
    replacedDegraded = true
  }

  const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
  const apiKeys = (settingsSnap.data()?.apiKeys || {}) as ApiKeys

  const [itemsSnap, txSnap] = await Promise.all([
    db.collection(`users/${uid}/netWorthItems`).get(),
    db.collection(`users/${uid}/netWorthTransactions`).get(),
  ])

  const rawItems = itemsSnap.docs.map(d => d.data() as NetWorthItem)
  const transactions = txSnap.docs.map(d => d.data() as NetWorthTransaction)
  const itemsWithoutPerpetuals = rawItems.filter(i => (i as any)?.category !== 'Perpetuals')

  const exchangeRates = await fetchExchangeRatesChf()
  const convert = makeConvertToChf(exchangeRates)

  const cryptoTickers = itemsWithoutPerpetuals
    .filter(i => (i as any)?.category === 'Crypto' && typeof (i as any)?.name === 'string' && !i.archived)
    .map(i => String((i as any).name).trim().toUpperCase())
    .filter(Boolean)
  const uniqueCryptoTickers = Array.from(new Set<string>(cryptoTickers))

  const stockTickers = itemsWithoutPerpetuals
    .filter(i => {
      const c = (i as any)?.category
      return !i.archived && (c === 'Index Funds' || c === 'Stocks' || c === 'Commodities')
    })
    .map(i => String((i as any).name || '').trim().toUpperCase())
    .filter(Boolean)
  const uniqueStockTickers = Array.from(new Set<string>(stockTickers))

  const cryptoFetch = await fetchCryptoDataForSnapshot(
    uniqueCryptoTickers,
    process.env.CRYPTOCOMPARE_API_KEY
  )
  const cryptoPrices = cryptoFetch.prices
  const fxUsdPerChf = exchangeRates.rates['USD']
  const fallbackUsdToChf = (typeof fxUsdPerChf === 'number' && Number.isFinite(fxUsdPerChf) && fxUsdPerChf > 0)
    ? (1 / fxUsdPerChf)
    : null
  const effectiveUsdToChf = (cryptoFetch.usdToChfRate && cryptoFetch.usdToChfRate > 0)
    ? cryptoFetch.usdToChfRate
    : fallbackUsdToChf

  let stockPrices: Record<string, number> = {}
  if (uniqueStockTickers.length > 0) {
    try {
      stockPrices = await fetchStockPrices(uniqueStockTickers)
    } catch (error) {
      console.error('[Snapshot] Stock price fetch failed:', error)
      stockPrices = {}
    }
  }

  const perpItems: NetWorthItem[] = []
  let hyperliquidFetchFailed = false
  let mexcFetchFailed = false

  if (apiKeys?.hyperliquidWalletAddress) {
    const walletAddress = apiKeys.hyperliquidWalletAddress || ''
    if (walletAddress) {
      try {
        const exchangeBalance = await fetchHyperliquidAccountEquity(walletAddress)
        perpItems.push({
          id: 'perpetuals-hyperliquid',
          category: 'Perpetuals',
          name: 'Hyperliquid',
          platform: 'Hyperliquid',
          currency: 'USD',
          perpetualsData: { exchangeBalance, openPositions: [], openOrders: [] },
        } as any)
      } catch (error) {
        console.error('[Snapshot] Hyperliquid fetch failed:', error)
        hyperliquidFetchFailed = true
      }
    }
  }

  if (apiKeys?.mexcApiKey && apiKeys?.mexcSecretKey) {
    try {
      const mexcEquityUsd = await fetchMexcAccountEquityUsd(
        apiKeys.mexcApiKey,
        apiKeys.mexcSecretKey,
      )

      const mexcExchangeBalance = mexcEquityUsd !== null && mexcEquityUsd > 0
        ? [{ id: 'mexc-account-equity', item: 'MEXC', holdings: mexcEquityUsd, platform: 'MEXC' }]
        : []

      perpItems.push({
        id: 'perpetuals-mexc',
        category: 'Perpetuals',
        name: 'MEXC',
        platform: 'MEXC',
        currency: 'USD',
        perpetualsData: {
          exchangeBalance: mexcExchangeBalance,
          openPositions: [],
          openOrders: [],
        },
      } as any)
    } catch (error) {
      console.error('[Snapshot] MEXC fetch failed:', error)
      mexcFetchFailed = true
    }
  }

  const items = perpItems.length > 0 ? [...itemsWithoutPerpetuals, ...perpItems] : itemsWithoutPerpetuals

  const validation = validateSnapshotPrices({
    items,
    cryptoPrices,
    stockPrices,
    effectiveUsdToChf,
    apiKeys,
    hyperliquidFetchFailed,
    mexcFetchFailed,
    cryptoFetchError: cryptoFetch.error,
  })

  if (validation.ok === false) {
    const missingTickers = [...validation.missingCrypto, ...validation.missingStocks]
    await writeSnapshotMeta(uid, db, {
      lastDate: date,
      lastStatus: 'skipped_no_live_prices',
      lastAttemptAt: attemptedAt,
      lastError: validation.reason,
      missingTickers: missingTickers.length > 0 ? missingTickers : undefined,
    })
    return {
      uid,
      date,
      status: 'skipped_no_live_prices',
      error: validation.reason,
    }
  }

  const result = NetWorthCalculationService.calculateTotals(
    items,
    transactions,
    cryptoPrices,
    stockPrices,
    effectiveUsdToChf,
    convert as any
  )

  const summary: NetWorthSummary = {
    uid,
    asOf: new Date().toISOString(),
    baseCurrency: 'CHF',
    totalNetWorth: result.totalNetWorthChf,
    categories: SNAPSHOT_CATEGORIES.map((k) => ({
      categoryKey: k as any,
      categoryName: k,
      total: result.categoryTotals[k] || 0,
      currency: 'CHF',
    })),
  }

  const snapshotBase = summaryToSnapshot(summary)
  const snapshot: NetWorthSnapshot = {
    ...snapshotBase,
    date,
    timestamp,
    priceQuality: 'live',
  }

  const snapshotRef = db.collection(`users/${uid}/snapshots`).doc(snapshot.date)
  await snapshotRef.set(snapshot)

  await writeSnapshotMeta(uid, db, {
    lastDate: date,
    lastStatus: 'created',
    lastAttemptAt: attemptedAt,
  })

  return { uid, date, status: 'created', replacedDegraded: replacedDegraded || undefined }
}

async function getAllUserUids(): Promise<string[]> {
  const uids: string[] = []
  let pageToken: string | undefined
  do {
    const result = await getAuthAdmin().listUsers(1000, pageToken)
    uids.push(...result.users.map(u => u.uid))
    pageToken = result.pageToken
  } while (pageToken)
  return uids
}

function snapshotResultMessage(result: SnapshotResult): string {
  switch (result.status) {
    case 'created':
      return result.replacedDegraded
        ? `Snapshot for ${result.date} created (replaced degraded snapshot)`
        : 'Snapshot created successfully'
    case 'exists':
      return `Snapshot already exists for ${result.date}, skipping creation`
    case 'skipped_no_live_prices':
      return result.error || `Snapshot for ${result.date} skipped — live prices unavailable`
    case 'error':
      return result.error || 'Snapshot creation failed'
    default:
      return 'Snapshot request completed'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET (cron) or POST (authenticated).' })
  }

  try {
    initializeAdmin()
    const db = getDb()

    if (req.method === 'GET') {
      if (!verifyCronSecret(req)) {
        return res.status(401).json({ error: 'Invalid cron secret.' })
      }

      const uids = await getAllUserUids()
      if (uids.length === 0) {
        return res.status(200).json({ success: true, message: 'No users found', results: [] })
      }

      const results: SnapshotResult[] = []
      for (const uid of uids) {
        try {
          results.push(await createSnapshotForUser(uid, db))
        } catch (err) {
          const date = getSnapshotDateAndTimestamp().date
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          try {
            await writeSnapshotMeta(uid, db, {
              lastDate: date,
              lastStatus: 'error',
              lastAttemptAt: Date.now(),
              lastError: errorMessage,
            })
          } catch (metaErr) {
            console.error('[Snapshot] Failed to write error snapshotMeta:', metaErr)
          }
          results.push({
            uid,
            date: '',
            status: 'error',
            error: errorMessage,
          })
        }
      }

      return res.status(200).json({ success: true, results })
    }

    const uid = await verifyFirebaseAuth(req, res)
    if (!uid) return

    const result = await createSnapshotForUser(uid, db)
    return res.status(200).json({
      success: result.status === 'created' || result.status === 'exists',
      message: snapshotResultMessage(result),
      snapshot: { date: result.date },
      status: result.status,
      error: result.error,
    })
  } catch (error) {
    console.error('[Snapshot] Error creating snapshot:', error)

    if (error instanceof Error) {
      console.error('[Snapshot] Error name:', error.name)
      console.error('[Snapshot] Error message:', error.message)
      console.error('[Snapshot] Error stack:', error.stack)
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return res.status(500).json({ success: false, error: errorMessage })
  }
}
