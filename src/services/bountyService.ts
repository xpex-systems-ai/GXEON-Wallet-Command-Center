import { BountyItem, BountyStatus, PayoutVerification, MultiAssetEarningsStats } from '../types';
import { auditService } from './auditService';

const BOUNTY_STORAGE_KEY = 'gxeon_bounties_v1';

/**
 * Valid state transitions for the GXEON Bounty & Earnings State Machine.
 * Transition to PAID strictly requires a confirmed PayoutVerification.
 */
export const ALLOWED_TRANSITIONS: Record<BountyStatus, BountyStatus[]> = {
  DISCOVERED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['SUBMITTED', 'DISCOVERED', 'REJECTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ACCEPTED', 'SUBMITTED', 'REJECTED'],
  ACCEPTED: ['PAYOUT_PENDING', 'REJECTED'],
  PAYOUT_PENDING: ['PAID', 'REJECTED'],
  PAID: [], // Terminal state
  REJECTED: ['DISCOVERED'],
};

export function canTransitionBountyStatus(
  current: BountyStatus,
  target: BountyStatus,
  verification?: PayoutVerification
): { allowed: boolean; reason?: string } {
  if (current === target) {
    return { allowed: true };
  }

  const allowedNext = ALLOWED_TRANSITIONS[current] || [];
  if (!allowedNext.includes(target)) {
    return {
      allowed: false,
      reason: `Invalid transition from ${current} to ${target}. Valid next states: [${allowedNext.join(', ')}]`,
    };
  }

  // Strict check: transition to PAID requires confirmed on-chain verification
  if (target === 'PAID') {
    if (!verification) {
      return {
        allowed: false,
        reason: 'Transition to PAID requires a valid PayoutVerification proof.',
      };
    }
    if (verification.verificationStatus !== 'CONFIRMED') {
      return {
        allowed: false,
        reason: `Transition to PAID requires verificationStatus=CONFIRMED, received ${verification.verificationStatus}.`,
      };
    }
    if (!verification.txHash || verification.txHash.trim() === '') {
      return {
        allowed: false,
        reason: 'Transition to PAID requires a confirmed transaction hash.',
      };
    }
  }

  return { allowed: true };
}

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
        // Strict invariant: initial state MUST be empty. Zero synthetic records.
        this.bounties = [];
        this.saveToStorage();
      }
    } catch {
      this.bounties = [];
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
    // Initial status can never be initialized directly to PAID without verification
    const safeStatus: BountyStatus = bounty.status === 'PAID' ? 'SUBMITTED' : bounty.status;

    const newBounty: BountyItem = {
      ...bounty,
      status: safeStatus,
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

  updateBountyStatus(
    id: string,
    newStatus: BountyStatus,
    verification?: PayoutVerification
  ): { success: boolean; error?: string } {
    const bounty = this.bounties.find((b) => b.id === id);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }

    const check = canTransitionBountyStatus(bounty.status, newStatus, verification);
    if (!check.allowed) {
      auditService.recordEvent(
        'bounty_status_rejected',
        `Blocked invalid status change for bounty ${id}: ${check.reason}`,
        'warning'
      );
      return { success: false, error: check.reason };
    }

    this.bounties = this.bounties.map((b) => {
      if (b.id === id) {
        return {
          ...b,
          status: newStatus,
          payoutVerification: verification || b.payoutVerification,
          updatedAt: new Date().toISOString(),
        };
      }
      return b;
    });

    this.saveToStorage();
    auditService.recordEvent(
      'bounty_status_changed',
      `Bounty ${id} transitioned from ${bounty.status} to ${newStatus}`
    );

    return { success: true };
  }

  /**
   * Multi-Asset Statistics:
   * Strictly isolates assets (RTC, USDC, ETH, SOL) without summing them together.
   * Fiat value is explicitly null (UNAVAILABLE) because price oracle is not connected in V1.
   */
  getStats(): MultiAssetEarningsStats {
    const pendingByAsset: Record<string, number> = {};
    const confirmedByAsset: Record<string, number> = {};
    let submittedCount = 0;
    let paidCount = 0;

    for (const b of this.bounties) {
      const reward = parseFloat(b.expectedReward) || 0;
      const currency = b.currency.toUpperCase();

      if (b.status === 'PAID') {
        confirmedByAsset[currency] = (confirmedByAsset[currency] || 0) + reward;
        paidCount++;
      } else if (
        b.status === 'SUBMITTED' ||
        b.status === 'UNDER_REVIEW' ||
        b.status === 'ACCEPTED' ||
        b.status === 'PAYOUT_PENDING'
      ) {
        pendingByAsset[currency] = (pendingByAsset[currency] || 0) + reward;
        submittedCount++;
      }
    }

    return {
      pendingByAsset,
      confirmedByAsset,
      submittedCount,
      paidCount,
      totalCount: this.bounties.length,
      fiatValue: null,
    };
  }
}

export const bountyService = new BountyService();
