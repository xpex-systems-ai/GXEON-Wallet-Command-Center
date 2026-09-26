import { WalletItem } from '../types';
import { bridgeService } from './bridgeService';
import { auditService } from './auditService';

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

  async getAllWallets(): Promise<WalletItem[]> {
    // 1. Fetch from Local Bridge if online
    const bridgeWallets = await bridgeService.getWallets();

    if (bridgeWallets.length > 0) {
      // Merge with custom additions
      const mergedMap = new Map<string, WalletItem>();
      for (const w of bridgeWallets) {
        mergedMap.set(w.id, w);
      }
      for (const w of this.localWallets) {
        if (!mergedMap.has(w.id)) {
          mergedMap.set(w.id, w);
        }
      }
      return Array.from(mergedMap.values());
    }

    // Fallback to local storage state
    return [...this.localWallets];
  }

  async addWallet(wallet: Omit<WalletItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WalletItem> {
    const newWallet: WalletItem = {
      ...wallet,
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.localWallets.push(newWallet);
    this.saveToStorage();

    auditService.recordEvent(
      'wallet_registered',
      `Registered wallet ${newWallet.name} (${newWallet.network}) with address ${newWallet.publicAddress}`
    );

    return newWallet;
  }

  async removeWallet(id: string): Promise<boolean> {
    const prevLen = this.localWallets.length;
    this.localWallets = this.localWallets.filter((w) => w.id !== id);
    if (this.localWallets.length < prevLen) {
      this.saveToStorage();
      auditService.recordEvent('wallet_removed', `Removed wallet ID ${id}`);
      return true;
    }
    return false;
  }

  async updateBalance(id: string, balance: string | null): Promise<void> {
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
