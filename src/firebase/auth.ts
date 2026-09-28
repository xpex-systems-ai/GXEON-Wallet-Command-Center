/**
 * GXEON Wallet Command Center - Firebase Auth Service
 * Provides authentication state, email/password signup, login, and signout.
 */

import {
  getAuth,
  Auth,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  Unsubscribe,
} from 'firebase/auth';
import { getFirebaseApp } from './app';

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (authInstance) {
    return authInstance;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  try {
    authInstance = getAuth(app);
    return authInstance;
  } catch (error) {
    console.error('Failed to get Firebase Auth instance:', error);
    return null;
  }
}

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not initialized');
  }
  const credential = await signInWithEmailAndPassword(auth, email, pass);
  return credential.user;
}

export async function registerWithEmail(email: string, pass: string): Promise<User> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not initialized');
  }
  const credential = await createUserWithEmailAndPassword(auth, email, pass);
  return credential.user;
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }
  await fbSignOut(auth);
}

export function subscribeToAuthState(callback: (user: User | null) => void): Unsubscribe {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
