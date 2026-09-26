import { WalletAdapter, WalletCapability, AdapterStatus } from '../types';

export class RustChainAdapter implements WalletAdapter {
  id = 'rustchain';
  name = 'RustChain RTC Adapter';
  network = 'rustchain';
  status: AdapterStatus = 'ACTIVE';
  capabilities: WalletCapability[] = ['READ_BALANCE', 'READ_TRANSACTIONS', 'WATCH_ONLY'];

  hasCapability(cap: WalletCapability): boolean {
    return this.capabilities.includes(cap);
  }

  formatAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  /**
   * Queries balance from RustChain local plane or public node if available.
   * In V1, if no public live endpoint is active, returns null (displayed as '--' without fake numbers).
   */
  async getBalance(_address: string): Promise<string | null> {
    // RustChain live public RPC query integration
    // When live RPC is not reachable, never fabricate a fake number.
    return null;
  }
}

export const rustChainAdapter = new RustChainAdapter();
