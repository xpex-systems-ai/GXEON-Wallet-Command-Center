import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quantumEventBus } from '../eventBus';

describe('Quantum Event Bus', () => {
  beforeEach(() => {
    quantumEventBus.clear();
  });

  it('publishes and subscribes to specific event types', () => {
    const listener = vi.fn();
    const unsub = quantumEventBus.subscribe('COMPANION_ONLINE', listener);

    quantumEventBus.publish('COMPANION_ONLINE', {
      source: 'test',
      metadataSafe: { port: 8790, version: '1.2.0' },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'COMPANION_ONLINE',
        source: 'test',
        metadataSafe: { port: 8790, version: '1.2.0' },
      })
    );

    unsub();
    quantumEventBus.publish('COMPANION_ONLINE', {
      source: 'test',
      metadataSafe: { port: 8790 },
    });
    expect(listener).toHaveBeenCalledTimes(1); // Not called again
  });

  it('supports wildcard subscriptions (*)', () => {
    const wildcardListener = vi.fn();
    quantumEventBus.subscribe('*', wildcardListener);

    quantumEventBus.publish('MINER_STARTED', {
      source: 'clawrtc',
      metadataSafe: { minerId: 'node-01' },
    });
    quantumEventBus.publish('ATTESTATION_CONFIRMED', {
      source: 'rustchain',
      metadataSafe: { epoch: 104 },
    });

    expect(wildcardListener).toHaveBeenCalledTimes(2);
  });

  it('sanitizes sensitive fields from published payloads', () => {
    const listener = vi.fn();
    quantumEventBus.subscribe('SECURITY_INVARIANT_VIOLATION', listener);

    quantumEventBus.publish('SECURITY_INVARIANT_VIOLATION', {
      source: 'security_monitor',
      metadataSafe: {
        privateKey: '0x1234567890abcdef',
        token: 'session_token_xyz',
        safeData: 'visible_info',
      },
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataSafe: {
          privateKey: '[REDACTED_SECURITY_DATA]',
          token: '[REDACTED_SECURITY_DATA]',
          safeData: 'visible_info',
        },
      })
    );
  });

  it('maintains bounded history up to max size', () => {
    for (let i = 0; i < 110; i++) {
      quantumEventBus.publish('EPOCH_CHANGED', {
        source: 'rustchain',
        metadataSafe: { epoch: i },
      });
    }

    const history = quantumEventBus.getHistory();
    expect(history.length).toBeLessThanOrEqual(100);
  });
});
