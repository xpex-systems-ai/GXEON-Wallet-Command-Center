/**
 * GXEON Native x402 Protocol Specification & Domain Types
 * Strict compliance with x402 v2 standard for machine-to-machine micropayments.
 */

export interface X402AcceptOption {
  scheme: 'exact';
  network: string; // e.g. "eip155:8453" (Base Mainnet)
  asset: string; // Token contract address (USDC)
  amount: string; // Atomic units (6 decimals for USDC, e.g. "10000" = 0.01 USDC)
  payTo: string; // GXEON Recipient Address
  maxTimeoutSeconds: number;
  resource: string;
  extra?: {
    name: string;
    version?: string;
  };
}

export interface X402Challenge {
  x402Version: 2;
  status: 402;
  title: string;
  description: string;
  resource: string;
  serviceId: string;
  accepts: X402AcceptOption[];
}

export interface X402PaymentProof {
  network: string; // e.g. "eip155:8453"
  txHash: string; // 0x... transaction hash on Base
  payerAddress?: string;
  amount?: string;
  asset?: string;
}

export interface X402SettlementVerification {
  verified: boolean;
  settlementId: string;
  network: string;
  txHash: string;
  payer: string;
  recipient: string;
  amountAtomic: string;
  amountUsdc: number;
  asset: string;
  blockNumber?: number;
  confirmations?: number;
  timestamp: string;
  error?: string;
}

export type X402SettlementState =
  | 'DETECTED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'CLAIMED'
  | 'EXECUTING'
  | 'DELIVERED'
  | 'FAILED'
  | 'REFUNDED';

export interface X402SettlementRecord {
  txHash: string;
  settlementId: string;
  network: string;
  payer: string;
  recipient: string;
  asset: string;
  amountAtomic: string;
  amountUsdc: number;
  serviceId: string;
  quantity: number;
  state: X402SettlementState;
  claimedAt: string;
  blockNumber?: number;
  jobId?: string;
  updatedAt?: string;
}

export interface X402Receipt {
  receiptId: string;
  seller: 'GXEON';
  buyer: string;
  serviceId: string;
  quantity: number;
  paymentRail: 'x402';
  currency: 'USDC';
  amountAtomic: string;
  amountUsdc: string; // Formatted USDC e.g. "0.010000"
  network: string;
  settlementId: string;
  txHash: string;
  blockNumber: string | number;
  jobId: string;
  resultHash: string;
  evidenceHash: string;
  createdAt: string;
}

export interface MachineRevenueRecord {
  revenueId: string;
  rail: 'x402';
  asset: 'USDC';
  network: string;
  txHash: string;
  serviceId: string;
  buyer: string;
  amountAtomic: string;
  amountUsdc: number;
  status: 'SETTLED';
  verifiedAt: string;
  jobId?: string;
  receiptId?: string;
}

export interface MachineCustomerRecord {
  machineCustomerId: string;
  payerAddress: string;
  firstPurchaseAt: string;
  lastPurchaseAt: string;
  jobsPurchased: number;
  totalUsdcPaid: number;
  servicesUsed: string[];
}

export type TreasuryStatus = 'TREASURY_VERIFIED' | 'TREASURY_UNVERIFIED';
