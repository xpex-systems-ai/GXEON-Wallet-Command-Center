import { WalletAdapter, WalletCapability, AdapterStatus } from '../types';

export class SolanaAdapter implements WalletAdapter {
  id = 'solana';
  name = 'Solana Adapter';
  network = 'solana';
  // Explicitly declared as COMING_SOON as specified in specifications
  status: AdapterStatus = 'COMING_SOON';
  capabilities: WalletCapability[] = ['WATCH_ONLY'];

  hasCapability(cap: WalletCapability): boolean {
    return this.capabilities.includes(cap);
  }

  formatAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
}

export const solanaAdapter = new SolanaAdapter();
