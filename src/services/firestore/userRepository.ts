/**
 * GXEON Wallet Command Center - User Firestore Repository
 * Strictly handles non-sensitive user metadata at /users/{uid}
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role?: string;
  createdAt?: unknown;
  lastLoginAt?: unknown;
}

export async function syncUserProfile(uid: string, email: string): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;

  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      role: 'operator',
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
    });
  }
}
