import { WalletAdapter, WalletCapability, AdapterStatus, ConnectResult } from '../types';

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export class EvmAdapter implements WalletAdapter {
  id = 'evm-metamask';
  name = 'MetaMask / EVM Browser Provider';
  network = 'evm';
  status: AdapterStatus = 'ACTIVE';
  capabilities: WalletCapability[] = [
    'CONNECT',
    'READ_BALANCE',
    'READ_TRANSACTIONS',
    'SIGN',
    'WATCH_ONLY',
  ];

  hasCapability(cap: WalletCapability): boolean {
    return this.capabilities.includes(cap);
  }

  formatAddress(address: string): string {
    if (!address) return '';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Connects via browser window.ethereum provider.
   * ABSOLUTE SECURITY INVARIANT: NEVER requests, inspects, or handles seed phrases or private keys.
   */
  async connect(): Promise<ConnectResult> {
    if (typeof window === 'undefined' || !window.ethereum) {
      return {
        success: false,
        error: 'No EVM browser extension (e.g. MetaMask, Rabby) detected in this browser.',
      };
    }

    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        return {
          success: false,
          error: 'Connection rejected or no accounts selected by user.',
        };
      }

      const chainIdHex = (await window.ethereum.request({
        method: 'eth_chainId',
      })) as string;

      const chainId = parseInt(chainIdHex, 16);

      return {
        success: true,
        publicAddress: accounts[0],
        chainId: chainId,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'User rejected connection request';
      return {
        success: false,
        error: message,
      };
    }
  }

  async getBalance(_address: string): Promise<string | null> {
    // When connected to window.ethereum or public RPC, fetch balance.
    // If not connected, return null to avoid fabricating numbers.
    if (typeof window !== 'undefined' && window.ethereum && _address) {
      try {
        const balanceHex = (await window.ethereum.request({
          method: 'eth_getBalance',
          params: [_address, 'latest'],
        })) as string;
        if (balanceHex) {
          const wei = BigInt(balanceHex);
          const eth = Number(wei) / 1e18;
          return eth.toFixed(4);
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const evmAdapter = new EvmAdapter();
