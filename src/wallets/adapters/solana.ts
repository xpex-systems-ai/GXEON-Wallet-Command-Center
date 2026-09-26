import {
  WalletAdapter,
  WalletCapability,
  AdapterStatus,
  AdapterCapabilityDescriptor,
} from '../types';

export class SolanaAdapter implements WalletAdapter {
  id = 'solana';
  name = 'Solana Adapter';
  network = 'solana';
  // Explicitly declared as COMING_SOON without simulated connection
  status: AdapterStatus = 'COMING_SOON';

  capabilities: WalletCapability[] = ['WATCH_ONLY'];

  capabilityDetails: AdapterCapabilityDescriptor[] = [
    {
      capability: 'WATCH_ONLY',
      status: 'COMING_SOON',
      notes: 'Solana non-custodial monitor under specification.',
    },
    {
      capability: 'CONNECT',
      status: 'COMING_SOON',
      notes: 'Solana wallet adapter integration scheduled for future release.',
    },
  ];

  hasCapability(cap: WalletCapability): boolean {
    return this.capabilities.includes(cap);
  }

  isCapabilityAvailable(_cap: WalletCapability): boolean {
    return false;
  }

  formatAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
}

export const solanaAdapter = new SolanaAdapter();
