import { useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { getActiveNetWorthItems } from '../lib/networth/activeItems'
import { categoryUsesMarketApi } from '../services/market-data/DailyPriceService'
import type { PriceSourceStatus } from '../services/market-data/types'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const TICKER_LIST_CAP = 3

export type MarketDataHealthSeverity = 'none' | 'warning' | 'error'

export interface MarketDataHealth {
  severity: MarketDataHealthSeverity
  messages: string[]
  affectedItemCount: number
  showBanner: boolean
}

function formatTickerList(tickers: string[]): string {
  if (tickers.length === 0) return ''
  if (tickers.length <= TICKER_LIST_CAP) {
    return tickers.join(', ')
  }
  const shown = tickers.slice(0, TICKER_LIST_CAP).join(', ')
  return `${shown} +${tickers.length - TICKER_LIST_CAP} more`
}

function isDegradedSource(status: PriceSourceStatus): boolean {
  return status.health === 'error' || status.health === 'partial'
}

function messageForSource(
  label: string,
  status: PriceSourceStatus
): string | null {
  if (!isDegradedSource(status)) return null
  if (status.missingTickers.length === 0) {
    return status.errorMessage || `${label}: live prices unavailable — using transaction values`
  }
  const tickers = formatTickerList(status.missingTickers)
  if (status.health === 'error') {
    return `${tickers}: no live price — using transaction values`
  }
  return `${tickers}: no live price — using transaction values`
}

export function useMarketDataHealth(): MarketDataHealth {
  const { data, marketDataStatus } = useData()
  const { ratesReady, error: fxError, exchangeRates } = useCurrency()

  return useMemo(() => {
    const activeItems = getActiveNetWorthItems(data.netWorthItems)
    const hasCryptoItems = activeItems.some((item) => item.category === 'Crypto')
    const hasStockItems = activeItems.some((item) => categoryUsesMarketApi(item.category))
    const hasMarketDrivenItems = hasCryptoItems || hasStockItems

    const messages: string[] = []
    let severity: MarketDataHealthSeverity = 'none'
    let affectedItemCount = 0

    const bumpSeverity = (next: MarketDataHealthSeverity) => {
      if (next === 'error') severity = 'error'
      else if (next === 'warning' && severity === 'none') severity = 'warning'
    }

    const cryptoMessage = messageForSource('Crypto', marketDataStatus.crypto)
    if (cryptoMessage) {
      messages.push(cryptoMessage)
      affectedItemCount += marketDataStatus.crypto.missingTickers.length
      bumpSeverity(marketDataStatus.crypto.health === 'error' ? 'error' : 'warning')
    }

    const stockMessage = messageForSource('Stocks', marketDataStatus.stocks)
    if (stockMessage) {
      messages.push(stockMessage)
      affectedItemCount += marketDataStatus.stocks.missingTickers.length
      bumpSeverity(marketDataStatus.stocks.health === 'error' ? 'error' : 'warning')
    }

    if (hasCryptoItems && (data.usdToChfRate === null || data.usdToChfRate <= 0)) {
      messages.push('USD/CHF rate unavailable — crypto totals may be inaccurate')
      bumpSeverity('warning')
    }

    if (!ratesReady || fxError) {
      messages.push('Exchange rates unavailable — totals may be hidden or unconverted')
      bumpSeverity('error')
    } else if (exchangeRates?.fetchedAt) {
      const age = Date.now() - exchangeRates.fetchedAt
      if (age > ONE_DAY_MS) {
        messages.push('Exchange rates may be outdated')
        bumpSeverity('warning')
      }
    }

    const showBanner = severity !== 'none' && hasMarketDrivenItems

    return {
      severity,
      messages,
      affectedItemCount,
      showBanner,
    }
  }, [
    data.netWorthItems,
    data.usdToChfRate,
    marketDataStatus,
    ratesReady,
    fxError,
    exchangeRates?.fetchedAt,
  ])
}
