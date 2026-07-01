# Crypto Tax Report Specification

## Scope

This specification defines the **current** Swiss crypto tax report behavior in Capitalos:

- Year selection and report generation (Settings → Reports)
- Standard vs detailed PDF modes
- Which coins and transactions are included
- How archived (removed) crypto items are handled
- How same-ticker items on different platforms are aggregated

Sources:

- `src/services/cryptoTaxReportService.ts`
- `src/services/pdfService.ts`
- `src/pages/Settings.tsx`

## Report modes

### Standard report (`detailed: false`)

- Triggered by **Tax Report (CH)** button in Settings.
- PDF sections: opening balance (1.1), closing balance (year-end or YTD), transactions table.
- Transactions table includes **BUY** and **SELL** only (`cryptoType` or legacy `side`).
- **ADJUSTMENT** transactions are excluded.

### Detailed report (`detailed: true`)

- Triggered by **Detailed Report (CH)** button in Settings.
- Same as standard, plus **ADJUSTMENT** rows in the transactions table (with optional reason/comment).

## Year selection

`getYearsWithCryptoActivity(uid)` returns years where:

1. Any transaction linked to a crypto item (active or archived) occurred, OR
2. The user currently holds active (non-archived) crypto — adds the current calendar year.

Years are sorted descending (most recent first).

## Coin inclusion rule

For a given tax year, a coin appears in the report if **any** of the following is true:

- Non-zero balance at year start (1 Jan 00:00 local, or YTD start for current year)
- Non-zero balance at year end (31 Dec 23:59:59, or today for current year)
- At least one BUY or SELL in the selected year
- (Detailed only) At least one ADJUSTMENT in the selected year

Coins with no activity in the selected year and zero balance at both boundaries are excluded.

## Archived crypto items

Crypto items offer two removal options in the Net Worth item menu:

### Hide from net worth (archive)

- Sets `archived: true` — the item is not deleted from Firestore.
- All linked transactions are **retained**.
- Hidden from Net Worth UI and excluded from net worth totals.
- **Included** in tax report generation.

### Delete permanently

- Hard-deletes the item and **all** linked transactions from Firestore (with explicit confirmation).
- Removed from net worth **and** tax reports. Cannot be undone.

Non-crypto item removal continues to use a single **Remove** action that hard-deletes the item and cascade-deletes its transactions.

## Data grouping

- Coins are grouped by uppercase ticker (`item.name.trim().toUpperCase()`).
- **Same ticker, different platforms**: multiple crypto items with the same ticker (e.g. USDC on Kraken and Hyperliquid) produce **one** report row.
- **Balances**: opening and closing amounts are the **sum** of holdings across all items with that ticker at each date.
- **Transactions**: BUY, SELL, and (in detailed mode) ADJUSTMENT rows from all matching items are merged into one list per ticker, sorted by date.

## Price sourcing

Historical CHF prices are fetched from CoinGecko (search + history API), with fallback to current price. Transaction totals use stored `pricePerItem`/`currency` when available, else historical price × amount.

## Limitation

Crypto items removed **before** the archive behavior was introduced had their transactions permanently deleted. Those coins cannot appear in reports unless restored from a JSON backup export.
