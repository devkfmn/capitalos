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
      return null
    }

    return (await response.json()) as CryptoPricesApiResponse
  } catch (error) {
    console.error('[cryptoCompareService] Error calling API:', error)
    return null
  }
}

export async function fetchCryptoPrices(tickers: string[]): Promise<Record<string, number>> {
  const data = await fetchFromApi(tickers, { includeUsdToChf: false })
  return data?.success && data.prices ? data.prices : {}
}

export async function fetchUsdToChfRate(): Promise<number | null> {
  const data = await fetchFromApi(['BTC'], { includeUsdToChf: true })
  if (!data?.success) return null
  const rate = data.usdToChfRate
  return typeof rate === 'number' && rate > 0 ? rate : null
}

export async function fetchCryptoData(
  tickers: string[]
): Promise<{ prices: Record<string, number>; usdToChfRate: number | null }> {
  const data = await fetchFromApi(tickers.length > 0 ? tickers : ['BTC'], {
    includeUsdToChf: true,
  })
  if (!data?.success) {
    return { prices: {}, usdToChfRate: null }
  }
  return {
    prices: data.prices || {},
    usdToChfRate: typeof data.usdToChfRate === 'number' ? data.usdToChfRate : null,
  }
}
