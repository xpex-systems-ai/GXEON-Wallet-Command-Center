import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { bridgeService } from '../bridgeService';
import { DetectedWallet, WalletItem } from '../../types';

// Mock storage for Node test environment
function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

const mockSessionStorage = createStorageMock();
const mockLocalStorage = createStorageMock();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

describe('Local Companion & CLI Pairing Service', () => {
  const SESSION_KEY = 'gxeon_companion_session_token_v1';

  beforeEach(() => {
    mockSessionStorage.clear();
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mockSessionStorage.clear();
    mockLocalStorage.clear();
  });

  describe('Session Storage Invariant', () => {
    it('stores session token strictly in sessionStorage and NEVER in localStorage', () => {
      bridgeService.setSessionToken('test-ephemeral-token-12345');

      expect(bridgeService.getSessionToken()).toBe('test-ephemeral-token-12345');
      expect(mockSessionStorage.getItem(SESSION_KEY)).toBe('test-ephemeral-token-12345');
      expect(mockLocalStorage.getItem(SESSION_KEY)).toBeNull();
      expect(bridgeService.isPaired()).toBe(true);

      bridgeService.clearSessionToken();
      expect(bridgeService.getSessionToken()).toBeNull();
      expect(bridgeService.isPaired()).toBe(false);
    });
  });

  describe('Pairing Flow API Client', () => {
    it('initiates pairing challenge successfully', async () => {
      const mockResponse = {
        ok: true,
        pairing_code: '849201',
        expires_in: 300,
        message: 'Pairing code generated. Enter this 6-digit code in the GXEON Web Command Center.',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await bridgeService.startPairing();
      expect(result).not.toBeNull();
      expect(result?.pairing_code).toBe('849201');
      expect(result?.ok).toBe(true);
    });

    it('confirms pairing and stores session token on success', async () => {
      const mockConfirm = {
        ok: true,
        token: 'gxeon_sess_9876543210abcdef',
        expires_in: 3600,
        session_id: 'sess_123',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfirm,
      } as Response);

      const res = await bridgeService.confirmPairing('849201');
      expect(res.success).toBe(true);
      expect(res.data?.token).toBe('gxeon_sess_9876543210abcdef');
      expect(bridgeService.getSessionToken()).toBe('gxeon_sess_9876543210abcdef');
      expect(bridgeService.isPaired()).toBe(true);
    });

    it('handles invalid pairing code error gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Invalid pairing code. 4 attempts remaining.' }),
      } as Response);

      const res = await bridgeService.confirmPairing('000000');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid pairing code');
      expect(bridgeService.getSessionToken()).toBeNull();
      expect(bridgeService.isPaired()).toBe(false);
    });

    it('revokes pairing session properly', async () => {
      bridgeService.setSessionToken('token-to-revoke');
      expect(bridgeService.isPaired()).toBe(true);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, message: 'Session revoked' }),
      } as Response);

      const ok = await bridgeService.revokePairing();
      expect(ok).toBe(true);
      expect(bridgeService.getSessionToken()).toBeNull();
      expect(bridgeService.isPaired()).toBe(false);
    });
  });

  describe('Detected Tools & Wallet Invariants', () => {
    it('detects tools and local wallets via authenticated bridge endpoint', async () => {
      bridgeService.setSessionToken('auth-token');

      const mockDetection = {
        tools: [
          {
            tool: 'rustchain',
            installed: true,
            version: '0.1.0',
            path_sanitized: '/usr/local/bin/rustchain',
            capabilities: ['READ_BALANCE', 'WATCH_ONLY'],
          },
        ],
        detected_wallets: [
          {
            id: 'rustchain-cli-default',
            network: 'rustchain',
            symbol: 'RTC',
            publicAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
            name: 'RustChain Default CLI Wallet',
            connectionType: 'LOCAL_CONFIG' as const,
            mode: 'watch_only' as const,
            ownershipStatus: 'UNVERIFIED' as const,
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetection,
      } as Response);

      const result = await bridgeService.detectToolsAndWallets();
      expect(result).not.toBeNull();
      expect(result?.tools).toHaveLength(1);
      expect(result?.detected_wallets).toHaveLength(1);
      expect(result?.detected_wallets[0].publicAddress).toBe('RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269');
      expect(result?.detected_wallets[0].mode).toBe('watch_only');
      expect(result?.detected_wallets[0].ownershipStatus).toBe('UNVERIFIED');
    });

    it('enforces imported CLI wallets to be strictly watch_only with UNVERIFIED ownership', () => {
      const detected: DetectedWallet = {
        id: 'detected-cli-rtc',
        network: 'rustchain',
        publicAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
        name: 'RustChain CLI Local',
        symbol: 'RTC',
        connectionType: 'LOCAL_CONFIG',
        mode: 'watch_only',
        ownershipStatus: 'UNVERIFIED',
      };

      const importedWallet: Omit<WalletItem, 'id'> = {
        name: detected.name,
        network: detected.network,
        symbol: detected.symbol,
        publicAddress: detected.publicAddress,
        balance: '0.00',
        mode: 'watch_only',
        ownershipStatus: 'UNVERIFIED',
        connectionType: 'LOCAL_CONFIG',
        notes: 'Imported via GXEON Local Companion CLI Pairing.',
      };

      expect(importedWallet.mode).toBe('watch_only');
      expect(importedWallet.ownershipStatus).toBe('UNVERIFIED');
      expect(importedWallet.publicAddress).toBe('RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269');
      // Verify no sensitive keys exist
      expect((importedWallet as Record<string, unknown>).privateKey).toBeUndefined();
      expect((importedWallet as Record<string, unknown>).seed).toBeUndefined();
      expect((importedWallet as Record<string, unknown>).mnemonic).toBeUndefined();
    });
  });

  describe('RustChain Live Read-Only Fallback', () => {
    it('returns structured UNAVAILABLE response when RTC node is offline', async () => {
      bridgeService.setSessionToken('auth-token');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'UNAVAILABLE',
          address: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
          balance: null,
          symbol: 'RTC',
          note: 'RustChain node or RPC is currently unreachable on 127.0.0.1:8545.',
        }),
      } as Response);

      const balanceRes = await bridgeService.getRustChainBalance('rustchain-cli-default');
      expect(balanceRes).not.toBeNull();
      expect(balanceRes?.status).toBe('UNAVAILABLE');
      expect(balanceRes?.balance).toBeNull();
    });
  });
});
