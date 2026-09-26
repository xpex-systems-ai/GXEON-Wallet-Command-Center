import { WalletAdapter, WalletCapability, AdapterStatus, ConnectResult } from '../types';

export class CoinbaseAdapter implements WalletAdapter {
  id = 'coinbase-wallet';
  name = 'Coinbase Wallet Adapter';
  network = 'evm';
  status: AdapterStatus = 'READY';
  capabilities: WalletCapability[] = ['CONNECT', 'READ_BALANCE', 'READ_TRANSACTIONS', 'WATCH_ONLY'];

  hasCapability(cap: WalletCapability): boolean {
    return this.capabilities.includes(cap);
  }

  formatAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Note on Architecture:
   * This adapter connects strictly to Coinbase Wallet (self-custodial wallet provider),
   * NOT the custodial Coinbase exchange backend.
   */
  async connect(): Promise<ConnectResult> {
    if (typeof window !== 'undefined' && (window as unknown as { coinbaseWalletExtension?: unknown }).coinbaseWalletExtension) {
      return {
        success: false,
        error: 'Coinbase Wallet extension detected. Connection handshake ready.',
      };
    }
    return {
      success: false,
      error: 'Coinbase Wallet provider not detected. Please install Coinbase Wallet extension.',
    };
  }
}

export const coinbaseAdapter = new CoinbaseAdapter();
