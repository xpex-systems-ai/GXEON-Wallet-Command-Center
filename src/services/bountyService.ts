import { BountyItem, BountyStatus } from '../types';
import { auditService } from './auditService';

const BOUNTY_STORAGE_KEY = 'gxeon_bounties_v1';

export const INITIAL_BOUNTIES: BountyItem[] = [
  {
    id: 'bounty-rtc-01',
    title: 'RustChain Core CLI Benchmark & Security Verification',
    platform: 'RustChain Grants & Bounties',
    submissionDate: '2026-09-20',
    expectedReward: '250',
    currency: 'RTC',
    destinationWalletAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
    destinationWalletId: 'rustchain-main',
    status: 'SUBMITTED',
    evidenceUrl: 'https://github.com/rustchain/bounties/issues/142',
    notes: 'Submitted verification report. Awaiting grant reviewer audit.',
    createdAt: '2026-09-20T14:30:00Z',
    updatedAt: '2026-09-20T14:30:00Z',
  },
  {
    id: 'bounty-evm-02',
    title: 'Arbitrum Rollup Contract Analysis & Gas Optimizations',
    platform: 'Gitcoin Passport / Grant Round',
    submissionDate: '2026-09-22',
    expectedReward: '500',
    currency: 'USDC',
    destinationWalletAddress: '0x71C...3a9',
    status: 'UNDER_REVIEW',
    evidenceUrl: 'https://gitcoin.co/grants/gxeon-arbitrum',
    notes: 'Under review by platform judges.',
    createdAt: '2026-09-22T09:00:00Z',
    updatedAt: '2026-09-22T09:00:00Z',
  },
];

export class BountyService {
  private bounties: BountyItem[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(BOUNTY_STORAGE_KEY);
      if (stored) {
        this.bounties = JSON.parse(stored);
      } else {
        this.bounties = [...INITIAL_BOUNTIES];
        this.saveToStorage();
      }
    } catch {
      this.bounties = [...INITIAL_BOUNTIES];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(BOUNTY_STORAGE_KEY, JSON.stringify(this.bounties));
    } catch (e) {
      console.error('Failed to persist bounties:', e);
    }
  }

  getBounties(): BountyItem[] {
    return [...this.bounties];
  }

  addBounty(bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>): BountyItem {
    const newBounty: BountyItem = {
      ...bounty,
      id: `bounty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.bounties.push(newBounty);
    this.saveToStorage();

    auditService.recordEvent(
      'bounty_registered',
      `Registered bounty "${newBounty.title}" with reward ${newBounty.expectedReward} ${newBounty.currency} (${newBounty.status})`
    );

    return newBounty;
  }

  updateBountyStatus(id: string, status: BountyStatus, txHash?: string): boolean {
    let updated = false;
    this.bounties = this.bounties.map((b) => {
      if (b.id === id) {
        updated = true;
        return {
          ...b,
          status,
          transactionHash: txHash || b.transactionHash,
          updatedAt: new Date().toISOString(),
        };
      }
      return b;
    });

    if (updated) {
      this.saveToStorage();
      auditService.recordEvent('bounty_status_updated', `Bounty ${id} status updated to ${status}`);
    }
    return updated;
  }

  getStats() {
    let confirmedPaidTotal = 0;
    let pendingPipelineTotal = 0;
    let submittedCount = 0;
    let paidCount = 0;

    for (const b of this.bounties) {
      const reward = parseFloat(b.expectedReward) || 0;
      if (b.status === 'PAID') {
        confirmedPaidTotal += reward;
        paidCount++;
      } else if (
        b.status === 'SUBMITTED' ||
        b.status === 'UNDER_REVIEW' ||
        b.status === 'ACCEPTED' ||
        b.status === 'PAYOUT_PENDING'
      ) {
        pendingPipelineTotal += reward;
        submittedCount++;
      }
    }

    return {
      confirmedPaidTotal,
      pendingPipelineTotal,
      submittedCount,
      paidCount,
      totalCount: this.bounties.length,
    };
  }
}

export const bountyService = new BountyService();
