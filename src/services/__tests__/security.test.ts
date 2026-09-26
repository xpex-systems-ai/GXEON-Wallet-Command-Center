import { describe, it, expect } from 'vitest';
import { sanitizeAuditDetail } from '../auditService';
import { formatWeiToEther } from '../../wallets/adapters/evm';

describe('Security & Sensitive Data Defense', () => {
  describe('Audit Log Sanitizer', () => {
    it('redacts raw private key patterns', () => {
      const input = 'Wallet error: privateKey=4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
      const output = sanitizeAuditDetail(input);
      expect(output).not.toContain('4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d');
      expect(output).toContain('[REDACTED_SECRET_KEY]');
    });

    it('redacts 32-byte hex hashes', () => {
      const input = 'Operation with 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
      const output = sanitizeAuditDetail(input);
      expect(output).toContain('[REDACTED_32B_HEX]');
    });

    it('redacts Bearer and JWT authentication tokens', () => {
      const input = 'API call failed with Bearer secret_token_xyz1234567890';
      const output = sanitizeAuditDetail(input);
      expect(output).toContain('Bearer [REDACTED_TOKEN]');
      expect(output).not.toContain('secret_token_xyz1234567890');
    });

    it('redacts passwords in messages', () => {
      const input = 'Auth attempt with password=SuperSecretPassword123!';
      const output = sanitizeAuditDetail(input);
      expect(output).toContain('[REDACTED_PASSWORD]');
      expect(output).not.toContain('SuperSecretPassword123!');
    });
  });

  describe('EVM Financial Precision (BigInt formatWeiToEther)', () => {
    it('accurately formats 1 ETH without float loss', () => {
      const oneEthWei = 1000000000000000000n;
      expect(formatWeiToEther(oneEthWei)).toBe('1');
    });

    it('accurately formats decimal fractions', () => {
      const halfEthWei = 500000000000000000n;
      expect(formatWeiToEther(halfEthWei)).toBe('0.5');

      const pointOneTwoEthWei = 120000000000000000n;
      expect(formatWeiToEther(pointOneTwoEthWei)).toBe('0.12');
    });

    it('handles large financial integers without overflow', () => {
      const largeWei = 123456789000000000000000000n;
      expect(formatWeiToEther(largeWei)).toBe('123456789');
    });
  });

  describe('Firestore Security Rule Invariants Logic', () => {
    const sensitiveKeys = [
      'privateKey',
      'private_key',
      'seed',
      'seedPhrase',
      'seed_phrase',
      'mnemonic',
      'recoveryPhrase',
      'recovery_phrase',
      'password',
      'secret',
      'rawToken',
      'accessToken',
      'refreshToken',
      'signingKey',
      'signing_key',
    ];

    function hasNoSensitiveFields(data: Record<string, unknown>): boolean {
      for (const k of sensitiveKeys) {
        if (k in data) return false;
      }
      return true;
    }

    it('blocks any document containing any prohibited sensitive key', () => {
      for (const k of sensitiveKeys) {
        const payload = { [k]: 'sensitive_value', publicAddress: '0x123' };
        expect(hasNoSensitiveFields(payload)).toBe(false);
      }
    });

    it('allows clean public metadata documents', () => {
      const cleanPayload = {
        name: 'GXEON RustChain RTC',
        network: 'rustchain',
        symbol: 'RTC',
        publicAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
        mode: 'watch_only',
        ownershipStatus: 'UNVERIFIED',
      };
      expect(hasNoSensitiveFields(cleanPayload)).toBe(true);
    });
  });
});
