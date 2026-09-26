/**
 * GXEON Wallet Command Center - Firebase App Initialization
 * Initializes the Firebase App instance singleton.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirebaseConfig } from './config';

let appInstance: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (appInstance) {
    return appInstance;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
    return appInstance;
  }

  const config = getFirebaseConfig();
  if (!config) {
    return null;
  }

  try {
    appInstance = initializeApp(config);
    return appInstance;
  } catch (error) {
    console.error('Failed to initialize Firebase App:', error);
    return null;
  }
}
