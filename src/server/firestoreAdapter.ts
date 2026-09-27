import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  Firestore
} from 'firebase/firestore';
import { CustomerOrder, JobTicket, MoneyTruthState } from '../features/sales/types';

export interface FirestoreTransactionContext {
  getOrder: (orderId: string) => Promise<CustomerOrder | null>;
  setOrder: (orderId: string, order: CustomerOrder) => Promise<void>;
  updateOrderState: (orderId: string, state: MoneyTruthState, updates?: Partial<CustomerOrder>) => Promise<void>;
  getProcessedEvent: (eventId: string) => Promise<boolean>;
  recordProcessedEvent: (eventId: string, type: string, metadata?: Record<string, any>) => Promise<void>;
  createJob: (jobId: string, job: JobTicket) => Promise<void>;
  getJob: (jobId: string) => Promise<JobTicket | null>;
  setPaymentIntentMapping: (paymentIntentId: string, orderId: string) => Promise<void>;
  getOrderIdByPaymentIntent: (paymentIntentId: string) => Promise<string | null>;
}

export interface FirestoreStore {
  getOrder: (orderId: string) => Promise<CustomerOrder | null>;
  setOrder: (orderId: string, order: CustomerOrder) => Promise<void>;
  updateOrderState: (orderId: string, state: MoneyTruthState, updates?: Partial<CustomerOrder>) => Promise<void>;
  getProcessedEvent: (eventId: string) => Promise<boolean>;
  recordProcessedEvent: (eventId: string, type: string, metadata?: Record<string, any>) => Promise<void>;
  createJob: (jobId: string, job: JobTicket) => Promise<void>;
  getJob: (jobId: string) => Promise<JobTicket | null>;
  setPaymentIntentMapping: (paymentIntentId: string, orderId: string) => Promise<void>;
  getOrderIdByPaymentIntent: (paymentIntentId: string) => Promise<string | null>;
  runTransaction: <T>(updateFunction: (tx: FirestoreTransactionContext) => Promise<T>) => Promise<T>;
}

/**
 * Real Firestore production adapter for GXEON Dual Revenue Engine.
 * Path collections:
 * - orders/{orderId}
 * - stripe_events/{eventId}
 * - jobs/{jobId}
 * - payment_intent_mappings/{paymentIntentId}
 */
export class ProductionFirestoreAdapter implements FirestoreStore {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async getOrder(orderId: string): Promise<CustomerOrder | null> {
    const docRef = doc(this.db, 'orders', orderId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as CustomerOrder;
  }

  async setOrder(orderId: string, order: CustomerOrder): Promise<void> {
    const docRef = doc(this.db, 'orders', orderId);
    await setDoc(docRef, order);
  }

  async updateOrderState(
    orderId: string,
    state: MoneyTruthState,
    updates?: Partial<CustomerOrder>
  ): Promise<void> {
    const docRef = doc(this.db, 'orders', orderId);
    await updateDoc(docRef, {
      ...updates,
      state,
      updatedAt: new Date().toISOString()
    });
  }

  async getProcessedEvent(eventId: string): Promise<boolean> {
    const docRef = doc(this.db, 'stripe_events', eventId);
    const snap = await getDoc(docRef);
    return snap.exists();
  }

  async recordProcessedEvent(eventId: string, type: string, metadata?: Record<string, any>): Promise<void> {
    const docRef = doc(this.db, 'stripe_events', eventId);
    await setDoc(docRef, {
      eventId,
      type,
      processedAt: new Date().toISOString(),
      metadata: metadata || {}
    });
  }

  async createJob(jobId: string, job: JobTicket): Promise<void> {
    const docRef = doc(this.db, 'jobs', jobId);
    await setDoc(docRef, job);
  }

  async getJob(jobId: string): Promise<JobTicket | null> {
    const docRef = doc(this.db, 'jobs', jobId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as JobTicket;
  }

  async setPaymentIntentMapping(paymentIntentId: string, orderId: string): Promise<void> {
    const docRef = doc(this.db, 'payment_intent_mappings', paymentIntentId);
    await setDoc(docRef, { orderId, updatedAt: new Date().toISOString() });
  }

  async getOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const docRef = doc(this.db, 'payment_intent_mappings', paymentIntentId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return (snap.data() as { orderId: string }).orderId || null;
  }

  async runTransaction<T>(updateFunction: (tx: FirestoreTransactionContext) => Promise<T>): Promise<T> {
    return runTransaction(this.db, async (transaction) => {
      const txContext: FirestoreTransactionContext = {
        getOrder: async (orderId: string) => {
          const docRef = doc(this.db, 'orders', orderId);
          const snap = await transaction.get(docRef);
          if (!snap.exists()) return null;
          return snap.data() as CustomerOrder;
        },
        setOrder: async (orderId: string, order: CustomerOrder) => {
          const docRef = doc(this.db, 'orders', orderId);
          transaction.set(docRef, order);
        },
        updateOrderState: async (orderId: string, state: MoneyTruthState, updates?: Partial<CustomerOrder>) => {
          const docRef = doc(this.db, 'orders', orderId);
          transaction.update(docRef, {
            ...updates,
            state,
            updatedAt: new Date().toISOString()
          });
        },
        getProcessedEvent: async (eventId: string) => {
          const docRef = doc(this.db, 'stripe_events', eventId);
          const snap = await transaction.get(docRef);
          return snap.exists();
        },
        recordProcessedEvent: async (eventId: string, type: string, metadata?: Record<string, any>) => {
          const docRef = doc(this.db, 'stripe_events', eventId);
          transaction.set(docRef, {
            eventId,
            type,
            processedAt: new Date().toISOString(),
            metadata: metadata || {}
          });
        },
        createJob: async (jobId: string, job: JobTicket) => {
          const docRef = doc(this.db, 'jobs', jobId);
          transaction.set(docRef, job);
        },
        getJob: async (jobId: string) => {
          const docRef = doc(this.db, 'jobs', jobId);
          const snap = await transaction.get(docRef);
          if (!snap.exists()) return null;
          return snap.data() as JobTicket;
        },
        setPaymentIntentMapping: async (paymentIntentId: string, orderId: string) => {
          const docRef = doc(this.db, 'payment_intent_mappings', paymentIntentId);
          transaction.set(docRef, { orderId, updatedAt: new Date().toISOString() });
        },
        getOrderIdByPaymentIntent: async (paymentIntentId: string) => {
          const docRef = doc(this.db, 'payment_intent_mappings', paymentIntentId);
          const snap = await transaction.get(docRef);
          if (!snap.exists()) return null;
          return (snap.data() as { orderId: string }).orderId || null;
        }
      };

      return updateFunction(txContext);
    });
  }
}

/**
 * Transaction-safe In-Memory Firestore adapter for tests and local emulation.
 * Guarantees rollback on exception and atomic commits.
 */
export class InMemoryFirestoreAdapter implements FirestoreStore {
  public orders = new Map<string, CustomerOrder>();
  public stripeEvents = new Map<string, { eventId: string; type: string; processedAt: string; metadata?: any }>();
  public jobs = new Map<string, JobTicket>();
  public paymentIntentMappings = new Map<string, string>();

  async getOrder(orderId: string): Promise<CustomerOrder | null> {
    return this.orders.has(orderId) ? { ...this.orders.get(orderId)! } : null;
  }

  async setOrder(orderId: string, order: CustomerOrder): Promise<void> {
    this.orders.set(orderId, { ...order });
  }

  async updateOrderState(
    orderId: string,
    state: MoneyTruthState,
    updates?: Partial<CustomerOrder>
  ): Promise<void> {
    const existing = this.orders.get(orderId);
    if (existing) {
      this.orders.set(orderId, {
        ...existing,
        ...updates,
        state,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async getProcessedEvent(eventId: string): Promise<boolean> {
    return this.stripeEvents.has(eventId);
  }

  async recordProcessedEvent(eventId: string, type: string, metadata?: Record<string, any>): Promise<void> {
    this.stripeEvents.set(eventId, {
      eventId,
      type,
      processedAt: new Date().toISOString(),
      metadata: metadata || {}
    });
  }

  async createJob(jobId: string, job: JobTicket): Promise<void> {
    this.jobs.set(jobId, { ...job });
  }

  async getJob(jobId: string): Promise<JobTicket | null> {
    return this.jobs.has(jobId) ? { ...this.jobs.get(jobId)! } : null;
  }

  async setPaymentIntentMapping(paymentIntentId: string, orderId: string): Promise<void> {
    this.paymentIntentMappings.set(paymentIntentId, orderId);
  }

  async getOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
    return this.paymentIntentMappings.get(paymentIntentId) || null;
  }

  private transactionLock: Promise<void> = Promise.resolve();

  async runTransaction<T>(updateFunction: (tx: FirestoreTransactionContext) => Promise<T>): Promise<T> {
    const execute = async () => {
      // Stage updates in isolated transactional buffer from latest committed state
      const stagedOrders = new Map(this.orders);
      const stagedEvents = new Map(this.stripeEvents);
      const stagedJobs = new Map(this.jobs);
      const stagedMappings = new Map(this.paymentIntentMappings);

      const txContext: FirestoreTransactionContext = {
        getOrder: async (orderId: string) => {
          return stagedOrders.has(orderId) ? { ...stagedOrders.get(orderId)! } : null;
        },
        setOrder: async (orderId: string, order: CustomerOrder) => {
          stagedOrders.set(orderId, { ...order });
        },
        updateOrderState: async (orderId: string, state: MoneyTruthState, updates?: Partial<CustomerOrder>) => {
          const existing = stagedOrders.get(orderId);
          if (existing) {
            stagedOrders.set(orderId, {
              ...existing,
              ...updates,
              state,
              updatedAt: new Date().toISOString()
            });
          }
        },
        getProcessedEvent: async (eventId: string) => {
          return stagedEvents.has(eventId);
        },
        recordProcessedEvent: async (eventId: string, type: string, metadata?: Record<string, any>) => {
          stagedEvents.set(eventId, {
            eventId,
            type,
            processedAt: new Date().toISOString(),
            metadata: metadata || {}
          });
        },
        createJob: async (jobId: string, job: JobTicket) => {
          stagedJobs.set(jobId, { ...job });
        },
        getJob: async (jobId: string) => {
          return stagedJobs.has(jobId) ? { ...stagedJobs.get(jobId)! } : null;
        },
        setPaymentIntentMapping: async (paymentIntentId: string, orderId: string) => {
          stagedMappings.set(paymentIntentId, orderId);
        },
        getOrderIdByPaymentIntent: async (paymentIntentId: string) => {
          return stagedMappings.get(paymentIntentId) || null;
        }
      };

      const result = await updateFunction(txContext);

      // Commit atomically
      this.orders = stagedOrders;
      this.stripeEvents = stagedEvents;
      this.jobs = stagedJobs;
      this.paymentIntentMappings = stagedMappings;

      return result;
    };

    const prevLock = this.transactionLock;
    let nextResolve: () => void;
    this.transactionLock = new Promise<void>((resolve) => {
      nextResolve = resolve;
    });

    try {
      await prevLock;
      return await execute();
    } finally {
      nextResolve!();
    }
  }
}
