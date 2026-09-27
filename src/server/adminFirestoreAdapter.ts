import { getFirestore, Firestore, Transaction } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { CustomerOrder, JobTicket, MoneyTruthState } from '../features/sales/types';
import { FirestoreStore, FirestoreTransactionContext } from './firestoreAdapter';

export function getAdminFirestoreInstance(): Firestore {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

/**
 * Real Server-Side Production Firestore Adapter using official firebase-admin SDK.
 * Collections:
 * - orders/{orderId}
 * - stripe_events/{eventId}
 * - jobs/{jobId}
 * - payment_intent_mappings/{paymentIntentId}
 */
export class AdminFirestoreAdapter implements FirestoreStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db || getAdminFirestoreInstance();
  }

  async getOrder(orderId: string): Promise<CustomerOrder | null> {
    const docRef = this.db.collection('orders').doc(orderId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as CustomerOrder;
  }

  async setOrder(orderId: string, order: CustomerOrder): Promise<void> {
    const docRef = this.db.collection('orders').doc(orderId);
    await docRef.set(order);
  }

  async updateOrderState(
    orderId: string,
    state: MoneyTruthState,
    updates?: Partial<CustomerOrder>
  ): Promise<void> {
    const docRef = this.db.collection('orders').doc(orderId);
    await docRef.update({
      ...updates,
      state,
      updatedAt: new Date().toISOString()
    });
  }

  async getProcessedEvent(eventId: string): Promise<boolean> {
    const docRef = this.db.collection('stripe_events').doc(eventId);
    const snap = await docRef.get();
    return snap.exists;
  }

  async recordProcessedEvent(eventId: string, type: string, metadata?: Record<string, any>): Promise<void> {
    const docRef = this.db.collection('stripe_events').doc(eventId);
    await docRef.set({
      eventId,
      type,
      processedAt: new Date().toISOString(),
      metadata: metadata || {}
    });
  }

  async createJob(jobId: string, job: JobTicket): Promise<void> {
    const docRef = this.db.collection('jobs').doc(jobId);
    await docRef.set(job);
  }

  async getJob(jobId: string): Promise<JobTicket | null> {
    const docRef = this.db.collection('jobs').doc(jobId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as JobTicket;
  }

  async setPaymentIntentMapping(paymentIntentId: string, orderId: string): Promise<void> {
    const docRef = this.db.collection('payment_intent_mappings').doc(paymentIntentId);
    await docRef.set({ orderId, updatedAt: new Date().toISOString() });
  }

  async getOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const docRef = this.db.collection('payment_intent_mappings').doc(paymentIntentId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return (snap.data() as { orderId: string }).orderId || null;
  }

  async runTransaction<T>(updateFunction: (tx: FirestoreTransactionContext) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (transaction: Transaction) => {
      const txContext: FirestoreTransactionContext = {
        getOrder: async (orderId: string) => {
          const docRef = this.db.collection('orders').doc(orderId);
          const snap = await transaction.get(docRef);
          if (!snap.exists) return null;
          return snap.data() as CustomerOrder;
        },
        setOrder: async (orderId: string, order: CustomerOrder) => {
          const docRef = this.db.collection('orders').doc(orderId);
          transaction.set(docRef, order);
        },
        updateOrderState: async (orderId: string, state: MoneyTruthState, updates?: Partial<CustomerOrder>) => {
          const docRef = this.db.collection('orders').doc(orderId);
          transaction.update(docRef, {
            ...updates,
            state,
            updatedAt: new Date().toISOString()
          });
        },
        getProcessedEvent: async (eventId: string) => {
          const docRef = this.db.collection('stripe_events').doc(eventId);
          const snap = await transaction.get(docRef);
          return snap.exists;
        },
        recordProcessedEvent: async (eventId: string, type: string, metadata?: Record<string, any>) => {
          const docRef = this.db.collection('stripe_events').doc(eventId);
          transaction.set(docRef, {
            eventId,
            type,
            processedAt: new Date().toISOString(),
            metadata: metadata || {}
          });
        },
        createJob: async (jobId: string, job: JobTicket) => {
          const docRef = this.db.collection('jobs').doc(jobId);
          transaction.set(docRef, job);
        },
        getJob: async (jobId: string) => {
          const docRef = this.db.collection('jobs').doc(jobId);
          const snap = await transaction.get(docRef);
          if (!snap.exists) return null;
          return snap.data() as JobTicket;
        },
        setPaymentIntentMapping: async (paymentIntentId: string, orderId: string) => {
          const docRef = this.db.collection('payment_intent_mappings').doc(paymentIntentId);
          transaction.set(docRef, { orderId, updatedAt: new Date().toISOString() });
        },
        getOrderIdByPaymentIntent: async (paymentIntentId: string) => {
          const docRef = this.db.collection('payment_intent_mappings').doc(paymentIntentId);
          const snap = await transaction.get(docRef);
          if (!snap.exists) return null;
          return (snap.data() as { orderId: string }).orderId || null;
        }
      };

      return updateFunction(txContext);
    });
  }
}
