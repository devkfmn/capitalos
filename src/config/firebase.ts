// Firebase configuration and initialization
import { initializeApp } from "firebase/app"
import { getAnalytics } from "firebase/analytics"
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC8ebAZsCxozD6xCF2hqB5vokJnrEH6-B4",
  authDomain: "capitalos-a24f7.firebaseapp.com",
  projectId: "capitalos-a24f7",
  storageBucket: "capitalos-a24f7.firebasestorage.app",
  messagingSenderId: "639751428084",
  appId: "1:639751428084:web:9f35c96d07da27aa2e0ba1",
  measurementId: "G-9VXC3P4DX9"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase App Check (bot/abuse protection for Firestore + APIs).
//
// To enable enforcement:
//   1. In the Firebase Console -> App Check, register this web app with the
//      reCAPTCHA v3 provider and copy the site key.
//   2. Set VITE_RECAPTCHA_V3_SITE_KEY in the build environment (e.g. Vercel
//      env vars) to that site key.
//   3. Turn on "Enforce" for Cloud Firestore (and any callable APIs) in the
//      App Check console once you've confirmed traffic is being verified.
//   4. For local development, set a debug token: run the app once with App
//      Check enabled, copy the debug token logged to the console, and register
//      it under App Check -> Apps -> Manage debug tokens.
//
// App Check is only initialized when a site key is provided, so dev/test
// environments without the key continue to work unchanged.
if (typeof window !== 'undefined') {
  const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY as string | undefined
  if (appCheckSiteKey) {
    if (import.meta.env.DEV) {
      // Allows App Check to issue debug tokens during local development.
      ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (err) {
      console.error('[Firebase] Failed to initialize App Check:', err)
    }
  }
}

// Initialize Analytics (only in browser, not SSR)
let analytics: ReturnType<typeof getAnalytics> | null = null
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app)
}

// Initialize Auth with Google provider
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

// Initialize Firestore
export const db = getFirestore(app)

export { app, analytics }

