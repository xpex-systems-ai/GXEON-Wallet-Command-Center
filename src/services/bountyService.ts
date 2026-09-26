import { BountyItem, BountyStatus, PayoutVerification, MultiAssetEarningsStats } from '../types';
import { auditService } from './auditService';
import { payoutVerifier } from './payoutVerifier';
import {
  fetchBountiesFromFirestore,
  saveBountyToFirestore,
  updateBountyInFirestore,
  deleteBountyFromFirestore,
} from './firestore/bountyRepository';

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
  verification?: PayoutVerification,
  bounty?: BountyItem
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

  // Strict check: transition to PAID requires authentic confirmed on-chain verification
  if (target === 'PAID') {
    if (!verification) {
      return {
        allowed: false,
        reason: 'Transition to PAID requires a valid PayoutVerification proof.',
      };
    }
    if (!payoutVerifier.isValidVerifiedReceipt(verification, bounty)) {
      return {
        allowed: false,
        reason:
          'Transition to PAID requires an authentic, verified PayoutVerification issued by PayoutVerifier.verifyPayout(). Forged, legacy, or unverified proofs are strictly rejected.',
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

  async loadFromCloud(ownerUid: string): Promise<BountyItem[]> {
    try {
      const cloudItems = await fetchBountiesFromFirestore(ownerUid);
      this.bounties = cloudItems;
      this.saveToStorage();
      return [...this.bounties];
    } catch (err) {
      console.warn('Failed to load bounties from Firestore:', err);
      return this.getBounties();
    }
  }

  getBounties(): BountyItem[] {
    return [...this.bounties];
  }

  async addBounty(
    bounty: Omit<BountyItem, 'id' | 'createdAt' | 'updatedAt'>,
    ownerUid?: string
  ): Promise<BountyItem> {
    // Initial status can never be initialized directly to PAID without verification
    const safeStatus: BountyStatus = bounty.status === 'PAID' ? 'SUBMITTED' : bounty.status;

    const customId = `bounty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newBounty: BountyItem = {
      ...bounty,
      ownerUid,
      status: safeStatus,
      id: customId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (ownerUid) {
      try {
        await saveBountyToFirestore(
          { ...bounty, status: safeStatus, ownerUid },
          ownerUid,
          customId
        );
      } catch (err) {
        console.warn('Failed to save bounty to Firestore:', err);
      }
    }

    this.bounties.push(newBounty);
    this.saveToStorage();

    auditService.recordEvent(
      'bounty_registered',
      `Registered bounty "${newBounty.title}" with reward ${newBounty.expectedReward} ${newBounty.currency} (${newBounty.status})`,
      'info',
      ownerUid
    );

    return newBounty;
  }

  async updateBountyStatus(
    id: string,
    newStatus: BountyStatus,
    verification?: PayoutVerification,
    ownerUid?: string
  ): Promise<{ success: boolean; error?: string }> {
    const bounty = this.bounties.find((b) => b.id === id);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }

    const check = canTransitionBountyStatus(bounty.status, newStatus, verification, bounty);
    if (!check.allowed) {
      auditService.recordEvent(
        'bounty_status_rejected',
        `Blocked invalid status change for bounty ${id}: ${check.reason}`,
        'warning',
        ownerUid
      );
      return { success: false, error: check.reason };
    }

    if (ownerUid) {
      try {
        await updateBountyInFirestore(
          id,
          {
            status: newStatus,
            payoutVerification: verification || bounty.payoutVerification,
          },
          ownerUid
        );
      } catch (err) {
        console.warn('Failed to update bounty in Firestore:', err);
      }
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
      `Bounty ${id} transitioned from ${bounty.status} to ${newStatus}`,
      'info',
      ownerUid
    );

    return { success: true };
  }

  async deleteBounty(id: string, ownerUid?: string): Promise<boolean> {
    if (ownerUid) {
      try {
        await deleteBountyFromFirestore(id, ownerUid);
      } catch (err) {
        console.warn('Failed to delete bounty from Firestore:', err);
      }
    }
    const prevLen = this.bounties.length;
    this.bounties = this.bounties.filter((b) => b.id !== id);
    if (this.bounties.length < prevLen) {
      this.saveToStorage();
      auditService.recordEvent('bounty_deleted', `Deleted bounty ID ${id}`, 'info', ownerUid);
      return true;
    }
    return false;
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
