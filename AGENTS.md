# Capitalos

## Cursor Cloud specific instructions

### Overview

Capitalos is a single Vite + React + TypeScript wealth management web app with Vercel serverless API functions. Firebase (Firestore + Auth) is the sole backend — no local database or Docker needed.

### Running services

- **Dev server**: `npm run dev` (Vite, port 5173). Hot-reloads on file changes.
- **Build**: `npm run build` (production build to `dist/`).
- **Lint**: `npm run lint` (ESLint for `.js`/`.jsx` files). Pre-existing lint errors exist in utility scripts (`scripts/generate-icons.js`, `tailwind.config.js`) — these are not in the application source.
- **Preview**: `npm run preview` serves the production build.

### Authentication

All routes except `/login` require Firebase Auth. The app connects to a live Firebase project (`capitalos-a24f7`). To test authenticated flows, you need a valid Firebase user account with **email/password sign-in enabled** (not Google-only). The test account must have email/password as an auth provider in the Firebase console — a Google-only account will return `INVALID_LOGIN_CREDENTIALS` when using `signInWithEmailAndPassword`. Google OAuth sign-in requires completing 2FA in the browser, which is not automatable.

Without working credentials, you can still verify: login page rendering, route protection (unauthenticated redirects), build, and lint.

### Serverless API functions

The `api/` directory contains Vercel serverless functions. The plain Vite dev server (`npm run dev`) does **not** serve these, so exchange/perpetuals data (Hyperliquid + MEXC) only loads when the API layer is running. For front-end-only work, `npm run dev` is enough.

To run the API functions locally with the frontend (full parity with production):

- **`npm run dev:api`** — runs `vercel dev`, serving the Vite frontend and the `api/` functions together on one port.
- **`npm run env:pull`** — runs `vercel env pull .env.local` to download the project's env vars (including `FIREBASE_SERVICE_ACCOUNT`) into a git-ignored `.env.local`.

First-time setup:

```
npx vercel login
npx vercel link        # link to the existing "capitalos" project
npm run env:pull       # writes .env.local
npm run dev:api        # http://localhost:3000
```

The only variable the perpetuals/exchange functions need is `FIREBASE_SERVICE_ACCOUNT` (used to verify the caller's Firebase ID token and read per-user settings). MEXC API keys are read per-user from Firestore, not from env. See `.env.example` for details.

### Gotchas

- The lockfile is `package-lock.json` — use `npm` (not pnpm/yarn).
- No `.nvmrc` or `.node-version` file exists; Node 22.x works.
- No TypeScript compiler is configured for type-checking (no `tsconfig.json` in root); the codebase uses TypeScript via Vite's built-in support only.
