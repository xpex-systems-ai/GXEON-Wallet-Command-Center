import {
  MiningAgentState,
  PayoutAgentState,
  SecurityAgentState,
  ProofOfAntiquityState,
  BountyItem,
} from '../types';
import { quantumEventBus } from '../events/eventBus';

/**
 * ============================================================
 * GXEON QUANTUM AGENT MESH (Read-Only Observers)
 * ============================================================
 * AGENTS OBSERVE, CLASSIFY, NOTIFY, AND RECOMMEND.
 * AGENTS NEVER SIGN, MOVE FUNDS, EXPORT KEYS, OR MUTATE OWNERSHIP.
 */

export class MiningAgent {
  private state: MiningAgentState = {
    isObserving: true,
    lastCheck: new Date().toISOString(),
    minerStatus: 'STOPPED',
    activeAttestation: false,
    recommendations: [],
  };

  constructor() {
    quantumEventBus.subscribe('MINER_STARTED', () => {
      this.state.minerStatus = 'MINING';
      this.state.activeAttestation = true;
      this.state.lastCheck = new Date().toISOString();
    });

    quantumEventBus.subscribe('MINER_STOPPED', () => {
      this.state.minerStatus = 'STOPPED';
      this.state.activeAttestation = false;
      this.state.lastCheck = new Date().toISOString();
    });
  }

  evaluate(miningState: ProofOfAntiquityState): MiningAgentState {
    this.state.lastCheck = new Date().toISOString();
    this.state.minerStatus = miningState.status;
    this.state.activeAttestation = miningState.attestation_state === 'ATTESTED';

    const recs: string[] = [];
    if (!miningState.clawrtc_installed) {
      recs.push('ClawRTC binary not detected in PATH. Install ClawRTC to enable Proof of Antiquity.');
    } else if (!miningState.miner_id) {
      recs.push('Configure a unique RustChain Miner ID to track Proof of Antiquity epoch attestations.');
    } else if (miningState.status === 'STOPPED' || miningState.status === 'CONFIGURED') {
      recs.push('Miner is ready. Operator may click START MINING to initiate epoch attestation.');
    } else if (miningState.status === 'MINING') {
      recs.push(`Mining active on Epoch #${miningState.current_epoch}. Monitoring hardware attestation.`);
    }

    this.state.recommendations = recs;
    return { ...this.state };
  }

  getState(): MiningAgentState {
    return { ...this.state };
  }
}

export class PayoutAgent {
  private state: PayoutAgentState = {
    isObserving: true,
    lastCheck: new Date().toISOString(),
    verifiedPayoutsCount: 0,
    pendingPayoutsCount: 0,
    alerts: [],
  };

  evaluate(bounties: BountyItem[]): PayoutAgentState {
    this.state.lastCheck = new Date().toISOString();
    let verified = 0;
    let pending = 0;
    const alerts: string[] = [];

    for (const b of bounties) {
      if (b.status === 'PAID') {
        verified++;
      } else if (b.status === 'PAYOUT_PENDING' || b.status === 'ACCEPTED') {
        pending++;
        if (!b.txHash) {
          alerts.push(`Bounty "${b.title}" is accepted; awaiting on-chain transaction hash.`);
        }
      }
    }

    this.state.verifiedPayoutsCount = verified;
    this.state.pendingPayoutsCount = pending;
    this.state.alerts = alerts;
    return { ...this.state };
  }

  getState(): PayoutAgentState {
    return { ...this.state };
  }
}

export class SecurityAgent {
  private state: SecurityAgentState = {
    isObserving: true,
    lastCheck: new Date().toISOString(),
    pairingHealth: true,
    invariantStatus: 'STABLE',
    securityViolationsCount: 0,
  };

  constructor() {
    quantumEventBus.subscribe('SECURITY_ALERT', () => {
      this.state.securityViolationsCount++;
      this.state.invariantStatus = 'ALERT';
      this.state.lastCheck = new Date().toISOString();
    });
  }

  evaluate(isPaired: boolean, isBridgeOnline: boolean): SecurityAgentState {
    this.state.lastCheck = new Date().toISOString();
    this.state.pairingHealth = isPaired;

    if (!isBridgeOnline) {
      this.state.invariantStatus = 'DEGRADED';
    } else if (this.state.securityViolationsCount > 0) {
      this.state.invariantStatus = 'ALERT';
    } else {
      this.state.invariantStatus = 'STABLE';
    }

    return { ...this.state };
  }

  getState(): SecurityAgentState {
    return { ...this.state };
  }
}

export const miningAgent = new MiningAgent();
export const payoutAgent = new PayoutAgent();
export const securityAgent = new SecurityAgent();
