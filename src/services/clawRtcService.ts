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
      status: 'ERROR',
      clawrtc_installed: false,
      clawrtc_version: null,
      miner_id: null,
      reward_destination: null,
      config_source: 'UNAVAILABLE',
      hardware: {
        cpu_arch: 'UNKNOWN',
        processor: 'UNKNOWN',
        os: 'UNKNOWN',
        compatibility: 'UNKNOWN',
      },
      attestation_state: 'UNATTESTED',
      last_attestation_timestamp: null,
      current_epoch: null,
      antiquity_multiplier: null,
      confirmed_rtc: null,
      pending_rewards: null,
      source: 'bridge_unavailable',
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
   * Truth in Events:
   * Only emits CLAWRTC_CONFIGURED if config_source is CLAWRTC_CONFIGURED.
   * If LOCAL_METADATA_CONFIGURED, emits MINER_LOCAL_METADATA_CONFIGURED.
   */
  async configure(
    minerId: string,
    destinationWallet?: string
  ): Promise<{
    success: boolean;
    configSource: 'LOCAL_METADATA_CONFIGURED' | 'CLAWRTC_CONFIGURED' | 'UNCONFIGURED';
    message?: string;
  }> {
    const res = await bridgeService.configureMining(minerId, destinationWallet);
    const configSource = res.config_source || (res.ok ? 'LOCAL_METADATA_CONFIGURED' : 'UNCONFIGURED');
    if (res.ok) {
      if (configSource === 'CLAWRTC_CONFIGURED') {
        quantumEventBus.publish('CLAWRTC_CONFIGURED', {
          source: 'clawrtc_service',
          subjectId: minerId,
          metadataSafe: { minerId, destinationWallet: destinationWallet || 'default', configSource },
        });
      } else {
        quantumEventBus.publish('MINER_LOCAL_METADATA_CONFIGURED', {
          source: 'clawrtc_service',
          subjectId: minerId,
          metadataSafe: { minerId, destinationWallet: destinationWallet || 'default', configSource },
        });
      }
      return { success: true, configSource, message: res.message };
    }
    return { success: false, configSource: 'UNCONFIGURED', message: res.message || 'Configuration failed' };
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
