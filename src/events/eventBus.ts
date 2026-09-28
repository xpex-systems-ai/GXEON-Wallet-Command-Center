import { QuantumEvent, QuantumEventType } from '../types';
import { sanitizeAuditDetail } from '../services/auditService';

type EventHandler = (event: QuantumEvent) => void;

class QuantumEventBus {
  private handlers: Map<QuantumEventType | '*', Set<EventHandler>> = new Map();
  private eventHistory: QuantumEvent[] = [];
  private maxHistory: number = 100;

  /**
   * Subscribes to a specific Quantum event type or '*' for all events.
   */
  subscribe(type: QuantumEventType | '*', handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscription cleanup function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * Publishes a typed Quantum event.
   * ABSOLUTE SECURITY INVARIANT:
   * Metadata is strictly sanitized to prevent any accidental leakage of private keys or secrets.
   */
  publish(
    type: QuantumEventType,
    options: {
      source: string;
      status?: QuantumEvent['status'];
      subjectId?: string;
      metadataSafe?: Record<string, unknown>;
      ownerUid?: string;
    }
  ): QuantumEvent {
    // Deep sanitize metadata fields while preserving public transaction hashes.
    const sensitiveKeyRegex = /^(private_?key|seed|mnemonic|token|secret|password|auth|authorization|signing_?key|recovery_?phrase)$/i;

    const sanitizeValue = (key: string, value: unknown): unknown => {
      if (sensitiveKeyRegex.test(key)) return '[REDACTED_SECURITY_DATA]';
      if (Array.isArray(value)) return value.map((item) => sanitizeValue('', item));
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
            nestedKey,
            sanitizeValue(nestedKey, nestedValue),
          ])
        );
      }
      if (typeof value === 'string') {
        // Transaction hashes are public audit identifiers, not private key material.
        if (/^(txHash|transactionHash)$/i.test(key) && /^0x[0-9a-fA-F]{64}$/.test(value)) {
          return value;
        }
        return sanitizeAuditDetail(value);
      }
      return value;
    };

    const safeData: Record<string, unknown> = {};
    if (options.metadataSafe) {
      for (const [key, value] of Object.entries(options.metadataSafe)) {
        safeData[key] = sanitizeValue(key, value);
      }
    }

    const event: QuantumEvent = {
      id: `qevt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      timestamp: new Date().toISOString(),
      source: options.source,
      status: options.status || 'CONFIRMED',
      subjectId: options.subjectId,
      metadataSafe: safeData,
      ownerUid: options.ownerUid,
    };

    // Store in bounded event history
    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.pop();
    }

    // Trigger type-specific handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[QuantumEventBus] Handler error on ${type}:`, err);
        }
      }
    }

    // Trigger wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[QuantumEventBus] Wildcard handler error on ${type}:`, err);
        }
      }
    }

    return event;
  }

  /**
   * Retrieves recent event history.
   */
  getHistory(filterType?: QuantumEventType): QuantumEvent[] {
    if (filterType) {
      return this.eventHistory.filter((e) => e.type === filterType);
    }
    return [...this.eventHistory];
  }

  /**
   * Clears event history.
   */
  clear(): void {
    this.eventHistory = [];
  }
}

export const quantumEventBus = new QuantumEventBus();
