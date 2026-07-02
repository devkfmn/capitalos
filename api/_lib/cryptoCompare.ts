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

function isRateLimitError(error: unknown, status?: number): boolean {
  if (status === 429) return true
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('rate limit')
}

async function fetchCryptoPricesStrict(
  tickers: string[],
  apiKey: string
): Promise<{ prices: Record<string, number>; error?: string; rateLimited?: boolean }> {
  const normalizedTickers = [...new Set(tickers.map(normalizeTicker))]
  if (normalizedTickers.length === 0) {
    return { prices: {} }
  }

  const tickerString = normalizedTickers.join(',')
  const retryDelaysMs = [0, 2000, 5000]
  let lastError: string | undefined
  let rateLimited = false

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (retryDelaysMs[attempt] > 0) {
      await delay(retryDelaysMs[attempt])
    }

    try {
      const response = await fetch(
        buildCryptoCompareUrl(`/data/pricemulti?fsyms=${tickerString}&tsyms=USD`, apiKey),
        { method: 'GET', headers: { Accept: 'application/json' } }
      )

      if (!response.ok) {
        if (response.status === 401) {
          console.error('[cryptoCompare] API returned 401 — check CRYPTOCOMPARE_API_KEY')
        }
        const err = new Error(`CryptoCompare API returned ${response.status}`)
        if (isRateLimitError(err, response.status) && attempt < retryDelaysMs.length - 1) {
          rateLimited = true
          lastError = err.message
          continue
        }
        throw err
      }

      const data = await response.json()
      assertCryptoCompareOk(data)

      const prices: Record<string, number> = {}
      for (const ticker of normalizedTickers) {
        if (data[ticker] && typeof data[ticker].USD === 'number') {
          prices[ticker] = data[ticker].USD
        }
      }
      return { prices }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'CryptoCompare API error'
      rateLimited = isRateLimitError(error)
      if (rateLimited && attempt < retryDelaysMs.length - 1) {
        console.warn(`[cryptoCompare] Rate limited, retrying (attempt ${attempt + 1})`)
        continue
      }
      console.error('Error fetching crypto prices from CryptoCompare:', error)
      return { prices: {}, error: lastError, rateLimited }
    }
  }

  return { prices: {}, error: lastError || 'CryptoCompare API error', rateLimited }
}

async function fetchUsdToChfRateStrict(
  apiKey: string
): Promise<{ rate: number | null; error?: string }> {
  try {
    const response = await fetch(
      buildCryptoCompareUrl('/data/price?fsym=USD&tsyms=CHF', apiKey),
      { method: 'GET', headers: { Accept: 'application/json' } }
    )

    if (!response.ok) {
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()
    assertCryptoCompareOk(data)

    if (data.CHF && typeof data.CHF === 'number' && data.CHF > 0) {
      return { rate: data.CHF }
    }

    throw new Error('Invalid response format from CryptoCompare API')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch USD/CHF rate'
    console.error('Error fetching USD to CHF rate from CryptoCompare:', error)
    return { rate: null, error: message }
  }
}

export async function fetchCryptoDataForSnapshot(
  tickers: string[],
  apiKey?: string
): Promise<{
  prices: Record<string, number>
  usdToChfRate: number | null
  error?: string
  rateLimited?: boolean
}> {
  if (!apiKey) {
    return {
      prices: {},
      usdToChfRate: null,
      error: 'CRYPTOCOMPARE_API_KEY not configured',
    }
  }

  const priceResult = await fetchCryptoPricesStrict(tickers, apiKey)
  if (priceResult.error) {
    return {
      prices: priceResult.prices,
      usdToChfRate: null,
      error: priceResult.error,
      rateLimited: priceResult.rateLimited,
    }
  }

  await delay(1100)
  const fxResult = await fetchUsdToChfRateStrict(apiKey)
  if (fxResult.error) {
    console.warn('[cryptoCompare] USD/CHF from CryptoCompare failed, caller may use FX fallback:', fxResult.error)
  }

  return {
    prices: priceResult.prices,
    usdToChfRate: fxResult.rate,
    error: undefined,
  }
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
