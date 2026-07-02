import type { CurrencyCode, NetWorthItem, NetWorthTransaction } from './types.js'

export function calculateBalanceChf(
  itemId: string,
  transactions: NetWorthTransaction[],
  item?: NetWorthItem,
  currentCryptoPrices?: Record<string, number>,
  convert?: (amount: number, from: CurrencyCode) => number
): number {
  if (!transactions) transactions = []
  if (!itemId) return 0

  if (item?.category === 'Crypto' && currentCryptoPrices && item.name) {
    const coinAmount = calculateCoinAmount(itemId, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPrice = currentCryptoPrices[ticker]
    if (currentPrice !== undefined && currentPrice > 0) {
      return coinAmount * currentPrice
    }
  }

  if (item?.category === 'Perpetuals' && item.perpetualsData) {
    const { exchangeBalance } = item.perpetualsData
    const exchangeBalanceTotal = (exchangeBalance || []).reduce((sum, balance) => {
      return sum + (balance.holdings || 0)
    }, 0)
    return exchangeBalanceTotal
  }

  if (item?.category === 'Depreciating Assets' && item.monthlyDepreciationChf && item.monthlyDepreciationChf > 0) {
    const itemTransactions = transactions.filter((tx) => tx.itemId === itemId && !tx.id.startsWith('depr-'))

    const baseBalance = itemTransactions.reduce((sum, tx) => {
      if (tx.cryptoType === 'ADJUSTMENT') {
        const buyTransactions = itemTransactions.filter(
          (t) => (t.cryptoType === 'BUY' || (!t.cryptoType && t.side === 'buy')) && t.pricePerItemChf > 0
        )
        if (buyTransactions.length > 0) {
          const totalValue = buyTransactions.reduce((s, t) => {
            if (t.pricePerItem !== undefined && t.currency && convert) {
              return s + convert(t.amount * t.pricePerItem, t.currency as CurrencyCode)
            }
            return s + t.amount * t.pricePerItemChf
          }, 0)
          const totalAmount = buyTransactions.reduce((s, t) => s + t.amount, 0)
          const avgPrice = totalAmount > 0 ? totalValue / totalAmount : 0
          return sum + tx.amount * avgPrice
        }
        return sum + tx.amount * 1
      }

      let txValue: number
      if (tx.cryptoType === 'BUY') {
        txValue = tx.amount
      } else if (tx.cryptoType === 'SELL') {
        txValue = -tx.amount
      } else {
        txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      }

      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        const totalInOriginalCurrency = txValue * tx.pricePerItem
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }

      return sum + txValue * tx.pricePerItemChf
    }, 0)

    const buyTransactions = itemTransactions
      .filter((tx) => tx.side === 'buy')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (buyTransactions.length > 0) {
      const firstBuyDate = new Date(buyTransactions[0].date)
      const now = new Date()
      const monthsDiff = (now.getFullYear() - firstBuyDate.getFullYear()) * 12 + (now.getMonth() - firstBuyDate.getMonth())

      if (monthsDiff > 0) {
        const totalDepreciation = item.monthlyDepreciationChf * monthsDiff
        return Math.max(0, baseBalance - totalDepreciation)
      }
    }

    return baseBalance
  }

  return transactions
    .filter((tx) => tx.itemId === itemId)
    .reduce((sum, tx) => {
      if (tx.cryptoType === 'ADJUSTMENT') {
        const buyTransactions = transactions.filter(
          (t) =>
            t.itemId === itemId && (t.cryptoType === 'BUY' || (!t.cryptoType && t.side === 'buy')) && t.pricePerItemChf > 0
        )
        if (buyTransactions.length > 0) {
          const totalValue = buyTransactions.reduce((s, t) => {
            if (t.pricePerItem !== undefined && t.currency && convert) {
              return s + convert(t.amount * t.pricePerItem, t.currency as CurrencyCode)
            }
            return s + t.amount * t.pricePerItemChf
          }, 0)
          const totalAmount = buyTransactions.reduce((s, t) => s + t.amount, 0)
          const avgPrice = totalAmount > 0 ? totalValue / totalAmount : 0
          return sum + tx.amount * avgPrice
        }
        return sum + tx.amount * 1
      }

      let txValue: number
      if (tx.cryptoType === 'BUY') {
        txValue = tx.amount
      } else if (tx.cryptoType === 'SELL') {
        txValue = -tx.amount
      } else {
        txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      }

      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        const totalInOriginalCurrency = txValue * tx.pricePerItem
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }

      return sum + txValue * tx.pricePerItemChf
    }, 0)
}

export function calculateCoinAmount(itemId: string, transactions: NetWorthTransaction[]): number {
  if (!itemId || !transactions) return 0
  return transactions
    .filter((tx) => tx.itemId === itemId)
    .reduce((sum, tx) => {
      if (tx.cryptoType) {
        switch (tx.cryptoType) {
          case 'BUY':
            return sum + tx.amount
          case 'SELL':
            return sum - tx.amount
          case 'ADJUSTMENT':
            return sum + tx.amount
          default:
            return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
        }
      }
      return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
    }, 0)
}

export function calculateHoldings(itemId: string, transactions: NetWorthTransaction[]): number {
  if (!itemId || !transactions) return 0
  return transactions
    .filter((tx) => tx.itemId === itemId)
    .reduce((sum, tx) => {
      if (tx.cryptoType === 'ADJUSTMENT') return sum + tx.amount
      if (tx.cryptoType === 'BUY') return sum + tx.amount
      if (tx.cryptoType === 'SELL') return sum - tx.amount
      return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
    }, 0)
}
