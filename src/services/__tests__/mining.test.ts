import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clawRtcService } from '../clawRtcService';
import { bridgeService } from '../bridgeService';
import { quantumEventBus } from '../../events/eventBus';

describe('ClawRTC Service & Mining Controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries mining status from local bridge', async () => {
    vi.spyOn(bridgeService, 'getMiningStatus').mockResolvedValue({
      status: 'CONFIGURED',
      miner_id: 'test-node-01',
      reward_destination: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      clawrtc_installed: true,
      clawrtc_version: 'v0.9.4',
      antiquity_multiplier: 1.5,
      attestation_state: 'ATTESTED',
      last_attestation_timestamp: '2026-09-26T12:00:00Z',
      current_epoch: 104,
      confirmed_rtc: 25.0,
      pending_rewards: 0,
      source: 'bridge',
      queried_at: '2026-09-26T12:00:00Z',
      hardware: {
        cpu_arch: 'x86_64',
        processor: 'AMD64',
        os: 'Windows 10',
        compatibility: 'Proof of Antiquity Compatible',
      },
    });

    const status = await clawRtcService.getStatus();
    expect(status.status).toBe('CONFIGURED');
    expect(status.miner_id).toBe('test-node-01');
    expect(status.clawrtc_installed).toBe(true);
    expect(status.antiquity_multiplier).toBe(1.5);
    expect(status.attestation_state).toBe('ATTESTED');
  });

  it('publishes event on event bus when mining starts', async () => {
    vi.spyOn(bridgeService, 'startMining').mockResolvedValue({
      ok: true,
      status: 'MINING',
      message: 'Mining started',
    });

    const eventSpy = vi.fn();
    quantumEventBus.subscribe('MINER_STARTED', eventSpy);

    const result = await clawRtcService.startMining();
    expect(result.success).toBe(true);
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MINER_STARTED',
        source: 'clawrtc_service',
      })
    );
  });

  it('publishes event on event bus when mining stops', async () => {
    vi.spyOn(bridgeService, 'stopMining').mockResolvedValue({
      ok: true,
      status: 'STOPPED',
      message: 'Mining stopped',
    });

    const eventSpy = vi.fn();
    quantumEventBus.subscribe('MINER_STOPPED', eventSpy);

    const result = await clawRtcService.stopMining();
    expect(result.success).toBe(true);
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MINER_STOPPED',
        source: 'clawrtc_service',
      })
    );
  });
});
