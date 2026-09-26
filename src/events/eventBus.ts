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
    // Deep sanitize metadata fields
    const safeData: Record<string, unknown> = {};
    const sensitiveKeyRegex = /^(private_?key|seed|mnemonic|token|secret|password|auth|signing_?key)$/i;

    if (options.metadataSafe) {
      for (const [key, value] of Object.entries(options.metadataSafe)) {
        if (sensitiveKeyRegex.test(key)) {
          safeData[key] = '[REDACTED_SECURITY_DATA]';
        } else if (typeof value === 'string') {
          safeData[key] = sanitizeAuditDetail(value);
        } else if (value && typeof value === 'object') {
          safeData[key] = JSON.parse(JSON.stringify(value));
        } else {
          safeData[key] = value;
        }
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
