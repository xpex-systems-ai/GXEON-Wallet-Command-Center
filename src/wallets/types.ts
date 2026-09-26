export type WalletCapability =
  | 'READ_BALANCE'
  | 'READ_TRANSACTIONS'
  | 'CONNECT'
  | 'SIGN'
  | 'SEND'
  | 'WATCH_ONLY';

export type AdapterStatus =
  | 'ACTIVE'
  | 'PARTIAL'
  | 'READY_FOR_PROVIDER'
  | 'COMING_SOON'
  | 'UNAVAILABLE';

export type CapabilityAvailability =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'COMING_SOON'
  | 'DISABLED_IN_V1';

export interface AdapterCapabilityDescriptor {
  capability: WalletCapability;
  status: CapabilityAvailability;
  notes?: string;
}

export interface WalletAdapterInfo {
  id: string;
  name: string;
  network: string;
  version: string;
  status: AdapterStatus;
  capabilities: WalletCapability[];
  capabilityDetails?: AdapterCapabilityDescriptor[];
  supportedChains?: string[];
  description: string;
  sourceStatus?: string;
  iconName?: string;
}

export interface ConnectResult {
  success: boolean;
  publicAddress?: string;
  chainId?: number | string;
  error?: string;
}

export interface WalletAdapter {
  id: string;
  name: string;
  network: string;
  status: AdapterStatus;
  capabilities: WalletCapability[];
  capabilityDetails: AdapterCapabilityDescriptor[];
  hasCapability(cap: WalletCapability): boolean;
  isCapabilityAvailable(cap: WalletCapability): boolean;
  connect?(): Promise<ConnectResult>;
  disconnect?(): Promise<void>;
  getBalance?(address: string): Promise<string | null>;
  formatAddress(address: string): string;
}
