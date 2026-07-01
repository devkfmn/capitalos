# Running Capitalos Locally

## Frontend only

```bash
npm install
npm run dev
```

Open http://localhost:5173

Enough for most UI work, Net Worth, cashflow, settings, and crypto tax reports. Does **not** run `api/` serverless functions (Hyperliquid, MEXC, snapshots API, **crypto/stock price proxies**).

To load crypto or stock prices while using `npm run dev` (port 5173), also run `npm run dev:api` on port 3000 in a second terminal — Vite proxies `/api` requests there.

## Frontend + API (full parity)

First-time setup:

```bash
npm install
npx vercel login
npx vercel link
npm run env:pull
```

Start:

```bash
npm run dev:api
```

Open http://localhost:3000

`env:pull` writes `.env.local` (git-ignored). API routes need `FIREBASE_SERVICE_ACCOUNT` from the Vercel project. Crypto prices also need `CRYPTOCOMPARE_API_KEY` (add manually or via Vercel env pull after setting it in the Vercel dashboard).

## Other commands

```bash
npm run build    # production build
npm run preview  # serve dist/
npm run lint     # ESLint
```

## Auth

Routes except `/login` require Firebase Auth (project `capitalos-a24f7`). Use an account with **email/password** sign-in enabled.
