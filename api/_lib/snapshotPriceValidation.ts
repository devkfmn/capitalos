import type { NetWorthItem } from './types.js'

export interface SnapshotPriceValidationInput {
  items: NetWorthItem[]
  cryptoPrices: Record<string, number>
  stockPrices: Record<string, number>
  effectiveUsdToChf: number | null
  apiKeys: {
    hyperliquidWalletAddress?: string | null
    mexcApiKey?: string | null
    mexcSecretKey?: string | null
  }
  hyperliquidFetchFailed: boolean
  mexcFetchFailed: boolean
  cryptoFetchError?: string
}

export type SnapshotPriceValidationResult =
  | { ok: true }
  | {
      ok: false
      reason: string
      missingCrypto: string[]
      missingStocks: string[]
      details?: string
    }

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase()
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

function getActiveItems(items: NetWorthItem[]): NetWorthItem[] {
  return items.filter((item) => !item.archived)
}

export function validateSnapshotPrices(
  input: SnapshotPriceValidationInput
): SnapshotPriceValidationResult {
  const activeItems = getActiveItems(input.items)

  const cryptoItems = activeItems.filter((item) => item.category === 'Crypto' && item.name)
  const cryptoTickers = [
    ...new Set(cryptoItems.map((item) => normalizeTicker(String(item.name)))),
  ]

  const stockItems = activeItems.filter(
    (item) =>
      item.category === 'Index Funds' ||
      item.category === 'Stocks' ||
      item.category === 'Commodities'
  )
  const stockTickers = [
    ...new Set(stockItems.map((item) => normalizeTicker(String(item.name || '')))),
  ]

  const missingCrypto = findMissingTickers(cryptoTickers, input.cryptoPrices)
  const missingStocks = findMissingTickers(stockTickers, input.stockPrices)

  if (input.cryptoFetchError && cryptoTickers.length > 0) {
    return {
      ok: false,
      reason: `Live crypto prices unavailable: ${input.cryptoFetchError}`,
      missingCrypto: cryptoTickers,
      missingStocks: missingStocks,
      details: input.cryptoFetchError,
    }
  }

  if (cryptoTickers.length > 0) {
    if (missingCrypto.length > 0) {
      return {
        ok: false,
        reason: `Missing live crypto prices for: ${missingCrypto.join(', ')}`,
        missingCrypto,
        missingStocks,
      }
    }
    if (
      input.effectiveUsdToChf === null ||
      !Number.isFinite(input.effectiveUsdToChf) ||
      input.effectiveUsdToChf <= 0
    ) {
      return {
        ok: false,
        reason: 'USD/CHF exchange rate unavailable — cannot value crypto at live prices',
        missingCrypto: [],
        missingStocks,
      }
    }
  }

  if (missingStocks.length > 0) {
    return {
      ok: false,
      reason: `Missing live stock/index prices for: ${missingStocks.join(', ')}`,
      missingCrypto: [],
      missingStocks,
    }
  }

  const hasHyperliquid = Boolean(input.apiKeys.hyperliquidWalletAddress?.trim())
  if (hasHyperliquid && input.hyperliquidFetchFailed) {
    return {
      ok: false,
      reason: 'Hyperliquid account equity could not be fetched',
      missingCrypto: [],
      missingStocks: [],
    }
  }

  const hasMexc = Boolean(input.apiKeys.mexcApiKey?.trim() && input.apiKeys.mexcSecretKey?.trim())
  if (hasMexc && input.mexcFetchFailed) {
    return {
      ok: false,
      reason: 'MEXC account equity could not be fetched',
      missingCrypto: [],
      missingStocks: [],
    }
  }

  return { ok: true }
}
