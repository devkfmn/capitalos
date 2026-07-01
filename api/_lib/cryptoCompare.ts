/**
 * CryptoCompare fetch helpers for Vercel serverless functions (CommonJS bundle).
 * Client code must use src/services/cryptoCompareService.ts (API proxy).
 */

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

function buildCryptoCompareUrl(path: string, apiKey?: string): string {
  const base = `https://min-api.cryptocompare.com${path}`
  if (!apiKey) return base
  const separator = path.includes('?') ? '&' : '?'
  return `${base}${separator}api_key=${encodeURIComponent(apiKey)}`
}

function assertCryptoCompareOk(data: unknown): void {
  if (
    data &&
    typeof data === 'object' &&
    'Response' in data &&
    (data as { Response?: string }).Response === 'Error'
  ) {
    const message =
      'Message' in data && typeof (data as { Message?: unknown }).Message === 'string'
        ? (data as { Message: string }).Message
        : 'CryptoCompare API error'
    throw new Error(message)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchCryptoPrices(
  tickers: string[],
  apiKey?: string
): Promise<Record<string, number>> {
  if (tickers.length === 0) return {}
  if (!apiKey) {
    console.warn('[cryptoCompare] fetchCryptoPrices called without API key')
    return {}
  }

  try {
    const normalizedTickers = [...new Set(tickers.map(normalizeTicker))]
    const tickerString = normalizedTickers.join(',')

    const response = await fetch(
      buildCryptoCompareUrl(`/data/pricemulti?fsyms=${tickerString}&tsyms=USD`, apiKey),
      { method: 'GET', headers: { Accept: 'application/json' } }
    )

    if (!response.ok) {
      if (response.status === 401) {
        console.error('[cryptoCompare] API returned 401 — check CRYPTOCOMPARE_API_KEY')
      }
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()
    assertCryptoCompareOk(data)

    const prices: Record<string, number> = {}
    for (const ticker of normalizedTickers) {
      if (data[ticker] && typeof data[ticker].USD === 'number') {
        prices[ticker] = data[ticker].USD
      } else {
        console.warn(`No USD price found for ticker: ${ticker}`)
      }
    }
    return prices
  } catch (error) {
    console.error('Error fetching crypto prices from CryptoCompare:', error)
    return {}
  }
}

export async function fetchUsdToChfRate(apiKey?: string): Promise<number | null> {
  if (!apiKey) {
    console.warn('[cryptoCompare] fetchUsdToChfRate called without API key')
    return null
  }

  try {
    const response = await fetch(
      buildCryptoCompareUrl('/data/price?fsym=USD&tsyms=CHF', apiKey),
      { method: 'GET', headers: { Accept: 'application/json' } }
    )

    if (!response.ok) {
      if (response.status === 401) {
        console.error('[cryptoCompare] API returned 401 — check CRYPTOCOMPARE_API_KEY')
      }
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()
    assertCryptoCompareOk(data)

    if (data.CHF && typeof data.CHF === 'number') {
      return data.CHF
    }

    throw new Error('Invalid response format from CryptoCompare API')
  } catch (error) {
    console.error('Error fetching USD to CHF rate from CryptoCompare:', error)
    return null
  }
}

export async function fetchCryptoData(
  tickers: string[],
  apiKey?: string,
  options?: { includeUsdToChf?: boolean }
): Promise<{ prices: Record<string, number>; usdToChfRate: number | null }> {
  const prices = await fetchCryptoPrices(tickers, apiKey)

  if (options?.includeUsdToChf !== true) {
    return { prices, usdToChfRate: null }
  }

  await delay(1100)
  const usdToChfRate = await fetchUsdToChfRate(apiKey)
  return { prices, usdToChfRate }
}
