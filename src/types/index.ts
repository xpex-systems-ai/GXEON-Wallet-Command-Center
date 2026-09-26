export type ConnectionType =
  | 'LOCAL_CONFIG'
  | 'BROWSER_PROVIDER'
  | 'WATCH_ONLY'
  | 'HARDWARE'
  | 'OFFLINE'
  | 'CLI_DETECTED'
  | 'CLAWRTC_MINING';

export type OwnershipStatus = 'VERIFIED' | 'UNVERIFIED';

export type WalletMode = 'watch_only' | 'local_signing' | 'connected_provider';

export type BalanceStatus = 'NOT_SYNCED' | 'QUERYING' | 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR';

export interface WalletItem {
  id: string;
  ownerUid?: string;
  name: string;
  network: string;
  chainId?: number | string;
  symbol: string;
  publicAddress: string;
  minerId?: string;
  connectionType: ConnectionType;
  ownershipStatus: OwnershipStatus;
  mode: WalletMode;
  balance?: string | null; // null or '--' when unavailable, never fabricated
  balanceStatus?: BalanceStatus;
  source?: string;
  lastSync?: string;
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

export type VerificationStatus = 'UNVERIFIED' | 'FORMAT_VALID' | 'QUERYING' | 'PENDING' | 'CONFIRMED' | 'FAILED';

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
  issueId?: string;
  submissionUrl?: string;
  submissionDate?: string;
  expectedReward: string;
  currency: string;
  asset?: string;
  destinationWalletAddress: string;
  destinationWalletId?: string;
  pendingId?: string;
  txHash?: string;
  status: BountyStatus;
  evidenceUrl?: string;
  payoutVerification?: PayoutVerification;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = 'DETECTED' | 'PENDING' | 'CONFIRMED' | 'FAILED';
export type TransactionType = 'INCOMING_PAYOUT' | 'BOUNTY_REWARD' | 'MINING_REWARD' | 'TRANSFER' | 'CONTRACT_CALL' | 'WATCH_EVENT';

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
  minerId?: string;
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
  mining_status?: string;
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
 * GXEON QUANTUM V1.2 — PAIRING & TOOL DETECTION TYPES
 * ============================================================
 */

export interface BridgePairStartResponse {
  ok: boolean;
  pairing_code: string;
  expires_in: number;
  message: string;
}

export interface BridgePairConfirmRequest {
  code: string;
}

export interface BridgePairConfirmResponse {
  ok: boolean;
  token: string;
  expires_in: number;
  session_id: string;
}

export interface BridgePairStatusResponse {
  paired: boolean;
  companion_version: string;
  security_mode: string;
}

export interface DetectedTool {
  tool: string;
  installed: boolean;
  version?: string;
  path_sanitized?: string;
  capabilities: string[];
  public_address_discovery?: string;
  miner_id_discovery?: string;
}

export interface DetectedWallet {
  id: string;
  name: string;
  network: string;
  symbol: string;
  publicAddress: string;
  connectionType: ConnectionType;
  mode: WalletMode;
  ownershipStatus: OwnershipStatus;
  purpose?: string;
}

export interface BridgeDetectionResult {
  tools: DetectedTool[];
  detected_wallets: DetectedWallet[];
  registered_wallets?: DetectedWallet[];
}

/**
 * ============================================================
 * GXEON QUANTUM V1.2 — CLAWRTC & PROOF OF ANTIQUITY TYPES
 * ============================================================
 */

export type MiningStatus = 'NOT_INSTALLED' | 'INSTALLED' | 'CONFIGURED' | 'MINING' | 'STOPPED' | 'ERROR';
export type AttestationState = 'UNATTESTED' | 'PENDING' | 'ATTESTED' | 'EXPIRED' | 'FAILED';

export interface HardwareMetadata {
  cpu_arch: string;
  processor: string;
  os: string;
  compatibility: string;
}

export interface ProofOfAntiquityState {
  status: MiningStatus;
  clawrtc_installed: boolean;
  clawrtc_version?: string | null;
  miner_id?: string | null;
  reward_destination?: string | null;
  config_source?: string;
  hardware: HardwareMetadata;
  attestation_state: AttestationState;
  attestation_id?: string | null;
  last_attestation_timestamp?: string | null;
  current_epoch?: number | null;
  antiquity_multiplier?: number | null; // null / unavailable if no real proof
  confirmed_rtc?: number | null;
  pending_rewards?: number | null;
  estimated_rewards?: number | null;
  pid?: number | null;
  process_alive?: boolean;
  exit_code?: number | null;
  supported_commands?: string[];
  source: string;
  queried_at: string;
}

/**
 * ============================================================
 * RUSTCHAIN (RTC) HISTORY & DATA TYPES
 * ============================================================
 */

export interface RewardHistoryItem {
  id: string;
  epoch: number;
  amount: string;
  timestamp: string;
  attestationId?: string;
  minerId: string;
  destinationWallet: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  source: string;
}

export interface WalletTransactionItem {
  id: string;
  txHash: string;
  network: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  symbol: string;
  timestamp: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  blockNumber?: number;
  source: string;
}

export interface PayoutItem {
  id: string;
  type: 'BOUNTY' | 'MINING_REWARD' | 'COMMUNITY_GRANT';
  bountyId?: string;
  rewardId?: string;
  destinationWallet: string;
  asset: string;
  amount: string;
  txHash?: string;
  status: VerificationStatus;
  verifiedAt?: string;
  source: string;
}

export interface PendingRewardItem {
  id: string;
  epoch: number;
  estimatedAmount: string;
  minerId: string;
  status: 'PENDING_ATTESTATION' | 'CALCULATING' | 'READY_FOR_DISTRIBUTION';
  source: string;
}

export interface RustChainBalanceResponse {
  wallet_id: string;
  network: string;
  symbol: string;
  address: string;
  balance: string | null;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  source: string;
  queried_at: string;
  ownership_verified: boolean;
  mode: string;
  note?: string;
}

export interface RustChainTransactionsResponse {
  wallet_id: string;
  network: string;
  symbol: string;
  address: string;
  transactions: TransactionItem[];
  status: 'AVAILABLE' | 'UNAVAILABLE';
  source: string;
  queried_at: string;
  note?: string;
}

/**
 * ============================================================
 * GXEON QUANTUM EVENT BUS TYPES
 * ============================================================
 */

export type QuantumEventType =
  | 'COMPANION_ONLINE'
  | 'COMPANION_PAIRED'
  | 'COMPANION_OFFLINE'
  | 'CLAWRTC_DETECTED'
  | 'CLAWRTC_CONFIGURED'
  | 'MINER_LOCAL_METADATA_CONFIGURED'
  | 'MINER_REGISTERED'
  | 'MINER_STARTED'
  | 'MINER_STOPPED'
  | 'ATTESTATION_DETECTED'
  | 'ATTESTATION_CONFIRMED'
  | 'EPOCH_CHANGED'
  | 'EPOCH_REWARD_DETECTED'
  | 'EPOCH_REWARD_CONFIRMED'
  | 'RTC_BALANCE_UPDATED'
  | 'RTC_TRANSACTION_DETECTED'
  | 'WALLET_CONNECTED'
  | 'WALLET_IMPORTED'
  | 'BOUNTY_SUBMITTED'
  | 'BOUNTY_ACCEPTED'
  | 'PAYOUT_DETECTED'
  | 'PAYOUT_CONFIRMED'
  | 'SECURITY_ALERT'
  | 'SECURITY_INVARIANT_VIOLATION'
  | 'BALANCE_SYNC_REQUESTED'
  | 'BALANCE_SYNC_CONFIRMED'
  | 'MINER_ATTESTED';

export interface QuantumEventPayload {
  eventType: QuantumEventType;
  version: string;
  timestamp: string;
  source: string;
  correlationId?: string;
  subjectId?: string;
  data: Record<string, unknown>;
  attestation?: {
    scheme: string;
    epoch: number;
    proof?: string;
  };
}

export interface QuantumEvent {
  id: string;
  ownerUid?: string;
  type: QuantumEventType;
  timestamp: string;
  source: string;
  status: 'DETECTED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'INFO';
  subjectId?: string;
  metadataSafe: Record<string, unknown>;
}

/**
 * ============================================================
 * GXEON QUANTUM AGENT MESH INTERFACES (Read-Only Observers)
 * ============================================================
 */

export interface MiningAgentState {
  isObserving: boolean;
  lastCheck: string;
  minerStatus: MiningStatus;
  activeAttestation: boolean;
  recommendations: string[];
}

export interface PayoutAgentState {
  isObserving: boolean;
  lastCheck: string;
  verifiedPayoutsCount: number;
  pendingPayoutsCount: number;
  alerts: string[];
}

export interface SecurityAgentState {
  isObserving: boolean;
  lastCheck: string;
  pairingHealth: boolean;
  invariantStatus: 'STABLE' | 'DEGRADED' | 'ALERT';
  securityViolationsCount: number;
}
