/**
 * Client-side crypto price service.
 * Routes requests through the Vercel API proxy (same pattern as DailyPriceService).
 */

import { apiPost } from '../lib/apiClient'

interface CryptoPricesApiResponse {
  success: boolean
  prices?: Record<string, number>
  usdToChfRate?: number | null
  error?: string
}

export interface CryptoFetchResult {
  prices: Record<string, number>
  usdToChfRate: number | null
  requestedTickers: string[]
  missingTickers: string[]
  errorMessage?: string
  success: boolean
}

function normalizeTickers(tickers: string[]): string[] {
  return [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))]
}

function findMissingTickers(
  requested: string[],
  prices: Record<string, number>
): string[] {
  return requested.filter((ticker) => {
    const price = prices[ticker]
    return typeof price !== 'number' || !Number.isFinite(price) || price <= 0
  })
}

async function fetchFromApi(
  tickers: string[],
  options?: { includeUsdToChf?: boolean }
): Promise<CryptoPricesApiResponse | null> {
  if (tickers.length === 0) return null

  try {
    const response = await apiPost('/api/market/crypto-prices', {
      tickers,
      includeUsdToChf: options?.includeUsdToChf ?? false,
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      console.error(`[cryptoCompareService] API returned ${response.status}`, body)
      return {
        success: false,
        error: typeof body.error === 'string' ? body.error : `API returned ${response.status}`,
      }
    }

    return (await response.json()) as CryptoPricesApiResponse
  } catch (error) {
    console.error('[cryptoCompareService] Error calling API:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch crypto prices',
    }
  }
}

export async function fetchCryptoPrices(tickers: string[]): Promise<Record<string, number>> {
  const result = await fetchCryptoData(tickers, { includeUsdToChf: false })
  return result.prices
}

export async function fetchUsdToChfRate(): Promise<number | null> {
  const data = await fetchFromApi(['BTC'], { includeUsdToChf: true })
  if (!data?.success) return null
  const rate = data.usdToChfRate
  return typeof rate === 'number' && rate > 0 ? rate : null
}

export async function fetchCryptoData(
  tickers: string[],
  options?: { includeUsdToChf?: boolean }
): Promise<CryptoFetchResult> {
  const requestedTickers = normalizeTickers(tickers)
  const includeUsdToChf = options?.includeUsdToChf ?? true
  const apiTickers = requestedTickers.length > 0 ? requestedTickers : ['BTC']

  const data = await fetchFromApi(apiTickers, { includeUsdToChf })

  if (!data?.success) {
    return {
      prices: {},
      usdToChfRate: null,
      requestedTickers,
      missingTickers: requestedTickers,
      errorMessage: data?.error || 'Failed to fetch crypto prices',
      success: false,
    }
  }

  const prices = data.prices || {}
  const missingTickers = findMissingTickers(requestedTickers, prices)
  const usdToChfRate =
    typeof data.usdToChfRate === 'number' && data.usdToChfRate > 0
      ? data.usdToChfRate
      : null

  return {
    prices,
    usdToChfRate,
    requestedTickers,
    missingTickers,
    errorMessage: missingTickers.length > 0 ? data.error : undefined,
    success: missingTickers.length < requestedTickers.length || requestedTickers.length === 0,
  }
}
