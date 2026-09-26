export type WalletCapability =
  | 'READ_BALANCE'
  | 'READ_TRANSACTIONS'
  | 'CONNECT'
  | 'SIGN'
  | 'SEND'
  | 'WATCH_ONLY';

export type AdapterStatus = 'ACTIVE' | 'READY' | 'COMING_SOON' | 'UNAVAILABLE';

export interface AdapterCapabilityDescriptor {
  capability: WalletCapability;
  supported: boolean;
  notes?: string;
}

export interface WalletAdapterInfo {
  id: string;
  name: string;
  network: string;
  version: string;
  status: AdapterStatus;
  capabilities: WalletCapability[];
  supportedChains?: string[];
  description: string;
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
  hasCapability(cap: WalletCapability): boolean;
  connect?(): Promise<ConnectResult>;
  disconnect?(): Promise<void>;
  getBalance?(address: string): Promise<string | null>;
  formatAddress(address: string): string;
}
