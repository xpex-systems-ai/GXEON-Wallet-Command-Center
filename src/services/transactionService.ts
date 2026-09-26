import { TransactionItem } from '../types';

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

  getTransactions(): TransactionItem[] {
    return [...this.transactions];
  }

  recordTransaction(tx: Omit<TransactionItem, 'id'>): TransactionItem {
    const newTx: TransactionItem = {
      ...tx,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.transactions.unshift(newTx);
    this.saveToStorage();
    return newTx;
  }
}

export const transactionService = new TransactionService();
