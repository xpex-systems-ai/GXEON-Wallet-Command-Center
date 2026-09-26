/**
 * GXEON Wallet Command Center - Cloud Firestore Instance
 * Provides singleton Firestore database instance.
 */

import { getFirestore, Firestore } from 'firebase/firestore';
import { getFirebaseApp } from './app';

let firestoreInstance: Firestore | null = null;

export function getFirebaseFirestore(): Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  try {
    firestoreInstance = getFirestore(app);
    return firestoreInstance;
  } catch (error) {
    console.error('Failed to get Firestore instance:', error);
    return null;
  }
}
