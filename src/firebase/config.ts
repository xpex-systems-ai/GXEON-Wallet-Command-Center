/**
 * GXEON Wallet Command Center - Firebase Configuration Module
 * Reads client configuration from Vite environment variables (VITE_FIREBASE_*).
 * 
 * CRITICAL SECURITY INVARIANTS:
 * 1. NEVER contains private keys, seeds, recovery phrases, or local signing credentials.
 * 2. Dedicated project isolation: gxeon-wallet-command-center.
 * 3. Graceful fallback to Local Mode when environment variables are not set.
 */

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export function getFirebaseConfig(): FirebaseClientConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    return null;
  }

  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

export const isFirebaseConfigured = (): boolean => {
  return getFirebaseConfig() !== null;
};
