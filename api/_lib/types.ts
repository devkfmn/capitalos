/**
 * Shared calculation types for Vercel serverless functions (CommonJS bundle).
 * Mirror of lib/types.ts — keep in sync when calculation types change.
 */
export type NetWorthCategory =
  | 'Cash'
  | 'Bank Accounts'
  | 'Retirement Funds'
  | 'Index Funds'
  | 'Stocks'
  | 'Commodities'
  | 'Crypto'
  | 'Perpetuals'
  | 'Real Estate'
  | 'Depreciating Assets'

export type CurrencyCode = 'CHF' | 'EUR' | 'USD'

export interface NetWorthItem {
  id: string
  category: NetWorthCategory
  name?: string
  currency?: string
  monthlyDepreciationChf?: number
  archived?: boolean
  perpetualsData?: {
    exchangeBalance?: Array<{ holdings?: number }>
  }
  [key: string]: unknown
}

export interface NetWorthTransaction {
  id: string
  itemId: string
  amount: number
  side: 'buy' | 'sell'
  date: string
  pricePerItemChf: number
  cryptoType?: 'BUY' | 'SELL' | 'ADJUSTMENT'
  pricePerItem?: number
  currency?: string
  [key: string]: unknown
}

export interface NetWorthCategorySummary {
  categoryKey: string
  categoryName?: string
  total: number
  currency?: string
}

export interface NetWorthSummary {
  uid?: string
  asOf?: string
  baseCurrency?: string
  totalNetWorth: number
  categories: NetWorthCategorySummary[]
}
