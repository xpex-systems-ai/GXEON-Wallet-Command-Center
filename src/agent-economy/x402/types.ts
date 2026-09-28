/**
 * GXEON Native x402 Protocol Specification & Domain Types
 * Strict compliance with x402 v2 standard for machine-to-machine micropayments.
 */

export interface X402AcceptOption {
  scheme: 'exact';
  network: string; // e.g. "eip155:8453" (Base) or "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
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
  txHash: string; // 0x... transaction hash on Base or tx signature on Solana
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

export interface X402Receipt {
  receiptId: string;
  seller: 'GXEON';
  buyer: string;
  serviceId: string;
  quantity: number;
  paymentRail: 'x402';
  currency: 'USDC';
  amount: string; // Formatted USDC e.g. "0.010000"
  amountAtomic: string;
  network: string;
  settlementId: string;
  jobId: string;
  evidenceHash: string;
  timestamp: string;
}
