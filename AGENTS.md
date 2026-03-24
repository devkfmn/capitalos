# Capitalos

## Cursor Cloud specific instructions

### Overview

Capitalos is a single Vite + React + TypeScript wealth management web app with Vercel serverless API functions. Firebase (Firestore + Auth) is the sole backend — no local database or Docker needed.

### Running services

- **Dev server**: `npm run dev` (Vite, port 5173). Hot-reloads on file changes.
- **Build**: `npm run build` (production build to `dist/`).
- **Lint**: `npm run lint` (ESLint for `.js`/`.jsx` files). Pre-existing lint errors exist in utility scripts (`extract-pdfs.js`, `scripts/generate-icons.js`, `tailwind.config.js`) — these are not in the application source.
- **E2E tests**: `npm run test:e2e` (Playwright). Smoke tests pass without authentication. The Playwright config auto-starts the dev server if not already running. Only Chromium browsers are installed; run with `--project=chromium` for faster local runs.
- **Preview**: `npm run preview` serves the production build.

### Authentication

All routes except `/login` require Firebase Auth. The app connects to a live Firebase project (`capitalos-a24f7`). To test authenticated flows, you need a valid Firebase user account (email/password or Google). Without credentials, you can still verify the login page renders, route protection works, and smoke tests pass.

### Serverless API functions

The `api/` directory contains Vercel serverless functions. These require the `FIREBASE_SERVICE_ACCOUNT` environment variable to run locally via `vercel dev`. For front-end-only development, the Vite dev server is sufficient.

### Gotchas

- The lockfile is `package-lock.json` — use `npm` (not pnpm/yarn).
- No `.nvmrc` or `.node-version` file exists; Node 22.x works.
- No TypeScript compiler is configured for type-checking (no `tsconfig.json` in root); the codebase uses TypeScript via Vite's built-in support only.
- Playwright browsers: only Chromium is installed with system deps in the Cloud VM. Run `npx playwright install --with-deps chromium` if browsers are missing.
