import { getX402Price } from './pricing.js';
import { getNetwork, getTreasuryStatus } from './networks.js';
import {
  X402Challenge,
  X402PaymentProof,
  X402Receipt,
  X402SettlementRecord,
  X402PaymentPayload,
  X402SettlementResponse,
} from './types.js';
import { verifyX402Settlement } from './settlementVerifier.js';
import { createX402Receipt } from './receipt.js';
import { executeUrlVerifyWorker, UrlVerifyInput } from '../workers/urlVerifyWorker.js';
import { executeJsonValidateWorker } from '../workers/jsonValidateWorker.js';
import { getAgentEconomyStore } from '../store.js';
import { Job } from '../types.js';

export interface X402HandlerResult {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

export async function handleX402CapabilityExecution(options: {
  serviceId: string;
  input: any;
  headers: Record<string, string | string[] | undefined>;
  resourceUrl: string;
}): Promise<X402HandlerResult> {
  const { serviceId, input, headers, resourceUrl } = options;
  const store = getAgentEconomyStore();

  // 1. Killswitch Check: Autonomous Selling Control
  if (process.env.GXEON_AUTONOMOUS_SELLING_ENABLED !== 'true') {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'SELLING_DISABLED',
        message: 'Autonomous capability selling is currently suspended by operator killswitch (GXEON_AUTONOMOUS_SELLING_ENABLED != true)',
      },
    };
  }

  // 2. Treasury Ownership Gate (Section 4 & 5)
  const treasury = getTreasuryStatus();
  if (treasury.status !== 'TREASURY_VERIFIED') {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'TREASURY_NOT_CONFIGURED',
        message: treasury.error || 'Treasury address has not passed operational verification gate (GXEON_TREASURY_VERIFIED != true)',
      },
    };
  }

  // 3. Supported Capabilities Gate
  const allowed = ['gxeon_json_validate_v1', 'gxeon_url_verify_v1'];
  if (!allowed.includes(serviceId)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'UNSUPPORTED_CAPABILITY', message: `Capability ${serviceId} is not available via x402 rail` },
    };
  }

  // 4. Calculate Quantity & Atomic Price
  let quantity = 1;
  if (serviceId === 'gxeon_url_verify_v1' && Array.isArray(input?.urls)) {
    quantity = Math.max(1, input.urls.length);
  }

  let pricing;
  try {
    pricing = getX402Price(serviceId, quantity);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: msg },
    };
  }

  // 5. Extract Payment Signature / Proof from Headers or Body
  const rawSignatureHeader =
    headers['payment-signature'] ||
    headers['PAYMENT-SIGNATURE'] ||
    headers['Payment-Signature'] ||
    headers['x-payment-proof'] ||
    headers['X-PAYMENT-PROOF'] ||
    headers['x-payment-txhash'];

  let paymentData: X402PaymentPayload | X402PaymentProof | null = null;
  const rawSig = typeof rawSignatureHeader === 'string' ? rawSignatureHeader.trim() : '';

  if (rawSig) {
    try {
      if (rawSig.startsWith('{')) {
        paymentData = JSON.parse(rawSig);
      } else if (rawSig.startsWith('ey') || rawSig.startsWith('ew')) {
        // Canonical Base64 encoded JSON
        const decoded = Buffer.from(rawSig, 'base64').toString('utf-8');
        paymentData = JSON.parse(decoded);
      } else {
        // Plain transaction hash
        paymentData = {
          network: 'eip155:8453',
          txHash: rawSig,
        };
      }
    } catch {
      paymentData = {
        network: 'eip155:8453',
        txHash: rawSig,
      };
    }
  } else if (input && typeof input.paymentPayload === 'object') {
    paymentData = input.paymentPayload as X402PaymentPayload;
  } else if (input && typeof input.paymentProof === 'object') {
    paymentData = input.paymentProof as X402PaymentProof;
  }

  // 6. Challenge when Payment is Missing (Canonical x402 V2 Transport)
  if (!paymentData) {
    await store.recordSecurityEvent('paymentChallenges');
    const baseNetwork = getNetwork('eip155:8453')!;

    const challenge: X402Challenge = {
      x402Version: 2,
      status: 402,
      title: 'Payment Required',
      description: `GXEON autonomous capability execution requires valid x402 micro-USDC payment of ${pricing.amountUsdc} USDC (${pricing.amountAtomic} atomic units) on Base Mainnet.`,
      resource: resourceUrl,
      serviceId,
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          asset: baseNetwork.usdcAsset,
          amount: pricing.amountAtomic,
          payTo: baseNetwork.treasuryPayTo,
          maxTimeoutSeconds: 60,
          resource: resourceUrl,
          extra: {
            name: 'USD Coin',
            version: '2',
            assetTransferMethod: 'eip3009',
          },
        },
      ],
    };

    const challengeJson = JSON.stringify(challenge);
    const challengeBase64 = Buffer.from(challengeJson, 'utf-8').toString('base64');

    return {
      statusCode: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': challengeBase64,
        'payment-required': challengeBase64,
        'X-402-Version': '2',
        'X-Accepts': JSON.stringify(challenge.accepts),
      },
      body: challenge,
    };
  }

  // 7. Verify Settlement (EIP-3009 or Upfront On-Chain)
  const verification = await verifyX402Settlement(paymentData, pricing.amountAtomic, serviceId);
  if (!verification.verified) {
    return {
      statusCode: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-402-Version': '2',
      },
      body: {
        status: 402,
        error: 'PAYMENT_VERIFICATION_FAILED',
        message: verification.error || 'Payment proof verification failed',
        details: verification,
      },
    };
  }

  // 8. ATOMIC SETTLEMENT CLAIM (Section 7)
  const settlementRecord: X402SettlementRecord = {
    txHash: verification.txHash,
    settlementId: verification.settlementId,
    network: verification.network,
    payer: verification.payer,
    recipient: verification.recipient,
    asset: verification.asset,
    amountAtomic: verification.amountAtomic,
    amountUsdc: verification.amountUsdc,
    serviceId,
    quantity,
    state: 'CLAIMED',
    claimedAt: new Date().toISOString(),
    blockNumber: verification.blockNumber,
  };

  const claimResult = await store.claimX402Settlement(settlementRecord);
  if (!claimResult.claimed) {
    await store.recordSecurityEvent('replaysBlocked');
    return {
      statusCode: 409,
      headers: {
        'Content-Type': 'application/json',
        'X-402-Version': '2',
      },
      body: {
        status: 409,
        error: 'REPLAY_BLOCKED',
        message: 'Settlement nonce or transaction hash has already been consumed and claimed',
      },
    };
  }

  // 9. Execute Capability Worker in Isolated Sandbox
  const jobId = `job_x402_${verification.settlementId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  await store.updateX402Settlement(verification.txHash, { state: 'EXECUTING', jobId });

  let workerResult: unknown;
  try {
    if (serviceId === 'gxeon_url_verify_v1') {
      workerResult = await executeUrlVerifyWorker(input as UrlVerifyInput);
    } else if (serviceId === 'gxeon_json_validate_v1') {
      const raw = typeof input?.rawJson === 'string' ? input.rawJson : JSON.stringify(input?.payload ?? input);
      workerResult = executeJsonValidateWorker({ payload: raw });
    }
  } catch (err: unknown) {
    await store.updateX402Settlement(verification.txHash, { state: 'FAILED' });
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'EXECUTION_FAILED', message: msg },
    };
  }

  // 10. Generate Canonical Cryptographic Receipt
  const receipt: X402Receipt = createX402Receipt({
    buyer: verification.payer,
    serviceId,
    quantity,
    amountAtomic: verification.amountAtomic,
    network: verification.network,
    settlementId: verification.settlementId,
    txHash: verification.txHash,
    blockNumber: verification.blockNumber || 0,
    jobId,
    result: workerResult,
  });

  // 11. Persist Receipt and Machine Revenue Record BEFORE Responding
  const now = new Date().toISOString();
  await store.saveX402Receipt(receipt);

  await store.saveMachineRevenue({
    revenueId: `rev_${receipt.receiptId}`,
    rail: 'x402',
    asset: 'USDC',
    network: verification.network,
    txHash: verification.txHash,
    serviceId,
    buyer: verification.payer,
    amountAtomic: verification.amountAtomic,
    amountUsdc: verification.amountUsdc,
    status: 'SETTLED',
    verifiedAt: now,
    jobId,
    receiptId: receipt.receiptId,
  });

  // 12. Retention Agent Customer Logging
  await store.recordMachineCustomerPurchase(verification.payer, serviceId, verification.amountUsdc);

  // 13. Persist Job Record & Update Settlement to DELIVERED
  const jobTicket: Job = {
    jobId,
    accountId: `x402_buyer_${verification.payer}`,
    serviceId,
    quoteId: `x402_quote_${verification.settlementId}`,
    state: 'COMPLETED',
    financialState: 'CREDITS_SETTLED',
    input: input as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    workerId: 'worker_x402_gateway',
  };

  try {
    await store.saveJob(jobTicket);
    await store.saveJobResult({
      jobId,
      serviceId,
      state: 'COMPLETED',
      summary: {
        total: 1,
        healthy: 1,
        failed: 0,
      },
      results: [workerResult],
      completedAt: now,
    });
    await store.updateX402Settlement(verification.txHash, { state: 'DELIVERED' });
  } catch (err) {
    console.warn('[X402] Failed to persist job ticket:', err);
  }

  // 14. Canonical x402 V2 PAYMENT-RESPONSE Header (Base64)
  const settlementResponse: X402SettlementResponse = {
    x402Version: 2,
    status: 'SUCCESS',
    settlementId: receipt.settlementId,
    txHash: receipt.txHash,
    blockNumber: receipt.blockNumber,
    receiptId: receipt.receiptId,
    amountUsdc: receipt.amountUsdc,
    serviceId,
    timestamp: receipt.createdAt,
  };

  const responseJson = JSON.stringify(settlementResponse);
  const responseBase64 = Buffer.from(responseJson, 'utf-8').toString('base64');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-RESPONSE': responseBase64,
      'payment-response': responseBase64,
      'X-402-Receipt': receipt.receiptId,
      'X-402-Settlement': receipt.settlementId,
    },
    body: {
      status: 'SUCCESS',
      serviceId,
      result: workerResult,
      receipt,
      settlementResponse,
    },
  };
}
