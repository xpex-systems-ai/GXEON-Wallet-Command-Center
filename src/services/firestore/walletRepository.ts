/**
 * GXEON Wallet Command Center - Wallet Firestore Repository
 * Handles owner-isolated wallet metadata at /wallets/{walletId}
 * 
 * CRITICAL SECURITY INVARIANT:
 * NEVER stores private keys, seeds, or credentials.
 * Reads and writes are scoped strictly to the authenticated owner's UID.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../../firebase/firestore';
import { WalletItem } from '../../types';

const COLLECTION_NAME = 'wallets';

export async function fetchWalletsFromFirestore(ownerUid: string): Promise<WalletItem[]> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return [];

  const q = query(
    collection(db, COLLECTION_NAME),
    where('ownerUid', '==', ownerUid)
  );

  const snapshot = await getDocs(q);
  const items: WalletItem[] = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      id: docSnap.id,
      ownerUid: data.ownerUid,
      name: data.name,
      network: data.network,
      chainId: data.chainId,
      symbol: data.symbol,
      publicAddress: data.publicAddress,
      connectionType: data.connectionType || 'WATCH_ONLY',
      ownershipStatus: data.ownershipStatus || 'UNVERIFIED',
      mode: data.mode || 'watch_only',
      balance: data.balance ?? null,
      isOnline: data.isOnline ?? false,
      purpose: data.purpose,
      notes: data.notes,
      createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    });
  });

  return items;
}

export async function saveWalletToFirestore(
  wallet: Omit<WalletItem, 'id' | 'createdAt' | 'updatedAt'>,
  ownerUid: string,
  customId?: string
): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) {
    throw new Error('Firestore not initialized or ownerUid missing');
  }

  const walletId = customId || `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const docRef = doc(db, COLLECTION_NAME, walletId);

  await setDoc(docRef, {
    ...wallet,
    ownerUid,
    balance: wallet.balance ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return walletId;
}

export async function updateWalletInFirestore(
  walletId: string,
  updates: Partial<WalletItem>,
  ownerUid: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return;

  const docRef = doc(db, COLLECTION_NAME, walletId);
  await updateDoc(docRef, {
    ...updates,
    ownerUid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWalletFromFirestore(
  walletId: string,
  ownerUid: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return;

  const docRef = doc(db, COLLECTION_NAME, walletId);
  await deleteDoc(docRef);
}
