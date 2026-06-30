import type { VercelRequest, VercelResponse } from '@vercel/node'

// CommonJS requires — api/package.json sets "type":"commonjs" so Vercel bundles
// these correctly. jose is pinned to v4 via root package.json overrides.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initializeApp, getApps, cert } = require('firebase-admin/app')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getAuth } = require('firebase-admin/auth')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestore } = require('firebase-admin/firestore')

let _adminInitialized = false

export function initializeAdmin(): void {
  if (_adminInitialized || getApps().length > 0) {
    _adminInitialized = true
    return
  }
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (sa) {
      initializeApp({ credential: cert(JSON.parse(sa)) })
    } else {
      initializeApp()
    }
    _adminInitialized = true
  } catch (e) {
    if (e instanceof Error && e.message.includes('already exists')) {
      _adminInitialized = true
      return
    }
    throw e
  }
}

export async function verifyAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<string | null> {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header.' })
    return null
  }
  try {
    return (await getAuth().verifyIdToken(h.slice(7))).uid
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' })
    return null
  }
}

export function getDb() {
  return getFirestore()
}

export function getAuthAdmin() {
  return getAuth()
}

export type Firestore = ReturnType<typeof getFirestore>
