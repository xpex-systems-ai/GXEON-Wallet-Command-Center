import { AuditEvent } from '../types';

const AUDIT_STORAGE_KEY = 'gxeon_audit_log_v1';

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

  getEvents(): AuditEvent[] {
    return [...this.events].reverse();
  }

  recordEvent(
    event: string,
    detail: string,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info',
    actor: string = 'operator'
  ): void {
    // Strict sanitization: ensure no accidental private keys or tokens get into audit logs
    const sanitizedDetail = detail
      .replace(/0x[a-fA-F0-9]{64}/g, '[REDACTED_32B_HEX]')
      .replace(/[a-zA-Z0-9_-]{40,}/g, (match) => {
        // preserve known public address formats
        if (match.startsWith('RTC') || match.startsWith('0x')) return match;
        return '[REDACTED_SECRET]';
      });

    const newEvent: AuditEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      event,
      detail: sanitizedDetail,
      severity,
      actor,
    };

    this.events.push(newEvent);
    this.saveToStorage();
  }
}

export const auditService = new AuditService();
