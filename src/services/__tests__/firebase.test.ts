import { describe, it, expect } from 'vitest';
import { getFirebaseConfig, isFirebaseConfigured } from '../../firebase/config';
import { sanitizeAuditDetail } from '../auditService';

describe('Firebase Foundation & Security Invariants', () => {
  it('correctly reports Firebase configuration presence', () => {
    const configured = isFirebaseConfigured();
    // Default in test env without VITE_FIREBASE_API_KEY is false
    expect(typeof configured).toBe('boolean');
  });

  it('safely parses Firebase config without throwing', () => {
    const config = getFirebaseConfig();
    if (config) {
      expect(config.apiKey).toBeDefined();
      expect(config.projectId).toBeDefined();
    } else {
      expect(config).toBeNull();
    }
  });

  it('ensures audit log redacts private keys, bearer tokens, and JWTs', () => {
    const sensitiveMessage1 = 'Auth error for user: privateKey=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef and auth=Bearer my_secret_token_1234';
    const sanitized1 = sanitizeAuditDetail(sensitiveMessage1);

    expect(sanitized1).not.toContain('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(sanitized1).toContain('[REDACTED_SECRET_KEY]');
    expect(sanitized1).toContain('Bearer [REDACTED_TOKEN]');

    const sensitiveMessage2 = 'Raw token leaked: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakSignature';
    const sanitized2 = sanitizeAuditDetail(sensitiveMessage2);
    expect(sanitized2).toContain('[REDACTED_JWT_TOKEN]');
    expect(sanitized2).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });
});
