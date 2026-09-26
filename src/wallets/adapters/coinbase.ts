import {
  WalletAdapter,
  WalletCapability,
  AdapterStatus,
  AdapterCapabilityDescriptor,
  ConnectResult,
} from '../types';

export class CoinbaseAdapter implements WalletAdapter {
  id = 'coinbase-wallet';
  name = 'Coinbase Wallet Adapter';
  network = 'evm';
  // Truthful status: Injected provider detection available; dedicated SDK initialization pending
  status: AdapterStatus = 'PARTIAL';

  capabilities: WalletCapability[] = ['CONNECT', 'WATCH_ONLY'];

  capabilityDetails: AdapterCapabilityDescriptor[] = [
    {
      capability: 'WATCH_ONLY',
      status: 'AVAILABLE',
      notes: 'Watch-only monitoring of Coinbase Wallet addresses.',
    },
    {
      capability: 'CONNECT',
      status: 'AVAILABLE',
      notes: 'Requires Coinbase Wallet browser extension.',
    },
    {
      capability: 'READ_BALANCE',
      status: 'UNAVAILABLE',
      notes: 'Direct node queries not configured for standalone Coinbase connector.',
    },
    {
      capability: 'READ_TRANSACTIONS',
      status: 'UNAVAILABLE',
      notes: 'Historical explorer not configured.',
    },
  ];

  hasCapability(cap: WalletCapability): boolean {
    return this.capabilities.includes(cap);
  }

  isCapabilityAvailable(cap: WalletCapability): boolean {
    const detail = this.capabilityDetails.find((d) => d.capability === cap);
    return detail ? detail.status === 'AVAILABLE' : false;
  }

  formatAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Note on Architecture:
   * Connects strictly to self-custodial Coinbase Wallet extension,
   * NOT the custodial Coinbase exchange backend.
   */
  async connect(): Promise<ConnectResult> {
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { coinbaseWalletExtension?: unknown }).coinbaseWalletExtension
    ) {
      return {
        success: false,
        error: 'Coinbase Wallet extension detected. Connection handshake ready for pairing.',
      };
    }
    return {
      success: false,
      error: 'Coinbase Wallet extension not detected in this browser.',
    };
  }
}

export const coinbaseAdapter = new CoinbaseAdapter();
