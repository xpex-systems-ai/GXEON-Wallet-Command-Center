import { AuditEvent } from '../types';
import {
  fetchAuditEventsFromFirestore,
  recordAuditEventToFirestore,
} from './firestore/auditRepository';

const AUDIT_STORAGE_KEY = 'gxeon_audit_log_v1';

/**
 * Sanitizes audit messages to prevent any accidental leakage of private keys,
 * seed phrases, tokens, or credentials.
 */
export function sanitizeAuditDetail(detail: string): string {
  if (!detail) return '';

  let sanitized = detail;

  // 1. Redact 64-char hex strings (private keys) and key assignments
  sanitized = sanitized.replace(/(private_key|privateKey|secret|signingKey|signing_key|seed|key)([\s:=]+)[a-fA-F0-9]{32,64}/gi, '$1$2[REDACTED_SECRET_KEY]');
  sanitized = sanitized.replace(/0x[a-fA-F0-9]{64}/g, '[REDACTED_32B_HEX]');
  sanitized = sanitized.replace(/\b[a-fA-F0-9]{64}\b/g, '[REDACTED_64_HEX]');

  // 2. Redact potential seed phrases (sequences of dictionary words)
  sanitized = sanitized.replace(/(seed|mnemonic|recoveryPhrase|recovery_phrase|seedPhrase|seed_phrase)([\s:=]+)[a-zA-Z\s]{15,}/gi, '$1$2[REDACTED_MNEMONIC_PHRASE]');

  // 3. Redact Bearer / JWT / Auth tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+/g, '[REDACTED_JWT_TOKEN]');

  // 4. Redact password assignments
  sanitized = sanitized.replace(/(?:password|pass)[\s:=]+([^\s]+)/gi, 'password: [REDACTED_PASSWORD]');

  return sanitized;
}

export class AuditService {
  private events: AuditEvent[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (stored) {
        this.events = JSON.parse(stored);
      } else {
        this.events = [
          {
            id: 'evt-init',
            timestamp: new Date().toISOString(),
            event: 'system_initialized',
            detail: 'GXEON Command Center initialized with local security boundary',
            severity: 'info',
            actor: 'system',
          },
        ];
        this.saveToStorage();
      }
    } catch {
      this.events = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(this.events.slice(-200)));
    } catch (e) {
      console.error('Failed to persist audit log:', e);
    }
  }

  async loadFromCloud(ownerUid: string): Promise<AuditEvent[]> {
    try {
      const cloudItems = await fetchAuditEventsFromFirestore(ownerUid);
      if (cloudItems.length > 0) {
        this.events = cloudItems;
        this.saveToStorage();
      }
      return this.getEvents();
    } catch (err) {
      console.warn('Failed to load audit events from Firestore:', err);
      return this.getEvents();
    }
  }

  getEvents(): AuditEvent[] {
    return [...this.events].reverse();
  }

  recordEvent(
    event: string,
    detail: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info',
    actor: string = 'operator',
    ownerUid?: string
  ): void {
    const sanitizedDetail = sanitizeAuditDetail(detail);

    const customId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newEvent: AuditEvent = {
      id: customId,
      ownerUid,
      timestamp: new Date().toISOString(),
      event,
      detail: sanitizedDetail,
      severity,
      actor,
    };

    if (ownerUid) {
      recordAuditEventToFirestore(
        {
          timestamp: newEvent.timestamp,
          event: newEvent.event,
          detail: newEvent.detail,
          severity: newEvent.severity,
          actor: newEvent.actor,
        },
        ownerUid,
        customId
      ).catch((err) => {
        console.warn('Failed to record audit event to Firestore:', err);
      });
    }

    this.events.push(newEvent);
    this.saveToStorage();
  }
}

export const auditService = new AuditService();
