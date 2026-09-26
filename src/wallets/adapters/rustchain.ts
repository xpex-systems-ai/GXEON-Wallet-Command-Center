import {
  WalletAdapter,
  WalletCapability,
  AdapterStatus,
  AdapterCapabilityDescriptor,
} from '../types';

export class RustChainAdapter implements WalletAdapter {
  id = 'rustchain';
  name = 'RustChain RTC Adapter';
  network = 'rustchain';
  // Truthful status: Operates in Watch-Only monitoring mode; awaiting official RPC node configuration
  status: AdapterStatus = 'PARTIAL';

  capabilities: WalletCapability[] = ['WATCH_ONLY', 'READ_BALANCE', 'READ_TRANSACTIONS'];

  capabilityDetails: AdapterCapabilityDescriptor[] = [
    {
      capability: 'WATCH_ONLY',
      status: 'AVAILABLE',
      notes: 'Watch-only address tracking active for bounty submissions.',
    },
    {
      capability: 'READ_BALANCE',
      status: 'UNAVAILABLE',
      notes: 'Source RPC endpoint not configured. Real-time balance lookup awaiting verified node.',
    },
    {
      capability: 'READ_TRANSACTIONS',
      status: 'UNAVAILABLE',
      notes: 'Historical explorer RPC not configured. History queries unavailable.',
    },
    {
      capability: 'SEND',
      status: 'DISABLED_IN_V1',
      notes: 'Funds movement disabled by GXEON security invariant.',
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
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  /**
   * Queries balance from RustChain node if available.
   * TRUTH IN DATA INVARIANT:
   * Since no verified live RPC endpoint is currently active, returns null.
   * Zero fake balances or zero mock numbers are ever returned.
   */
  async getBalance(_address: string): Promise<string | null> {
    return null;
  }
}

export const rustChainAdapter = new RustChainAdapter();
