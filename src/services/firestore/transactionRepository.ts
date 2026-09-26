/**
 * GXEON Wallet Command Center - Transaction Firestore Repository
 * Handles owner-isolated, append-only transactions at /transactions/{txId}
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../../firebase/firestore';
import { TransactionItem } from '../../types';

const COLLECTION_NAME = 'transactions';

export async function fetchTransactionsFromFirestore(ownerUid: string): Promise<TransactionItem[]> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return [];

  const q = query(
    collection(db, COLLECTION_NAME),
    where('ownerUid', '==', ownerUid)
  );

  const snapshot = await getDocs(q);
  const items: TransactionItem[] = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      id: docSnap.id,
      ownerUid: data.ownerUid,
      date: data.date,
      network: data.network,
      walletId: data.walletId,
      walletAddress: data.walletAddress,
      type: data.type,
      asset: data.asset,
      amount: data.amount,
      status: data.status,
      txHash: data.txHash,
      explorerUrl: data.explorerUrl,
      bountyId: data.bountyId,
      notes: data.notes,
    });
  });

  return items;
}

export async function recordTransactionToFirestore(
  tx: Omit<TransactionItem, 'id'>,
  ownerUid: string,
  customId?: string
): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) {
    throw new Error('Firestore not initialized or ownerUid missing');
  }

  const txId = customId || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const docRef = doc(db, COLLECTION_NAME, txId);

  await setDoc(docRef, {
    ...tx,
    ownerUid,
    createdAt: serverTimestamp(),
  });

  return txId;
}
