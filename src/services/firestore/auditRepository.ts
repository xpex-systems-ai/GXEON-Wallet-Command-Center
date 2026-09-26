/**
 * GXEON Wallet Command Center - Audit Firestore Repository
 * Handles owner-isolated, append-only audit trail at /audit_events/{eventId}
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
import { AuditEvent } from '../../types';

const COLLECTION_NAME = 'audit_events';

export async function fetchAuditEventsFromFirestore(ownerUid: string): Promise<AuditEvent[]> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) return [];

  const q = query(
    collection(db, COLLECTION_NAME),
    where('ownerUid', '==', ownerUid)
  );

  const snapshot = await getDocs(q);
  const items: AuditEvent[] = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      id: docSnap.id,
      ownerUid: data.ownerUid,
      timestamp: data.timestamp,
      event: data.event,
      detail: data.detail,
      severity: data.severity || 'info',
      actor: data.actor,
    });
  });

  return items;
}

export async function recordAuditEventToFirestore(
  event: Omit<AuditEvent, 'id'>,
  ownerUid: string,
  customId?: string
): Promise<string> {
  const db = getFirebaseFirestore();
  if (!db || !ownerUid) {
    throw new Error('Firestore not initialized or ownerUid missing');
  }

  const eventId = customId || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const docRef = doc(db, COLLECTION_NAME, eventId);

  await setDoc(docRef, {
    ...event,
    ownerUid,
    createdAt: serverTimestamp(),
  });

  return eventId;
}
