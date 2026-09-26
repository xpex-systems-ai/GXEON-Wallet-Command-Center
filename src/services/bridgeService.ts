import {
  BridgeHealthResponse,
  BridgeStatusResponse,
  WalletItem,
  BridgePairStartResponse,
  BridgePairConfirmResponse,
  BridgePairStatusResponse,
  BridgeDetectionResult,
  RustChainBalanceResponse,
  RustChainTransactionsResponse,
  ProofOfAntiquityState,
} from '../types';
import { WalletAdapterInfo } from '../wallets/types';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://127.0.0.1:8790';
const SESSION_TOKEN_KEY = 'gxeon_companion_session_token_v1';

export class BridgeService {
  private baseUrl: string;

  constructor(baseUrl: string = BRIDGE_URL) {
    this.baseUrl = baseUrl;
  }

  // ============================================================
  // EPHEMERAL SESSION TOKEN MANAGEMENT (sessionStorage only)
  // ============================================================

  getSessionToken(): string | null {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setSessionToken(token: string): void {
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch (e) {
      console.error('Failed to save session token in sessionStorage:', e);
    }
  }

  clearSessionToken(): void {
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {}
  }

  private getAuthHeaders(): HeadersInit {
    const token = this.getSessionToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // ============================================================
  // PUBLIC LOCAL CALLS (Unauthenticated)
  // ============================================================

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

  // ============================================================
  // PAIRING PROTOCOL METHODS
  // ============================================================

  async startPairing(): Promise<BridgePairStartResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/pair/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async confirmPairing(code: string): Promise<{ success: boolean; data?: BridgePairConfirmResponse; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/pair/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({ detail: 'Pairing failed' }));
        return { success: false, error: errJson.detail || 'Pairing verification failed' };
      }

      const data: BridgePairConfirmResponse = await response.json();
      if (data.token) {
        this.setSessionToken(data.token);
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Could not communicate with Local Companion bridge' };
    }
  }

  async getPairingStatus(): Promise<BridgePairStatusResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/pair/status`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async revokePairing(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/pair/revoke`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      this.clearSessionToken();
      return response.ok;
    } catch {
      this.clearSessionToken();
      return false;
    }
  }

  isPaired(): boolean {
    return Boolean(this.getSessionToken());
  }

  // ============================================================
  // PROTECTED LOCAL ENDPOINTS (Require active pairing token)
  // ============================================================

  async getWallets(): Promise<WalletItem[]> {
    try {
      const response = await fetch(`${this.baseUrl}/wallets`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
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
        ownershipStatus: w.ownership_verified ? 'VERIFIED' : 'UNVERIFIED',
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
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.adapters || [];
    } catch {
      return [];
    }
  }

  async detectToolsAndWallets(): Promise<BridgeDetectionResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/detect`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getRustChainBalance(walletId: string = 'rustchain-main'): Promise<RustChainBalanceResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/wallets/${walletId}/balance`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getRustChainTransactions(walletId: string = 'rustchain-main'): Promise<RustChainTransactionsResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/wallets/${walletId}/transactions`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // ============================================================
  // MINING & CLAWRTC CONTROLS (Proof of Antiquity)
  // ============================================================

  async getMiningStatus(): Promise<ProofOfAntiquityState | null> {
    try {
      const response = await fetch(`${this.baseUrl}/mining/status`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async configureMining(minerId: string, rewardDestination?: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/mining/configure`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          miner_id: minerId.trim(),
          reward_destination: rewardDestination ? rewardDestination.trim() : undefined,
        }),
      });
      if (!response.ok) return { ok: false, message: 'Configuration failed' };
      return await response.json();
    } catch {
      return { ok: false, message: 'Network error configuring mining' };
    }
  }

  async startMining(): Promise<{ ok: boolean; status?: string; message?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/mining/start`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return { ok: false, message: 'Failed to start mining' };
      return await response.json();
    } catch {
      return { ok: false, message: 'Network error starting mining' };
    }
  }

  async stopMining(): Promise<{ ok: boolean; status?: string; message?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/mining/stop`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) return { ok: false, message: 'Failed to stop mining' };
      return await response.json();
    } catch {
      return { ok: false, message: 'Network error stopping mining' };
    }
  }
}

export const bridgeService = new BridgeService();
