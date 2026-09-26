import {
  RewardHistoryItem,
  WalletTransactionItem,
  PendingRewardItem,
  BalanceStatus,
} from '../types';
import { bridgeService } from './bridgeService';

export interface RustChainLiveBalanceResult {
  walletId: string;
  network: string;
  symbol: string;
  address: string;
  balance: string | null;
  balanceStatus: BalanceStatus;
  source: string;
  queriedAt: string;
  ownershipVerified: boolean;
  mode: string;
  note?: string;
}

export class RustChainService {
  /**
   * Queries real on-chain balance for a RustChain address via Local Companion or direct verified RPC.
   * TRUTH IN DATA INVARIANT:
   * Returns explicit UNAVAILABLE / null if no verified RPC is online.
   * Never fabricates balance values.
   */
  async getWalletBalance(walletId: string, address: string): Promise<RustChainLiveBalanceResult> {
    const timestamp = new Date().toISOString();
    try {
      const liveRes = await bridgeService.getRustChainBalance(walletId);
      if (liveRes && liveRes.status === 'AVAILABLE' && liveRes.balance !== null) {
        return {
          walletId,
          network: 'rustchain',
          symbol: 'RTC',
          address,
          balance: liveRes.balance,
          balanceStatus: 'AVAILABLE',
          source: liveRes.source || 'rustchain_official_rpc',
          queriedAt: liveRes.queried_at || timestamp,
          ownershipVerified: liveRes.ownership_verified || false,
          mode: liveRes.mode || 'watch_only',
          note: liveRes.note,
        };
      }

      return {
        walletId,
        network: 'rustchain',
        symbol: 'RTC',
        address,
        balance: null,
        balanceStatus: 'UNAVAILABLE',
        source: liveRes?.source || 'none',
        queriedAt: liveRes?.queried_at || timestamp,
        ownershipVerified: false,
        mode: 'watch_only',
        note: 'No verified RustChain RPC source is currently online. Balance is UNAVAILABLE.',
      };
    } catch {
      return {
        walletId,
        network: 'rustchain',
        symbol: 'RTC',
        address,
        balance: null,
        balanceStatus: 'UNAVAILABLE',
        source: 'none',
        queriedAt: timestamp,
        ownershipVerified: false,
        mode: 'watch_only',
        note: 'Could not connect to RustChain RPC provider.',
      };
    }
  }

  /**
   * Retrieves epoch mining reward history for a RustChain miner identity.
   */
  async getRewardHistory(minerId?: string | null): Promise<{
    rewards: RewardHistoryItem[];
    status: 'AVAILABLE' | 'UNAVAILABLE';
    source: string;
    queriedAt: string;
  }> {
    const timestamp = new Date().toISOString();
    if (!minerId) {
      return {
        rewards: [],
        status: 'UNAVAILABLE',
        source: 'none',
        queriedAt: timestamp,
      };
    }

    // Since official RustChain explorer API is pending live node connection:
    return {
      rewards: [],
      status: 'UNAVAILABLE',
      source: 'none',
      queriedAt: timestamp,
    };
  }

  /**
   * Retrieves verified transaction history for a RustChain wallet address.
   */
  async getWalletTransactions(walletId: string, address: string): Promise<{
    transactions: WalletTransactionItem[];
    status: 'AVAILABLE' | 'UNAVAILABLE';
    source: string;
    queriedAt: string;
  }> {
    const timestamp = new Date().toISOString();
    try {
      const txRes = await bridgeService.getRustChainTransactions(walletId);
      if (txRes && txRes.status === 'AVAILABLE') {
        const mapped: WalletTransactionItem[] = txRes.transactions.map((t: any) => ({
          id: t.id,
          txHash: t.txHash,
          network: 'rustchain',
          fromAddress: t.fromAddress || 'UNAVAILABLE',
          toAddress: t.toAddress || 'UNAVAILABLE',
          amount: t.amount,
          symbol: 'RTC',
          timestamp: t.date,
          status: t.status === 'CONFIRMED' ? 'CONFIRMED' : t.status === 'FAILED' ? 'FAILED' : 'PENDING',
          source: txRes.source,
        }));
        return {
          transactions: mapped,
          status: 'AVAILABLE',
          source: txRes.source,
          queriedAt: txRes.queried_at || timestamp,
        };
      }
    } catch {}

    return {
      transactions: [],
      status: 'UNAVAILABLE',
      source: 'none',
      queriedAt: timestamp,
    };
  }

  /**
   * Retrieves pending rewards waiting for epoch attestation confirmation.
   */
  async getPendingRewards(minerId?: string | null): Promise<{
    pending: PendingRewardItem[];
    status: 'AVAILABLE' | 'UNAVAILABLE';
    source: string;
    queriedAt: string;
  }> {
    const timestamp = new Date().toISOString();
    if (!minerId) {
      return {
        pending: [],
        status: 'UNAVAILABLE',
        source: 'none',
        queriedAt: timestamp,
      };
    }

    return {
      pending: [],
      status: 'UNAVAILABLE',
      source: 'none',
      queriedAt: timestamp,
    };
  }
}

export const rustchainService = new RustChainService();
