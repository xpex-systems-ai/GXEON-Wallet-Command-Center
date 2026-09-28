import { getX402Price } from './pricing.js';
import { X402_NETWORKS } from './networks.js';
import { X402Challenge, X402PaymentProof, X402Receipt } from './types.js';
import { verifyX402Settlement } from './settlementVerifier.js';
import { createX402Receipt } from './receipt.js';
import { executeUrlVerifyWorker, UrlVerifyInput } from '../workers/urlVerifyWorker.js';
import { executeJsonValidateWorker, JsonValidateInput } from '../workers/jsonValidateWorker.js';
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

  // 1. Calculate Quantity & Atomic Price
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

  // 2. Extract Payment Proof from Headers or Body
  const rawProofHeader =
    headers['x-payment-proof'] ||
    headers['X-PAYMENT-PROOF'] ||
    headers['payment-proof'] ||
    headers['x-payment-txhash'];

  let proof: X402PaymentProof | null = null;
  if (typeof rawProofHeader === 'string' && rawProofHeader.trim()) {
    try {
      if (rawProofHeader.trim().startsWith('{')) {
        proof = JSON.parse(rawProofHeader);
      } else {
        // Plain transaction hash in header, defaults to Base mainnet
        proof = {
          network: 'eip155:8453',
          txHash: rawProofHeader.trim(),
        };
      }
    } catch {
      // Fallback plain string
      proof = {
        network: 'eip155:8453',
        txHash: rawProofHeader.trim(),
      };
    }
  } else if (input && typeof input.paymentProof === 'object') {
    proof = input.paymentProof as X402PaymentProof;
  }

  // 3. Challenge when proof is missing
  if (!proof) {
    const challenge: X402Challenge = {
      x402Version: 2,
      status: 402,
      title: 'Payment Required',
      description: `GXEON autonomous capability execution requires valid x402 micro-USDC payment proof of ${pricing.amountUsdc} USDC (${pricing.amountAtomic} atomic units).`,
      resource: resourceUrl,
      serviceId,
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          asset: X402_NETWORKS['eip155:8453'].usdcAsset,
          amount: pricing.amountAtomic,
          payTo: X402_NETWORKS['eip155:8453'].treasuryPayTo,
          maxTimeoutSeconds: 300,
          resource: resourceUrl,
          extra: { name: 'USD Coin', version: '2' },
        },
        {
          scheme: 'exact',
          network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          asset: X402_NETWORKS['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'].usdcAsset,
          amount: pricing.amountAtomic,
          payTo: X402_NETWORKS['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'].treasuryPayTo,
          maxTimeoutSeconds: 300,
          resource: resourceUrl,
          extra: { name: 'USD Coin' },
        },
      ],
    };

    return {
      statusCode: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-402-Version': '2',
        'X-Accepts': JSON.stringify(challenge.accepts),
      },
      body: challenge,
    };
  }

  // 4. Verify Settlement On-Chain (FAIL-CLOSED)
  const verification = await verifyX402Settlement(proof, pricing.amountAtomic, serviceId);
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
        message: verification.error || 'Payment proof verification failed on-chain',
        details: verification,
      },
    };
  }

  // 5. Execute Capability Worker in Isolated Sandbox
  const jobId = `job_x402_${verification.settlementId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  let workerResult: unknown;

  try {
    if (serviceId === 'gxeon_url_verify_v1') {
      workerResult = await executeUrlVerifyWorker(input as UrlVerifyInput);
    } else if (serviceId === 'gxeon_json_validate_v1') {
      workerResult = executeJsonValidateWorker(input as JsonValidateInput);
    } else {
      throw new Error(`Capability ${serviceId} is not supported`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'EXECUTION_FAILED', message: msg },
    };
  }

  // 6. Generate Immutable Cryptographic Receipt
  const receipt: X402Receipt = createX402Receipt({
    buyer: verification.payer,
    serviceId,
    quantity,
    amountAtomic: verification.amountAtomic,
    network: verification.network,
    settlementId: verification.settlementId,
    jobId,
  });

  // 7. Persist Job and Settlement to Prevent Replay
  const store = getAgentEconomyStore();
  const now = new Date().toISOString();
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
  } catch (err) {
    console.warn('[X402] Failed to persist job ticket:', err);
  }

  // 8. Return 200 OK with Execution Output + Immutable Receipt
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-402-Receipt': receipt.receiptId,
      'X-402-Settlement': receipt.settlementId,
    },
    body: {
      status: 'SUCCESS',
      serviceId,
      result: workerResult,
      receipt,
    },
  };
}
