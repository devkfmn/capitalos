# Market Data Specification

## Scope
This specification defines **current** market data behavior:

- FX rate sources and caching
- Crypto price sources and USD→CHF rate source
- Stock/ETF/commodity price source
- Refresh intervals (where implemented)
- TTL, inflight request deduplication (where implemented)
- Error handling and UI fallbacks
- Rate limiting strategy
- Snapshot consistency rules (as implemented / not implemented)

This spec is status-quo-only and documents **multiple** market-data paths that currently exist in the repo.

## Definitions (data model / terms)

### “Prices map”
In several places, the app uses “prices maps”:

- `cryptoPrices: Record<string, number>` mapping ticker → USD price
- `stockPrices: Record<string, number>` mapping ticker → USD price (from Yahoo Finance)

### “USD→CHF rate”
The app frequently uses `usdToChfRate: number | null` sourced from CryptoCompare.

### Market Data Cache
There is an in-memory cache with TTL + inflight deduplication:

- `src/services/market-data/MarketDataCache.ts` → `marketDataCache`

This cache is used only by the newer `src/services/market-data/*` SSOT services.

## Data Sources & Ownership (SSOT)

### FX rates (client conversion layer)
Current FX rates used by the UI conversion layer are fetched and cached by:

- `src/services/exchangeRateService.ts` → `getExchangeRates(base)`

Upstream:

- `https://api.exchangerate-api.com/v4/latest/{base}`

Caching:

- Cached in localStorage under key `capitalos_exchange_rates_v1`
- TTL: 24 hours

Fallbacks:

- If fetch fails, it uses cached data (even if stale) if base matches
- If no cache exists, returns hardcoded `{CHF:1, EUR:1, USD:1}`

### Crypto prices + USD→CHF (current primary path)

CryptoCompare via Vercel API proxy (same pattern as Yahoo stock prices):

- Server lib: `lib/cryptoCompare.ts` (requires `apiKey` param)
- Client: `src/services/cryptoCompareService.ts` → `POST /api/market/crypto-prices`
- API route: `api/market/crypto-prices.ts` (uses `process.env.CRYPTOCOMPARE_API_KEY`)
- Snapshots: `api/snapshot/create.ts` passes env key to `fetchCryptoData`

Upstream endpoints (called server-side only):

- Prices: `https://min-api.cryptocompare.com/data/pricemulti?fsyms=...&tsyms=USD&api_key=...`
- USD→CHF: `https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=CHF&api_key=...`

Consumers:

- Dashboard and DataContext call `fetchCryptoData(...)` (prices + usdToChfRate) via client service.

Caching:

- No local caching in `lib/cryptoCompare.ts`.
- Refresh behavior is determined by callers (see Refresh section).

**No user API key required** — app-owned `CRYPTOCOMPARE_API_KEY` in Vercel env (see `.env.example`).

### Stock/ETF/commodity prices (Yahoo Finance via Vercel proxy)
Client service:

- `src/services/yahooFinanceService.ts` → `fetchStockPrices(tickers, apiKey)`

Upstream:

- `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=...`

Headers:

- `x-rapidapi-key` (from Settings or env)
- `x-rapidapi-host: apidojo-yahoo-finance-v1.p.rapidapi.com`

Rate limiting:

- Enforced in `yahooFinanceService.ts`:
  - MIN_REQUEST_INTERVAL = 1000ms (1 second)

Caching:

- No caching is implemented in this legacy service; callers refresh periodically.

### New “SSOT” market-data services (present but not wired into main app)
There is a newer market-data subsystem:

- FX: `src/services/market-data/FxRateService.ts` (fawazahmed0 currency-api via jsdelivr/pages.dev)
- Crypto: `src/services/market-data/CryptoPriceService.ts` (CryptoCompare, cached)
- Market: `src/services/market-data/MarketPriceService.ts` (Yahoo RapidAPI, cached)

These use:

- `src/services/market-data/MarketDataCache.ts` for TTL + inflight dedup

**Current behavior unclear**

- These SSOT services are not clearly wired into the primary page flows. Some valuation provider hooks reference them, but `MarketDataProvider` and `ValuationProvider` are not mounted in `src/App.jsx`.

Involved code:

- `src/providers/MarketDataProvider.tsx`
- `src/providers/ValuationProvider.tsx`
- `src/App.jsx` (does not include these providers)

## User Flows (step-by-step)

### A) Initial app load
Prices and FX are loaded as part of:

- `CurrencyContext` (FX rates via exchangerate-api.com)
- `DataContext` (crypto + stock prices)
- Some pages (Dashboard) also fetch prices on their own interval.

### B) Periodic refresh
There are two refresh mechanisms in current code:

1) **DataContext** refresh:
   - `src/contexts/DataContext.tsx` sets up a 5-minute refresh for crypto and stock prices (status quo as seen in repo).
2) **Dashboard** refresh:
   - `src/pages/Dashboard.tsx` independently fetches crypto and stock prices and repeats every 5 minutes when there are net worth items.

This duplication means:

- Market data can be refreshed from multiple places.
- “Last refresh time” is not globally coordinated.

## Behavioral Rules (MUST / MUST NOT)

### Refresh interval
- Pages that implement refresh (DataContext and Dashboard) MUST refresh prices every **300,000 ms** (5 minutes) once active.

### Rate limiting (Yahoo RapidAPI)
- The Yahoo Finance fetcher MUST enforce a minimum 1-second delay between outgoing requests from `yahooFinanceService.ts`.

### Inflight request deduplication (new SSOT services only)
- When using `marketDataCache.getOrFetch(key, fetcher, ttl)`, concurrent calls for the same key MUST share a single inflight promise.

### TTL behavior (new SSOT services only)
Default TTL used by SSOT market-data services:

- 10 minutes (600,000 ms)

### Error handling defaults
- CryptoCompare failures MUST return empty price maps and/or null rates (callers are expected to handle).
- Yahoo Finance failures MUST return `{}` and log errors; MUST NOT throw to the UI caller.
- ExchangeRate failures MUST fall back to cached or hardcoded rates.

## Validation Rules
- Tickers are normalized via `.trim().toUpperCase()` in most places.
- Yahoo and Crypto services deduplicate tickers by Set semantics.

## Loading States
There is no global “market data loading” screen.

Per-feature loading states include:

- Net Worth modals show `(fetching...)` next to price-per-item during auto-fetch.
- Dashboard has an internal `isRefreshingPrices` state used for pull-to-refresh and background refresh, but does not display a global overlay by default.

## Market Data Health Status

`DataContext` exposes `marketDataStatus` alongside price maps so the UI can surface degraded fetches without changing valuation fallback logic.

### Types

```typescript
type FetchHealth = 'idle' | 'loading' | 'ok' | 'partial' | 'error'

interface PriceSourceStatus {
  health: FetchHealth
  fetchedAt: number | null
  requestedTickers: string[]
  missingTickers: string[]
  errorMessage?: string
}

interface MarketDataStatus {
  crypto: PriceSourceStatus
  stocks: PriceSourceStatus
}
```

### Health assignment

| Scenario | `health` | `missingTickers` |
|----------|----------|------------------|
| No items in category | `idle` | `[]` |
| Fetch in progress | `loading` | prior value or `[]` |
| API throws / returns null | `error` | all requested |
| API OK but some symbols missing | `partial` | missing subset |
| All symbols returned | `ok` | `[]` |

### Refresh safety

- `refreshPrices` MUST merge newly fetched prices into existing maps.
- On failed refresh, `refreshPrices` MUST NOT overwrite non-empty `cryptoPrices` / `stockPrices` with `{}`.
- Health status MAY downgrade on failure; price maps MUST retain last known good values.

## UI Error Visibility

Wealth pages (Dashboard, Net Worth, Analytics) MUST show `MarketDataWarningBanner` when `useMarketDataHealth().showBanner === true`.

The banner:

- Is persistent while market data is degraded (not dismissible until health recovers).
- Shows a plain-language summary and optional detail list.
- Provides a **Retry** action that calls `DataContext.refreshPrices()`.

Net Worth row indicators for market-driven categories:

- Green dot = live price available.
- Red dot + **Est.** label = transaction-based fallback; dot MUST have a `title` tooltip.

`useMarketDataHealth` aggregates `marketDataStatus`, `CurrencyContext` (`ratesReady`, `error`, `exchangeRates.fetchedAt`), and active net worth items into user-facing messages. It does not change valuation math.

## Error Handling & Fallbacks

### FX rates
- If exchange rate fetch fails:
  - Use cached localStorage value if base matches (even if older than 24h)
  - Else signal unavailable (`ratesReady = false`); do NOT fabricate 1:1 rates
- Stale cached FX (>24h) while `ratesReady` MAY surface a softer warning via `useMarketDataHealth`

### Crypto prices
- If crypto price fetch fails, consumer code generally:
  - Uses empty price map `{}` and `usdToChfRate=null` (or merges last known good on refresh failure)
  - Net worth and dashboard computations fall back to transaction-based valuations.
  - UI MUST surface degraded state via banner and row indicators.

### Yahoo / daily prices
- If API fails:
  - Returns empty or partial price map; logs errors; MUST NOT throw to UI caller
- Partial responses populate `missingTickers` in `marketDataStatus.stocks`

## Edge Cases

### Consistency across a single render (“price snapshots”)
**Current behavior unclear**

- There is no single global “valuation snapshot” guarantee across the entire app.
- Some modules (the unused `ValuationEngine`) build an explicit `quotesSnapshot` and `fxSnapshot`, but that is not the main path used by Dashboard and Net Worth today.

Involved code:

- `src/services/valuation/ValuationEngine.ts` (snapshots exist in output)
- `src/pages/Dashboard.tsx` (computes using component-local cryptoPrices/stockPrices)
- `src/contexts/DataContext.tsx` (computes using context state)

**PROPOSAL**

- Compute valuation using a single snapshot object per refresh and feed all pages the same snapshot to prevent inconsistent UI.

## Persistence (Firestore paths, local cache)
- FX rates: localStorage `capitalos_exchange_rates_v1`
- MarketDataCache: in-memory only (not persisted)
- API keys needed for Yahoo RapidAPI are stored in Firestore settings (see `docs/specs/settings.spec.md`)

## Acceptance Criteria (testable)

1. **FX cache TTL**:
   - When exchange rates were fetched within last 24h for same base, `getExchangeRates(base)` MUST return cached values without network call (can be asserted by network interception).
2. **Yahoo rate limit**:
   - Two back-to-back Yahoo Finance fetches MUST be delayed by at least 1 second.
3. **CryptoCompare failure fallback (display only)**:
   - If CryptoCompare requests fail, net worth **display** MUST still render finite totals (using transaction-derived valuations).
   - Persisted net worth **snapshots** MUST NOT use this fallback — see `docs/specs/snapshots.spec.md` (live-price guard).
4. **UI visibility on failure**:
   - When crypto or stock health is `error` or `partial` and the user has market-driven items, wealth pages MUST show `MarketDataWarningBanner`.
5. **Refresh safety**:
   - After a failed `refreshPrices`, previously loaded prices MUST remain in state.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Remove duplication by picking one market-data subsystem (legacy vs `src/services/market-data/*`) and wiring it consistently through the app.

