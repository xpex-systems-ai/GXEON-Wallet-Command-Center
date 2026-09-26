/**
 * GXEON Wallet Command Center - Bounty Firestore Repository
 * Handles owner-isolated bounty records at /bounties/{bountyId}
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
import { BountyItem } from '../../types';

const COLLECTION_NAME = 'bounties';

export async function fetchBountiesFromFirestore(ownerUid: string): Promise<BountyItem[]> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return [];

  const q = query(
    collection(db, COLLECTION_NAME),
    where('ownerUid', '==', ownerUid)
  );

  const snapshot = await getDocs(q);
  const items: BountyItem[] = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      id: docSnap.id,
      ownerUid: data.ownerUid,
      title: data.title,
      platform: data.platform,
      submissionDate: data.submissionDate,
      expectedReward: data.expectedReward,
      currency: data.currency,
      destinationWalletAddress: data.destinationWalletAddress,
      destinationWalletId: data.destinationWalletId,
      status: data.status,
      evidenceUrl: data.evidenceUrl,
      payoutVerification: data.payoutVerification,
      notes: data.notes,
      createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
      updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : (data.updatedAt || new Date().toISOString()),
    });
  });

  return items;
}

export async function saveBountyToFirestore(
  bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>,
  ownerUid: string,
  customId?: string
): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) {
    throw new Error('Firestore not initialized or ownerUid missing');
  }

  const bountyId = customId || `bounty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const docRef = doc(db, COLLECTION_NAME, bountyId);

  await setDoc(docRef, {
    ...bounty,
    ownerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return bountyId;
}

export async function updateBountyInFirestore(
  bountyId: string,
  updates: Partial<BountyItem>,
  ownerUid: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return;

  const docRef = doc(db, COLLECTION_NAME, bountyId);
  await updateDoc(docRef, {
    ...updates,
    ownerUid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBountyFromFirestore(
  bountyId: string,
  ownerUid: string
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return;

  const docRef = doc(db, COLLECTION_NAME, bountyId);
  await deleteDoc(docRef);
}
