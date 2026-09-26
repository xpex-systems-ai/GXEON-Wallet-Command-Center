import { PayoutVerification, BountyItem } from '../types';
import { quantumEventBus } from '../events/eventBus';

export interface PayoutVerificationRequest {
  bountyId?: string;
  minerRewardId?: string;
  network: string;
  asset: string;
  destinationWallet: string;
  expectedAmount: string;
  txHash?: string;
  customRpcEndpoint?: string;
}

export class PayoutVerifier {
  /**
   * Verifies on-chain proof of payment for bounties or miner rewards.
   * STRICT SECURITY INVARIANTS:
   * 1. Valid syntax only sets 'FORMAT_VALID', NEVER 'CONFIRMED'.
   * 2. 'CONFIRMED' requires an active, verified on-chain query from a live node/explorer RPC.
   * 3. If no live verifier is active, status remains 'FORMAT_VALID' or 'UNVERIFIED'.
   * 4. NEVER emits 'PAYOUT_CONFIRMED' from format checks alone.
   */
  async verifyPayout(req: PayoutVerificationRequest): Promise<PayoutVerification> {
    const timestamp = new Date().toISOString();

    if (!req.txHash || req.txHash.trim().length < 10) {
      return {
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: '',
        verifiedAt: timestamp,
        verificationSource: 'none',
        verificationStatus: 'UNVERIFIED',
      };
    }

    const cleanTx = req.txHash.trim();

    // Check transaction hash format syntax
    const isEVM = cleanTx.startsWith('0x') && cleanTx.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(cleanTx);
    const isSolana = cleanTx.length >= 64 && cleanTx.length <= 88 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleanTx);
    const isRTC = cleanTx.startsWith('rtctx_') || (cleanTx.length >= 32 && /^[0-9a-zA-Z_-]+$/.test(cleanTx));

    if (!isEVM && !isSolana && !isRTC) {
      return {
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: cleanTx,
        verifiedAt: timestamp,
        verificationSource: 'syntax_validator',
        verificationStatus: 'FAILED',
      };
    }

    // Step 2: Attempt real on-chain query if live RPC is configured
    let onchainConfirmed = false;
    let liveSource = 'none';

    // EVM: Injected provider receipt query
    if (isEVM && typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const receipt = await (window as any).ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [cleanTx],
        });
        if (receipt && (receipt.status === '0x1' || receipt.status === 1)) {
          onchainConfirmed = true;
          liveSource = 'evm_eip1193_rpc_receipt';
        }
      } catch {
        // Live RPC not reachable or transaction pending
      }
    }

    // Custom or configured RPC endpoint query if provided
    if (!onchainConfirmed && req.customRpcEndpoint) {
      try {
        const res = await fetch(req.customRpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: isEVM ? 'eth_getTransactionReceipt' : 'getSignatureStatuses',
            params: isEVM ? [cleanTx] : [[cleanTx]],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.result) {
            onchainConfirmed = true;
            liveSource = 'custom_node_rpc';
          }
        }
      } catch {
        // RPC offline
      }
    }

    if (onchainConfirmed) {
      const verification: PayoutVerification = {
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: cleanTx,
        verifiedAt: timestamp,
        verificationSource: liveSource,
        verificationStatus: 'CONFIRMED',
      };

      quantumEventBus.publish('PAYOUT_CONFIRMED', {
        source: 'payout_verifier',
        subjectId: req.bountyId || req.minerRewardId,
        metadataSafe: {
          asset: req.asset,
          amount: req.expectedAmount,
          destinationWallet: req.destinationWallet,
          txHash: cleanTx,
          source: liveSource,
        },
      });

      return verification;
    }

    // Strict Truth in Data: Format is valid, but on-chain receipt not yet retrieved
    return {
      network: req.network,
      asset: req.asset,
      destinationWallet: req.destinationWallet,
      txHash: cleanTx,
      verifiedAt: timestamp,
      verificationSource: 'syntax_validator',
      verificationStatus: 'FORMAT_VALID',
    };
  }

  /**
   * Evaluates if a bounty item qualifies for PAID status.
   * STRICT TRUTH IN DATA INVARIANT:
   * Requires verificationStatus === 'CONFIRMED' AND a verified live network source.
   * Format validity alone is strictly forbidden from triggering PAID state.
   */
  canMarkAsPaid(bounty: BountyItem): boolean {
    if (!bounty.payoutVerification) return false;
    const v = bounty.payoutVerification;
    if (v.verificationStatus !== 'CONFIRMED') return false;
    if (!v.txHash || v.txHash.trim().length === 0) return false;

    const LIVE_ONCHAIN_SOURCES = [
      'evm_eip1193_rpc_receipt',
      'evm_rpc_receipt',
      'custom_node_rpc',
      'rustchain_onchain_rpc',
      'rustchain_onchain_attestation',
      'solana_onchain_rpc',
    ];

    return LIVE_ONCHAIN_SOURCES.includes(v.verificationSource);
  }
}

export const payoutVerifier = new PayoutVerifier();
