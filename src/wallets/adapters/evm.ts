import {
  WalletAdapter,
  WalletCapability,
  AdapterStatus,
  AdapterCapabilityDescriptor,
  ConnectResult,
} from '../types';

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

/**
 * Converts wei (hex or BigInt) to ether string safely without floating point precision loss.
 */
export function formatWeiToEther(weiBigInt: bigint): string {
  const divisor = 10n ** 18n;
  const integerPart = weiBigInt / divisor;
  const remainder = weiBigInt % divisor;

  if (remainder === 0n) {
    return integerPart.toString();
  }

  const remainderStr = remainder.toString().padStart(18, '0');
  // Trim trailing zeros, keeping max 4 decimal digits
  const trimmed = remainderStr.slice(0, 4).replace(/0+$/, '');
  return trimmed.length > 0 ? `${integerPart}.${trimmed}` : integerPart.toString();
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

  capabilityDetails: AdapterCapabilityDescriptor[] = [
    {
      capability: 'CONNECT',
      status: 'AVAILABLE',
      notes: 'Browser provider EIP-1193 authorization without seed phrase.',
    },
    {
      capability: 'READ_BALANCE',
      status: 'AVAILABLE',
      notes: 'Direct eth_getBalance query via injected provider.',
    },
    {
      capability: 'READ_TRANSACTIONS',
      status: 'AVAILABLE',
      notes: 'Public block explorer query.',
    },
    {
      capability: 'SIGN',
      status: 'AVAILABLE',
      notes: 'Personal sign / message proof performed locally in wallet.',
    },
    {
      capability: 'WATCH_ONLY',
      status: 'AVAILABLE',
      notes: 'Address tracking supported across EVM chains.',
    },
    {
      capability: 'SEND',
      status: 'DISABLED_IN_V1',
      notes: 'Sending funds is disabled in V1.',
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
    if (typeof window !== 'undefined' && window.ethereum && _address) {
      try {
        const balanceHex = (await window.ethereum.request({
          method: 'eth_getBalance',
          params: [_address, 'latest'],
        })) as string;
        if (balanceHex) {
          const wei = BigInt(balanceHex);
          return formatWeiToEther(wei);
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const evmAdapter = new EvmAdapter();
