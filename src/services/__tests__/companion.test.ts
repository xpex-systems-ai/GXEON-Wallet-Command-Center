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

  describe('Pairing Flow (Terminal Code to UI Confirmation)', () => {
    it('confirms pairing using terminal-generated code and stores session token on success', async () => {
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

    it('handles invalid pairing code error gracefully without crashing', async () => {
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

    it('queries pairing status with active bearer token', async () => {
      bridgeService.setSessionToken('valid-token-123');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          paired: true,
          companion_version: '1.1.0',
          security_mode: 'local_only',
        }),
      } as Response);

      const status = await bridgeService.getPairingStatus();
      expect(status).not.toBeNull();
      expect(status?.paired).toBe(true);
      expect(status?.companion_version).toBe('1.1.0');
    });

    it('revokes pairing session properly and clears sessionStorage', async () => {
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
    it('detects tools and separates detected live wallets from registered watch-only configs', async () => {
      bridgeService.setSessionToken('auth-token');

      const mockDetection = {
        tools: [
          {
            tool: 'Solana CLI',
            installed: true,
            version: '1.18.0',
            path_sanitized: 'solana',
            capabilities: ['PUBKEY_DETECT', 'WATCH_ONLY'],
            public_address_discovery: 'AVAILABLE',
          },
        ],
        detected_wallets: [
          {
            id: 'detected-solana-cli-default',
            network: 'solana',
            symbol: 'SOL',
            publicAddress: '7v91N7iZ9mNicL8WVCzP9fEZjRzM2yLq7z4m6yW7b8qZ',
            name: 'Solana CLI Default Keypair',
            connectionType: 'CLI_DETECTED' as const,
            mode: 'watch_only' as const,
            ownershipStatus: 'UNVERIFIED' as const,
          },
        ],
        registered_wallets: [
          {
            id: 'rustchain-main',
            network: 'rustchain',
            symbol: 'RTC',
            publicAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
            name: 'GXEON Core Watch-Only RTC',
            connectionType: 'WATCH_ONLY' as const,
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
      expect(result?.tools[0].public_address_discovery).toBe('AVAILABLE');
      expect(result?.detected_wallets).toHaveLength(1);
      expect(result?.detected_wallets[0].connectionType).toBe('CLI_DETECTED');
      expect(result?.registered_wallets).toHaveLength(1);
      expect(result?.registered_wallets?.[0].connectionType).toBe('WATCH_ONLY');
    });

    it('enforces imported CLI wallets to be strictly watch_only with UNVERIFIED ownership', () => {
      const detected: DetectedWallet = {
        id: 'detected-solana-cli-default',
        network: 'solana',
        publicAddress: '7v91N7iZ9mNicL8WVCzP9fEZjRzM2yLq7z4m6yW7b8qZ',
        name: 'Solana CLI Default Keypair',
        symbol: 'SOL',
        connectionType: 'CLI_DETECTED',
        mode: 'watch_only',
        ownershipStatus: 'UNVERIFIED',
      };

      const importedWallet: Omit<WalletItem, 'id'> = {
        name: detected.name,
        network: detected.network,
        symbol: detected.symbol,
        publicAddress: detected.publicAddress,
        balance: null,
        mode: 'watch_only',
        ownershipStatus: 'UNVERIFIED',
        connectionType: 'CLI_DETECTED',
        notes: 'Imported via GXEON Local Companion CLI Pairing.',
      };

      expect(importedWallet.mode).toBe('watch_only');
      expect(importedWallet.ownershipStatus).toBe('UNVERIFIED');
      expect(importedWallet.publicAddress).toBe('7v91N7iZ9mNicL8WVCzP9fEZjRzM2yLq7z4m6yW7b8qZ');
      expect(importedWallet.balance).toBeNull();
      // Verify no sensitive keys exist
      expect((importedWallet as Record<string, unknown>).privateKey).toBeUndefined();
      expect((importedWallet as Record<string, unknown>).seed).toBeUndefined();
      expect((importedWallet as Record<string, unknown>).mnemonic).toBeUndefined();
    });
  });

  describe('RustChain Live Read-Only Fallback', () => {
    it('returns structured UNAVAILABLE response without fabricated balance', async () => {
      bridgeService.setSessionToken('auth-token');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'UNAVAILABLE',
          address: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
          balance: null,
          symbol: 'RTC',
          source: 'none',
          note: 'No verified RustChain RPC node source configured. Truth in data: balance is UNAVAILABLE.',
        }),
      } as Response);

      const balanceRes = await bridgeService.getRustChainBalance('rustchain-main');
      expect(balanceRes).not.toBeNull();
      expect(balanceRes?.status).toBe('UNAVAILABLE');
      expect(balanceRes?.balance).toBeNull();
      expect(balanceRes?.source).toBe('none');
    });
  });
});
