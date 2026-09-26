import { BridgeHealthResponse, BridgeStatusResponse, WalletItem } from '../types';
import { WalletAdapterInfo } from '../wallets/types';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://127.0.0.1:8790';

export class BridgeService {
  private baseUrl: string;

  constructor(baseUrl: string = BRIDGE_URL) {
    this.baseUrl = baseUrl;
  }

  async getHealth(): Promise<BridgeHealthResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<BridgeStatusResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getWallets(): Promise<WalletItem[]> {
    try {
      const response = await fetch(`${this.baseUrl}/wallets`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.wallets || []).map((w: Record<string, unknown>) => ({
        id: w.id as string,
        name: w.name as string,
        network: w.network as string,
        symbol: (w.symbol as string) || 'RTC',
        publicAddress: (w.address as string) || (w.publicAddress as string),
        connectionType: 'LOCAL_CONFIG',
        ownershipStatus: (w.ownership_verified ? 'VERIFIED' : 'UNVERIFIED'),
        mode: (w.mode as string) === 'local_signing' ? 'local_signing' : 'watch_only',
        balance: null, // Watch-only: null to render '--'
        isOnline: true,
        purpose: w.purpose as string,
        notes: w.notes as string,
      }));
    } catch {
      return [];
    }
  }

  async getAdapters(): Promise<WalletAdapterInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/adapters`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.adapters || [];
    } catch {
      return [];
    }
  }
}

export const bridgeService = new BridgeService();
