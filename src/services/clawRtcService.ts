import { ProofOfAntiquityState } from '../types';
import { bridgeService } from './bridgeService';
import { quantumEventBus } from '../events/eventBus';

export class ClawRtcService {
  /**
   * Retrieves live ClawRTC Proof of Antiquity status from the Local Companion.
   */
  async getStatus(): Promise<ProofOfAntiquityState> {
    const timestamp = new Date().toISOString();
    const fallback: ProofOfAntiquityState = {
      status: 'NOT_INSTALLED',
      clawrtc_installed: false,
      clawrtc_version: null,
      miner_id: null,
      reward_destination: null,
      hardware: {
        cpu_arch: 'x86_64',
        processor: 'Standard CPU',
        os: 'Windows/Linux',
        compatibility: 'DETECTED_HARDWARE',
      },
      attestation_state: 'UNATTESTED',
      last_attestation_timestamp: null,
      current_epoch: null,
      antiquity_multiplier: null,
      confirmed_rtc: null,
      pending_rewards: null,
      source: 'none',
      queried_at: timestamp,
    };

    try {
      const state = await bridgeService.getMiningStatus();
      if (state) {
        return state;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Explicit operator configuration of miner_id.
   * ABSOLUTE SECURITY INVARIANT:
   * Does not request or accept private keys.
   */
  async configure(minerId: string, destinationWallet?: string): Promise<boolean> {
    const res = await bridgeService.configureMining(minerId, destinationWallet);
    if (res.ok) {
      quantumEventBus.publish('CLAWRTC_CONFIGURED', {
        source: 'clawrtc_service',
        subjectId: minerId,
        metadataSafe: { minerId, destinationWallet: destinationWallet || 'default' },
      });
      return true;
    }
    return false;
  }

  /**
   * Explicit operator trigger to start mining.
   */
  async startMining(): Promise<{ success: boolean; message: string }> {
    const res = await bridgeService.startMining();
    if (res.ok) {
      quantumEventBus.publish('MINER_STARTED', {
        source: 'clawrtc_service',
        metadataSafe: { status: 'MINING' },
      });
      return { success: true, message: res.message || 'Mining started' };
    }
    return { success: false, message: res.message || 'Failed to start mining' };
  }

  /**
   * Explicit operator trigger to stop mining.
   */
  async stopMining(): Promise<{ success: boolean; message: string }> {
    const res = await bridgeService.stopMining();
    if (res.ok) {
      quantumEventBus.publish('MINER_STOPPED', {
        source: 'clawrtc_service',
        metadataSafe: { status: 'STOPPED' },
      });
      return { success: true, message: res.message || 'Mining stopped' };
    }
    return { success: false, message: res.message || 'Failed to stop mining' };
  }
}

export const clawRtcService = new ClawRtcService();
