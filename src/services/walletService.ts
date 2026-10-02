import { WalletItem } from '../types';
import { bridgeService } from './bridgeService';
import { auditService } from './auditService';
import {
  fetchWalletsFromFirestore,
  saveWalletToFirestore,
  updateWalletInFirestore,
  deleteWalletFromFirestore,
} from './firestore/walletRepository';

const STORAGE_KEY = 'gxeon_wallets_v1';

// Initial baseline wallet from repository configuration
export const DEFAULT_INITIAL_WALLETS: WalletItem[] = [
  {
    id: 'rustchain-main',
    name: 'GXEON RustChain RTC',
    network: 'rustchain',
    symbol: 'RTC',
    publicAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
    connectionType: 'WATCH_ONLY',
    ownershipStatus: 'UNVERIFIED',
    mode: 'watch_only',
    balance: null,
    isOnline: false,
    purpose: 'bounties',
    notes: 'Public address used in RustChain bounty submissions. Ownership unverified until local cryptographic proof.',
  },
];

export class WalletService {
  private localWallets: WalletItem[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.localWallets = JSON.parse(stored);
      } else {
        this.localWallets = [...DEFAULT_INITIAL_WALLETS];
        this.saveToStorage();
      }
    } catch {
      this.localWallets = [...DEFAULT_INITIAL_WALLETS];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.localWallets));
    } catch (e) {
      console.error('Failed to persist wallets:', e);
    }
  }

  async getAllWallets(ownerUid?: string): Promise<WalletItem[]> {
    let cloudWallets: WalletItem[] = [];
    if (ownerUid) {
      try {
        cloudWallets = await fetchWalletsFromFirestore(ownerUid);
      } catch (err) {
        console.warn('Could not fetch wallets from Firestore, falling back to local storage:', err);
      }
    }

    // Fetch from Local Bridge if online
    const bridgeWallets = await bridgeService.getWallets();

    const mergedMap = new Map<string, WalletItem>();

    // 1. Add bridge wallets
    for (const w of bridgeWallets) {
      mergedMap.set(w.id, w);
    }

    // 2. Add cloud wallets (if logged in)
    for (const w of cloudWallets) {
      if (!mergedMap.has(w.id)) {
        mergedMap.set(w.id, w);
      }
    }

    // 3. Add local baseline / storage if no cloud wallets or not logged in
    if (cloudWallets.length === 0) {
      for (const w of this.localWallets) {
        if (!mergedMap.has(w.id)) {
          mergedMap.set(w.id, w);
        }
      }
    }

    const mergedWallets = Array.from(mergedMap.values());

    // Hydrate the public RustChain watch wallet from the server-side Money Truth endpoint.
    // This is read-only and never persists private keys, signing material, or synthetic balances.
    try {
      const response = await fetch('/api/integration-status', { cache: 'no-store' });
      if (response.ok) {
        const integrationStatus = await response.json() as {
          moneyTruthSnapshot?: {
            rtc?: {
            address?: string;
            balance?: string | null;
            status?: string;
              verifiedAt?: string | null;
            };
          };
        };
        const rtc = integrationStatus.moneyTruthSnapshot?.rtc;
        if (
          rtc?.status === 'CONFIRMED' &&
          typeof rtc.balance === 'string' &&
          /^\d+(\.\d+)?$/.test(rtc.balance)
        ) {
          return mergedWallets.map((wallet) =>
            wallet.network === 'rustchain' &&
            wallet.publicAddress.toLowerCase() === String(rtc.address || '').toLowerCase()
              ? {
                  ...wallet,
                  balance: rtc.balance,
                  isOnline: true,
                  updatedAt: rtc.verifiedAt || new Date().toISOString(),
                }
              : wallet
          );
        }
      }
    } catch (error) {
      console.warn('Live RustChain balance hydration unavailable:', error);
    }

    return mergedWallets;
  }

  async addWallet(
    wallet: Omit<WalletItem, 'id' | 'createdAt' | 'updatedAt'>,
    ownerUid?: string
  ): Promise<WalletItem> {
    const customId = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newWallet: WalletItem = {
      ...wallet,
      id: customId,
      ownerUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (ownerUid) {
      try {
        await saveWalletToFirestore(wallet, ownerUid, customId);
      } catch (err) {
        console.warn('Failed to save wallet to Firestore, saved locally:', err);
      }
    }

    this.localWallets.push(newWallet);
    this.saveToStorage();

    auditService.recordEvent(
      'wallet_registered',
      `Registered wallet ${newWallet.name} (${newWallet.network}) with address ${newWallet.publicAddress}`,
      'info',
      ownerUid
    );

    return newWallet;
  }

  async removeWallet(id: string, ownerUid?: string): Promise<boolean> {
    if (ownerUid) {
      try {
        await deleteWalletFromFirestore(id, ownerUid);
      } catch (err) {
        console.warn('Failed to delete wallet from Firestore:', err);
      }
    }

    const prevLen = this.localWallets.length;
    this.localWallets = this.localWallets.filter((w) => w.id !== id);
    if (this.localWallets.length < prevLen) {
      this.saveToStorage();
      auditService.recordEvent('wallet_removed', `Removed wallet ID ${id}`, 'info', ownerUid);
      return true;
    }
    return false;
  }

  async updateBalance(id: string, balance: string | null, ownerUid?: string): Promise<void> {
    if (ownerUid) {
      try {
        await updateWalletInFirestore(id, { balance }, ownerUid);
      } catch (err) {
        console.warn('Failed to update balance in Firestore:', err);
      }
    }

    this.localWallets = this.localWallets.map((w) => {
      if (w.id === id) {
        return { ...w, balance, updatedAt: new Date().toISOString() };
      }
      return w;
    });
    this.saveToStorage();
  }
}

export const walletService = new WalletService();
