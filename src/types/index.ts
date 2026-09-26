export type ConnectionType = 'LOCAL_CONFIG' | 'BROWSER_PROVIDER' | 'WATCH_ONLY' | 'HARDWARE' | 'OFFLINE';

export type OwnershipStatus = 'VERIFIED' | 'UNVERIFIED';

export type WalletMode = 'watch_only' | 'local_signing' | 'connected_provider';

export interface WalletItem {
  id: string;
  ownerUid?: string;
  name: string;
  network: string;
  chainId?: number | string;
  symbol: string;
  publicAddress: string;
  connectionType: ConnectionType;
  ownershipStatus: OwnershipStatus;
  mode: WalletMode;
  balance?: string | null; // null or '--' when unavailable, never fabricated
  isOnline?: boolean;
  purpose?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type BountyStatus =
  | 'DISCOVERED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'REJECTED';

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface PayoutVerification {
  network: string;
  asset: string;
  destinationWallet: string;
  txHash: string;
  blockHeight?: number | string;
  confirmationReference?: string;
  verifiedAt: string;
  verificationSource: string;
  verificationStatus: VerificationStatus;
}

export interface BountyItem {
  id: string;
  ownerUid?: string;
  title: string;
  platform: string;
  submissionDate?: string;
  expectedReward: string;
  currency: string;
  destinationWalletAddress: string;
  destinationWalletId?: string;
  status: BountyStatus;
  evidenceUrl?: string;
  payoutVerification?: PayoutVerification;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = 'DETECTED' | 'PENDING' | 'CONFIRMED' | 'FAILED';
export type TransactionType = 'INCOMING_PAYOUT' | 'BOUNTY_REWARD' | 'TRANSFER' | 'CONTRACT_CALL' | 'WATCH_EVENT';

export interface TransactionItem {
  id: string;
  ownerUid?: string;
  date: string;
  network: string;
  walletId: string;
  walletAddress: string;
  type: TransactionType;
  asset: string;
  amount: string;
  status: TransactionStatus;
  txHash: string;
  explorerUrl?: string;
  bountyId?: string;
  notes?: string;
}

export interface AuditEvent {
  id: string;
  ownerUid?: string;
  timestamp: string;
  event: string;
  detail: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  actor?: string;
}

export interface BridgeHealthResponse {
  ok: boolean;
  service: string;
  bind: string;
  port: number;
  security_mode: string;
  version: string;
  timestamp: string;
}

export interface BridgeStatusResponse {
  status: string;
  security_invariants: {
    no_private_keys: boolean;
    bind_host: string;
    signing_plane: string;
    send_enabled: boolean;
  };
  registered_wallets_count: number;
  active_adapters: number;
  uptime: string;
}

export interface MultiAssetEarningsStats {
  pendingByAsset: Record<string, number>;
  confirmedByAsset: Record<string, number>;
  submittedCount: number;
  paidCount: number;
  totalCount: number;
  fiatValue: null; // Explicitly null / UNAVAILABLE in V1 (no unverified currency mixing)
}

/**
 * ============================================================
 * GXEON QUANTUM MODE FOUNDATION — EVENT TAXONOMY ARCHITECTURE
 * ============================================================
 * Standardized typed event contracts for event-driven, multi-agent mesh,
 * proof of antiquity, mining attestations, and verifiable treasury ops.
 * (Architecture only — zero simulated/synthetic records)
 */

export type QuantumEventType =
  | 'WALLET_CONNECTED'
  | 'BALANCE_SYNC_REQUESTED'
  | 'BALANCE_SYNC_CONFIRMED'
  | 'BOUNTY_SUBMITTED'
  | 'BOUNTY_ACCEPTED'
  | 'PAYOUT_DETECTED'
  | 'PAYOUT_CONFIRMED'
  | 'MINER_ATTESTED'
  | 'EPOCH_REWARD_DETECTED';

export interface QuantumEventPayload {
  eventType: QuantumEventType;
  version: '1.0';
  timestamp: string;
  source: 'control_plane' | 'signing_bridge' | 'mining_mesh' | 'payout_agent';
  correlationId: string;
  data: Record<string, unknown>;
  attestation?: {
    scheme: string;
    signature?: string;
    publicKey?: string;
    epoch?: number;
  };
}
