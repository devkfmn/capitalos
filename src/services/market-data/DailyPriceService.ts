/**
 * Daily Price Service (SSOT)
 *
 * Fetches stock/ETF/commodity prices from Yahoo Finance via a Vercel API proxy.
 * Prices are fetched on every app open/refresh — no Firestore caching.
 */

import { apiPost } from '../../lib/apiClient'

// ============================================================================
// Types
// ============================================================================

export interface DailyPriceResult {
  price: number
  currency: string | null
  marketTime: number | null
  isStale: boolean
  asOfDate: string
}

export interface DailyPricesFetchResult {
  prices: Record<string, number>
  requestedTickers: string[]
  missingTickers: string[]
  errorMessage?: string
  warning?: string
  success: boolean
}

// ============================================================================
// Utility Functions
// ============================================================================

function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Normalize symbol key — trim, uppercase, collapse spaces.
 * Keeps exchange suffixes (VWCE.DE, ZSIL.SW, BRK-B).
 */
export function normalizeSymbolKey(symbolRaw: string): string {
  return symbolRaw.trim().toUpperCase().replace(/\s+/g, ' ')
}

// ============================================================================
// API
// ============================================================================

interface ApiUpdateResponse {
  success: boolean
  prices: Record<string, { price: number; currency: string | null; marketTime: number | null }>
  fetched?: string[]
  missing?: string[]
  source: string
  warning?: string
  error?: string
}

async function fetchPricesFromApi(
  symbols: string[]
): Promise<ApiUpdateResponse | null> {
  if (symbols.length === 0) return null

  try {
    const response = await apiPost('/api/market/update-daily-prices', { symbols })

    if (!response.ok) {
      console.error(`[DailyPriceService] API returned ${response.status}`)
      return {
        success: false,
        prices: {},
        source: 'yahoo',
        error: `API returned ${response.status}`,
      }
    }

    const data: ApiUpdateResponse = await response.json()

    if (import.meta.env.DEV) {
      console.log('[DailyPriceService] API response:', {
        fetched: data.fetched?.length || 0,
        missing: data.missing?.length || 0,
        source: data.source,
        warning: data.warning,
      })
    }

    return data
  } catch (err) {
    console.error('[DailyPriceService] Error calling API:', err)
    return {
      success: false,
      prices: {},
      source: 'yahoo',
      error: err instanceof Error ? err.message : 'Failed to fetch stock prices',
    }
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get daily prices for a list of symbols.
 * Calls the Yahoo Finance proxy API directly — no caching.
 */
export async function getDailyPrices(
  symbolsRaw: string[],
  _opts?: { forceRefresh?: boolean; uid?: string }
): Promise<Record<string, DailyPriceResult>> {
  const fetchResult = await fetchDailyPricesData(symbolsRaw)
  const today = getUtcDateKey()
  const result: Record<string, DailyPriceResult> = {}

  for (const [symbolKey, price] of Object.entries(fetchResult.prices)) {
    result[symbolKey] = {
      price,
      currency: null,
      marketTime: null,
      isStale: false,
      asOfDate: today,
    }
  }

  return result
}

/**
 * Fetch stock/ETF/commodity prices with health metadata.
 */
export async function fetchDailyPricesData(
  symbolsRaw: string[]
): Promise<DailyPricesFetchResult> {
  const requestedTickers = [...new Set(symbolsRaw.map(normalizeSymbolKey))]

  if (requestedTickers.length === 0) {
    return {
      prices: {},
      requestedTickers: [],
      missingTickers: [],
      success: true,
    }
  }

  const apiResponse = await fetchPricesFromApi(requestedTickers)
  const prices: Record<string, number> = {}

  if (apiResponse?.success && apiResponse.prices) {
    for (const [symbolKey, priceData] of Object.entries(apiResponse.prices)) {
      if (
        typeof priceData.price === 'number' &&
        Number.isFinite(priceData.price) &&
        priceData.price > 0
      ) {
        prices[symbolKey] = priceData.price
      }
    }
  }

  const apiMissing = apiResponse?.missing || []
  const derivedMissing = requestedTickers.filter((ticker) => !(ticker in prices))
  const missingTickers = [...new Set([...apiMissing, ...derivedMissing])]

  if (import.meta.env.DEV && missingTickers.length > 0) {
    console.warn(
      `[DailyPriceService] No prices found for ${missingTickers.length} of ${requestedTickers.length} symbols`
    )
  }

  const hadTotalFailure = !apiResponse?.success && Object.keys(prices).length === 0

  return {
    prices,
    requestedTickers,
    missingTickers,
    errorMessage: hadTotalFailure
      ? apiResponse?.error || 'Failed to fetch stock prices'
      : missingTickers.length > 0
        ? apiResponse?.error
        : undefined,
    warning: apiResponse?.warning,
    success: !hadTotalFailure,
  }
}

/**
 * Get a simple price map (symbol -> price) for backward compatibility.
 */
export async function getDailyPricesMap(
  symbolsRaw: string[],
  _uid?: string
): Promise<Record<string, number>> {
  const result = await fetchDailyPricesData(symbolsRaw)
  return result.prices
}

// ============================================================================
// Asset Class Detection
// ============================================================================

export function deriveAssetClass(
  category: string
): 'stock' | 'etf' | 'commodity' | 'unknown' {
  switch (category) {
    case 'Stocks': return 'stock'
    case 'Index Funds': return 'etf'
    case 'Commodities': return 'commodity'
    default: return 'unknown'
  }
}

/**
 * Check if a category uses market API prices (Yahoo Finance)
 */
export function categoryUsesMarketApi(category: string): boolean {
  return ['Index Funds', 'Stocks', 'Commodities'].includes(category)
}

/** @deprecated Use categoryUsesMarketApi */
export const categoryUsesTwelveData = categoryUsesMarketApi
/** @deprecated Use categoryUsesMarketApi */
export const categoryUsesYahoo = categoryUsesMarketApi
