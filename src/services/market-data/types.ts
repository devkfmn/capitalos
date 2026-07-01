/**
 * Market Data SSOT Types
 */

import type { CurrencyCode } from '../../lib/currency'

/**
 * FX Rate data structure
 */
export interface FxRate {
  base: CurrencyCode
  quote: CurrencyCode
  rate: number
  timestamp: number
  source: 'fawazahmed0-jsdelivr' | 'fawazahmed0-pages' | 'cache'
}

/**
 * Crypto price data structure
 */
export interface CryptoPrice {
  symbol: string
  priceUsd: number
  timestamp: number
  source: 'cryptocompare' | 'cache'
}

/**
 * Market price (stocks/ETFs/commodities) data structure
 */
export interface MarketPrice {
  symbol: string
  priceUsd: number
  timestamp: number
  source: 'yahoo' | 'cache'
}

/**
 * Asset type for quotes
 */
export type AssetType = 'crypto' | 'stock' | 'etf' | 'commodity'

/**
 * Unified quote request
 */
export interface QuoteRequest {
  symbol: string
  assetType: AssetType
  targetCurrency?: CurrencyCode
}

/**
 * Unified quote response
 */
export interface Quote {
  symbol: string
  assetType: AssetType
  priceUsd: number
  priceInTargetCurrency?: number
  targetCurrency?: CurrencyCode
  timestamp: number
  source: string
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Inflight request tracker
 */
export interface InflightRequest<T> {
  promise: Promise<T>
  timestamp: number
}

// ============================================================================
// Market data health (DataContext + UI)
// ============================================================================

export type FetchHealth = 'idle' | 'loading' | 'ok' | 'partial' | 'error'

export interface PriceSourceStatus {
  health: FetchHealth
  fetchedAt: number | null
  requestedTickers: string[]
  missingTickers: string[]
  errorMessage?: string
}

export interface MarketDataStatus {
  crypto: PriceSourceStatus
  stocks: PriceSourceStatus
}

export function createIdlePriceSourceStatus(): PriceSourceStatus {
  return {
    health: 'idle',
    fetchedAt: null,
    requestedTickers: [],
    missingTickers: [],
  }
}

export function createInitialMarketDataStatus(): MarketDataStatus {
  return {
    crypto: createIdlePriceSourceStatus(),
    stocks: createIdlePriceSourceStatus(),
  }
}

export function deriveFetchHealth(
  requestedTickers: string[],
  missingTickers: string[],
  hadError: boolean
): FetchHealth {
  if (requestedTickers.length === 0) return 'idle'
  if (hadError && missingTickers.length === requestedTickers.length) return 'error'
  if (missingTickers.length > 0) return 'partial'
  return 'ok'
}

export function buildPriceSourceStatus(
  requestedTickers: string[],
  missingTickers: string[],
  options?: { hadError?: boolean; errorMessage?: string; fetchedAt?: number }
): PriceSourceStatus {
  const hadError = options?.hadError ?? false
  return {
    health: deriveFetchHealth(requestedTickers, missingTickers, hadError),
    fetchedAt: options?.fetchedAt ?? Date.now(),
    requestedTickers,
    missingTickers,
    errorMessage: options?.errorMessage,
  }
}
