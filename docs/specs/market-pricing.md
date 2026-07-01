# Market Pricing - Yahoo Finance Integration

## Overview

Market prices for stocks, ETFs, and commodities are fetched on-demand from Yahoo Finance via a Vercel API proxy. Prices are fetched every time the app opens or the user refreshes — no Firestore caching, no API key required.

This architecture:
- **No API key needed** — Yahoo Finance's unofficial endpoints are free and keyless
- **Always returns fresh prices** — no stale cache concerns
- **Minimal complexity** — no locks, no session cache, no fallback logic
- **Global coverage** — supports all Yahoo Finance symbols (US, Europe, Asia, commodities)

## Architecture

```
┌─────────────────────────┐
│  Client Device          │
│  (getDailyPricesMap)    │
└───────────┬─────────────┘
            │ POST /api/market/update-daily-prices
            │ (Bearer token + symbols)
            ▼
┌─────────────────────────┐
│  Vercel API Route       │
│  (Serverless Function)  │
└───────────┬─────────────┘
            │ 1. verifyAuth → uid
            │ 2. Fetch prices from Yahoo Finance
            ▼
┌──────────────────────┐
│  Yahoo Finance       │
│  /v8/finance/chart   │
└──────────────────────┘
```

## Flow

1. **Client requests prices** via `getDailyPricesMap(symbols)`
2. **DailyPriceService** calls Vercel API route `/api/market/update-daily-prices`
3. **API route** authenticates via Bearer token, derives `uid`
4. **API route** calls Yahoo Finance v8 chart endpoint for each symbol (concurrency-limited)
5. **API route** extracts `regularMarketPrice`, `currency`, `regularMarketTime`
6. **API route** returns normalized price map to client
7. **Client** uses prices for display and calculations

## Symbol Format

Symbols use Yahoo Finance format directly — no mapping needed:

| Type | Example | Description |
|---|---|---|
| US stocks | `AAPL`, `MSFT`, `TSLA` | Plain ticker |
| US ETFs | `SPY`, `VOO`, `QQQ` | Plain ticker |
| Swiss (SIX) | `VWCE.SW`, `ZSIL.SW` | `.SW` suffix |
| German (XETRA) | `SAP.DE`, `VWCE.DE` | `.DE` suffix |
| London (LSE) | `VUSA.L`, `SHEL.L` | `.L` suffix |
| Paris (EPA) | `CAC.PA` | `.PA` suffix |
| Commodities | `GC=F` (gold), `SI=F` (silver), `CL=F` (oil) | Futures format |

## API Route

**File:** `api/market/update-daily-prices.ts`

**Endpoint:** `POST /api/market/update-daily-prices`

**Authentication:** Bearer token (Firebase ID token) — uid derived via `verifyAuth()`

**Request Body:**
```json
{
  "symbols": ["AAPL", "MSFT", "VWCE.SW"]
}
```

**Response:**
```json
{
  "success": true,
  "prices": {
    "AAPL": { "price": 175.50, "currency": "USD", "marketTime": 1705330800000 },
    "MSFT": { "price": 390.25, "currency": "USD", "marketTime": 1705330800000 }
  },
  "fetched": ["AAPL", "MSFT"],
  "missing": ["INVALID"],
  "source": "yahoo"
}
```

## Client Usage

```typescript
import { getDailyPrices, getDailyPricesMap } from '@/services/market-data/DailyPriceService'

// Get detailed price data
const prices = await getDailyPrices(['AAPL', 'MSFT', 'VWCE.SW'])
// Returns: { 'AAPL': { price: 175.50, currency: 'USD', isStale: false, asOfDate: '2024-01-15' }, ... }

// Get simple price map
const priceMap = await getDailyPricesMap(['AAPL', 'MSFT'])
// Returns: { 'AAPL': 175.50, 'MSFT': 390.25 }
```

## Yahoo Finance API Details

- **Endpoint:** `GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1d`
- **Per-symbol:** One request per symbol (no batch endpoint); concurrency-limited to 10 parallel requests
- **Response fields:** `chart.result[0].meta.regularMarketPrice`, `.currency`, `.regularMarketTime`
- **No API key required**
- **Unofficial:** These endpoints are not officially documented; a browser-like User-Agent header is sent

## Supported Categories

Only these categories use Yahoo Finance prices:
- `Index Funds` (ETFs)
- `Stocks`
- `Commodities`

Crypto, Perpetuals, and other categories use different data sources.

## Crypto Pricing - CryptoCompare via Vercel Proxy

Crypto spot prices (USD) and USD→CHF rate are fetched via a Vercel API proxy. Users configure nothing — the app uses `CRYPTOCOMPARE_API_KEY` in server env.

```
┌─────────────────────────┐
│  Client Device          │
│  (cryptoCompareService) │
└───────────┬─────────────┘
            │ POST /api/market/crypto-prices
            │ (Bearer token + tickers)
            ▼
┌─────────────────────────┐
│  Vercel API Route       │
│  crypto-prices.ts       │
└───────────┬─────────────┘
            │ CRYPTOCOMPARE_API_KEY
            ▼
┌──────────────────────┐
│  CryptoCompare API   │
│  /data/pricemulti    │
└──────────────────────┘
```

**File:** `api/market/crypto-prices.ts`

**Endpoint:** `POST /api/market/crypto-prices`

**Request:** `{ "tickers": ["BTC", "ETH"] }`

**Response:** `{ "success": true, "prices": { "BTC": 60000 }, "usdToChfRate": 0.88, "source": "cryptocompare" }`

**Client:** `src/services/cryptoCompareService.ts` (mirrors `DailyPriceService` pattern)

**Env:** `CRYPTOCOMPARE_API_KEY` in Vercel / `.env.local` for `dev:api`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Yahoo returns 404 | Symbol returned in `missing` array |
| Yahoo rate limits (429) | Partial results returned |
| Network error | Log error, return empty |
| Symbol not recognized | Returned in `missing` array, UI shows "—" |
| Auth token invalid | 401 Unauthorized |

## Security

1. **No API key exposure risk:** Yahoo Finance endpoints are keyless
2. **Authentication:** Bearer token required on every request; uid derived from token
3. **Proxy pattern:** Client never calls Yahoo directly; the Vercel function acts as a proxy to avoid CORS issues and add auth

## Related Files

- `src/services/market-data/DailyPriceService.ts` - Main client-side service
- `api/market/update-daily-prices.ts` - Vercel API route (server-side proxy)
