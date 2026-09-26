import { WalletAdapter, WalletCapability, WalletAdapterInfo } from './types';
import { rustChainAdapter } from './adapters/rustchain';
import { evmAdapter } from './adapters/evm';
import { coinbaseAdapter } from './adapters/coinbase';
import { solanaAdapter } from './adapters/solana';

export class WalletRegistry {
  private adapters: Map<string, WalletAdapter> = new Map();

  constructor() {
    this.register(rustChainAdapter);
    this.register(evmAdapter);
    this.register(coinbaseAdapter);
    this.register(solanaAdapter);
  }

  register(adapter: WalletAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string): WalletAdapter | undefined {
    return this.adapters.get(id);
  }

  getAdapterByNetwork(network: string): WalletAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.network.toLowerCase() === network.toLowerCase()) {
        return adapter;
      }
    }
    return undefined;
  }

  getAllAdapters(): WalletAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapterInfos(): WalletAdapterInfo[] {
    return this.getAllAdapters().map((adapter) => {
      let supportedChains: string[] | undefined;
      let description = '';

      switch (adapter.id) {
        case 'rustchain':
          description = 'RustChain RTC native watcher and bounty destination adapter.';
          break;
        case 'evm-metamask':
          description = 'EVM browser provider connector for MetaMask, Rabby, and Web3 extensions.';
          supportedChains = ['Ethereum Mainnet', 'Base', 'Polygon', 'Arbitrum One'];
          break;
        case 'coinbase-wallet':
          description = 'Self-custodial Coinbase Wallet connector.';
          break;
        case 'solana':
          description = 'Solana non-custodial monitor (Under Development).';
          break;
      }

      return {
        id: adapter.id,
        name: adapter.name,
        network: adapter.network,
        version: '1.0.0',
        status: adapter.status,
        capabilities: adapter.capabilities,
        supportedChains,
        description,
      };
    });
  }

  formatAddress(network: string, address: string): string {
    const adapter = this.getAdapterByNetwork(network);
    if (adapter) {
      return adapter.formatAddress(address);
    }
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  hasCapability(adapterId: string, capability: WalletCapability): boolean {
    const adapter = this.getAdapter(adapterId);
    return adapter ? adapter.hasCapability(capability) : false;
  }
}

export const walletRegistry = new WalletRegistry();
