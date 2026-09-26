export type ConnectionType = 'LOCAL_CONFIG' | 'BROWSER_PROVIDER' | 'WATCH_ONLY' | 'HARDWARE' | 'OFFLINE';

export type OwnershipStatus = 'VERIFIED' | 'UNVERIFIED';

export type WalletMode = 'watch_only' | 'local_signing' | 'connected_provider';

export interface WalletItem {
  id: string;
  name: string;
  network: string;
  chainId?: number | string;
  symbol: string;
  publicAddress: string;
  connectionType: ConnectionType;
  ownershipStatus: OwnershipStatus;
  mode: WalletMode;
  balance?: string | null; // e.g. null or "--" when unavailable, never fabricated
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

export interface BountyItem {
  id: string;
  title: string;
  platform: string;
  submissionDate?: string;
  expectedReward: string;
  currency: string;
  destinationWalletAddress: string;
  destinationWalletId?: string;
  status: BountyStatus;
  evidenceUrl?: string;
  transactionHash?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = 'DETECTED' | 'PENDING' | 'CONFIRMED' | 'FAILED';
export type TransactionType = 'INCOMING_PAYOUT' | 'BOUNTY_REWARD' | 'TRANSFER' | 'CONTRACT_CALL' | 'WATCH_EVENT';

export interface TransactionItem {
  id: string;
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
