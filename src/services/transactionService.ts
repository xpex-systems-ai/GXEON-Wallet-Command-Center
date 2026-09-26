import { TransactionItem } from '../types';
import {
  fetchTransactionsFromFirestore,
  recordTransactionToFirestore,
} from './firestore/transactionRepository';

const TX_STORAGE_KEY = 'gxeon_transactions_v1';

export class TransactionService {
  private transactions: TransactionItem[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(TX_STORAGE_KEY);
      if (stored) {
        this.transactions = JSON.parse(stored);
      } else {
        // Strict principle: NEVER fabricate fake historical transactions
        this.transactions = [];
        this.saveToStorage();
      }
    } catch {
      this.transactions = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(this.transactions));
    } catch (e) {
      console.error('Failed to persist transactions:', e);
    }
  }

  async loadFromCloud(ownerUid: string): Promise<TransactionItem[]> {
    try {
      const cloudItems = await fetchTransactionsFromFirestore(ownerUid);
      this.transactions = cloudItems;
      this.saveToStorage();
      return [...this.transactions];
    } catch (err) {
      console.warn('Failed to load transactions from Firestore:', err);
      return this.getTransactions();
    }
  }

  getTransactions(): TransactionItem[] {
    return [...this.transactions];
  }

  async recordTransaction(
    tx: Omit<TransactionItem, 'id'>,
    ownerUid?: string
  ): Promise<TransactionItem> {
    const customId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTx: TransactionItem = {
      ...tx,
      id: customId,
      ownerUid,
    };

    if (ownerUid) {
      try {
        await recordTransactionToFirestore({ ...tx, ownerUid }, ownerUid, customId);
      } catch (err) {
        console.warn('Failed to record transaction to Firestore:', err);
      }
    }

    this.transactions.unshift(newTx);
    this.saveToStorage();
    return newTx;
  }
}

export const transactionService = new TransactionService();
