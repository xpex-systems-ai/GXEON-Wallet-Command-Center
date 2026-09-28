import { FirestorePaymentStore, PaymentStore } from './_stripe.js';
import { FirestoreRestClient, isFirestoreRestConfigured } from './_firestoreRest.js';

let store: PaymentStore | null = null;

export function getPaymentStore(): PaymentStore {
  if (store) return store;

  if (!isFirestoreRestConfigured()) {
    throw new Error(
      'Durable Firestore is not configured. Refusing serverless in-memory payment state.'
    );
  }

  store = new FirestorePaymentStore();
  return store;
}

export async function paymentStoreHealth(): Promise<boolean> {
  if (!isFirestoreRestConfigured()) return false;
  return new FirestoreRestClient().healthCheck();
}

export function paymentStoreConfigured(): boolean {
  return isFirestoreRestConfigured();
}
