import crypto from 'node:crypto';
import {
  AgentAccount,
  LedgerEntry,
  GxeonErrorResponse,
} from './types.js';
import { getAgentEconomyStore } from './store.js';

export interface CreditOperationResult {
  success: boolean;
  entry?: LedgerEntry;
  account?: AgentAccount;
  error?: GxeonErrorResponse;
}

function generateEntryId(): string {
  return `led_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export async function creditAccount(
  accountId: string,
  amount: number,
  idempotencyKey?: string
): Promise<CreditOperationResult> {
  if (amount <= 0) {
    return {
      success: false,
      error: {
        error: {
          code: 'INVALID_INPUT',
          message: 'Credit amount must be positive',
        },
      },
    };
  }

  const store = getAgentEconomyStore();
  const account = await store.getAccount(accountId);
  if (!account) {
    return {
      success: false,
      error: {
        error: {
          code: 'INVALID_INPUT',
          message: `Account ${accountId} not found`,
        },
      },
    };
  }

  const balanceBefore = account.creditBalance;
  account.creditBalance += amount;
  account.updatedAt = new Date().toISOString();

  const entry: LedgerEntry = {
    ledgerEntryId: generateEntryId(),
    accountId,
    amountCredits: amount,
    type: 'CREDIT',
    balanceBefore,
    balanceAfter: account.creditBalance,
    timestamp: new Date().toISOString(),
    idempotencyKey,
  };

  await store.commitLedgerTransaction(account, entry);

  return { success: true, entry, account };
}

export async function reserveCredits(
  accountId: string,
  amount: number,
  jobId: string,
  quoteId: string
): Promise<CreditOperationResult> {
  if (amount <= 0) {
    return {
      success: false,
      error: {
        error: {
          code: 'INVALID_INPUT',
          message: 'Reservation amount must be positive',
        },
      },
    };
  }

  const store = getAgentEconomyStore();
  const account = await store.getAccount(accountId);
  if (!account) {
    return {
      success: false,
      error: {
        error: {
          code: 'INVALID_INPUT',
          message: `Account ${accountId} not found`,
        },
      },
    };
  }

  const available = account.creditBalance - account.reservedCredits;
  if (available < amount) {
    return {
      success: false,
      error: {
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `Insufficient available credits. Required: ${amount}, Available: ${available}, Total Balance: ${account.creditBalance}, Reserved: ${account.reservedCredits}`,
        },
      },
    };
  }

  const balanceBefore = account.creditBalance;
  account.reservedCredits += amount;
  account.updatedAt = new Date().toISOString();

  const entry: LedgerEntry = {
    ledgerEntryId: generateEntryId(),
    accountId,
    jobId,
    quoteId,
    amountCredits: amount,
    type: 'RESERVE',
    balanceBefore,
    balanceAfter: account.creditBalance - account.reservedCredits,
    timestamp: new Date().toISOString(),
  };

  await store.commitLedgerTransaction(account, entry);

  return { success: true, entry, account };
}

export async function settleCredits(
  accountId: string,
  amount: number,
  jobId: string,
  quoteId: string
): Promise<CreditOperationResult> {
  const store = getAgentEconomyStore();
  const account = await store.getAccount(accountId);
  if (!account) {
    return {
      success: false,
      error: {
        error: {
          code: 'INVALID_INPUT',
          message: `Account ${accountId} not found`,
        },
      },
    };
  }

  const balanceBefore = account.creditBalance;
  account.creditBalance -= amount;
  account.reservedCredits = Math.max(0, account.reservedCredits - amount);
  account.spentCredits += amount;
  account.updatedAt = new Date().toISOString();

  const entry: LedgerEntry = {
    ledgerEntryId: generateEntryId(),
    accountId,
    jobId,
    quoteId,
    amountCredits: amount,
    type: 'DEBIT',
    balanceBefore,
    balanceAfter: account.creditBalance,
    timestamp: new Date().toISOString(),
  };

  await store.commitLedgerTransaction(account, entry);

  return { success: true, entry, account };
}

export async function releaseCredits(
  accountId: string,
  amount: number,
  jobId: string,
  quoteId: string
): Promise<CreditOperationResult> {
  const store = getAgentEconomyStore();
  const account = await store.getAccount(accountId);
  if (!account) {
    return {
      success: false,
      error: {
        error: {
          code: 'INVALID_INPUT',
          message: `Account ${accountId} not found`,
        },
      },
    };
  }

  const balanceBefore = account.creditBalance;
  account.reservedCredits = Math.max(0, account.reservedCredits - amount);
  account.updatedAt = new Date().toISOString();

  const entry: LedgerEntry = {
    ledgerEntryId: generateEntryId(),
    accountId,
    jobId,
    quoteId,
    amountCredits: amount,
    type: 'RELEASE',
    balanceBefore,
    balanceAfter: account.creditBalance - account.reservedCredits,
    timestamp: new Date().toISOString(),
  };

  await store.commitLedgerTransaction(account, entry);

  return { success: true, entry, account };
}

export async function getAccountBalance(
  accountId: string
): Promise<{
  creditBalance: number;
  reservedCredits: number;
  availableCredits: number;
  spentCredits: number;
  status: string;
} | null> {
  const store = getAgentEconomyStore();
  const account = await store.getAccount(accountId);
  if (!account) return null;

  return {
    creditBalance: account.creditBalance,
    reservedCredits: account.reservedCredits,
    availableCredits: account.creditBalance - account.reservedCredits,
    spentCredits: account.spentCredits,
    status: account.status,
  };
}
