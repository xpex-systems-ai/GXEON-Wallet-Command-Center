import { createHash } from 'node:crypto';
import { getAgentEconomyStore } from '../store.js';
import { executeCsvAuditWorker, type CsvAuditInput } from '../workers/csvAuditWorker.js';
import { executeJsonValidateWorker, type JsonValidateInput } from '../workers/jsonValidateWorker.js';
import { getNetwork } from './networks.js';
import { getX402Price, X402_SERVICE_PATHS } from './pricing.js';
import { createX402Receipt } from './receipt.js';
import { describeX402Service } from './discovery.js';
import { getX402Readiness, X402_BASE_NETWORK } from './readiness.js';
import { getPaymentPayload, verifyX402Settlement } from './settlementVerifier.js';
import type { X402AcceptOption, X402Challenge, X402Receipt, X402SettlementRecord, X402SettlementResponse } from './types.js';

export interface X402HandlerResult {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-402-Version': '2' };
const ACTIVE_SERVICES = Object.keys(X402_SERVICE_PATHS);

function response(statusCode: number, body: unknown, headers?: Record<string, string>): X402HandlerResult {
  return { statusCode, headers: { ...JSON_HEADERS, ...headers }, body };
}

function deliveryResponse(receipt: X402Receipt, result: unknown) {
  const settlement: X402SettlementResponse = {
    x402Version: 2,
    status: 'SUCCESS',
    success: true,
    transaction: receipt.txHash,
    network: receipt.network,
    payer: receipt.buyer,
    settlementId: receipt.settlementId,
    txHash: receipt.txHash,
    blockNumber: receipt.blockNumber,
    receiptId: receipt.receiptId,
    amountUsdc: receipt.amountUsdc,
    serviceId: receipt.serviceId,
    timestamp: receipt.createdAt,
  };
  const paymentResponse = Buffer.from(JSON.stringify(settlement)).toString('base64');
  return response(200, { status: 'SUCCESS', serviceId: receipt.serviceId, result, receipt }, {
    'PAYMENT-RESPONSE': paymentResponse,
    'X-402-Receipt': receipt.receiptId,
    'X-402-Settlement': receipt.settlementId,
  });
}

function retryDelivery(error: string, message: string, retryAfter: string): X402HandlerResult {
  return response(503, {
    error,
    message,
    retry: { method: 'POST', reuseRequestBody: true, reusePaymentSignature: true },
  }, { 'Retry-After': retryAfter });
}

async function replayDelivery(store: ReturnType<typeof getAgentEconomyStore>, settlement: X402SettlementRecord) {
  const [receipt, jobResult] = await Promise.all([
    settlement.receiptId ? store.getX402Receipt(settlement.receiptId) : null,
    settlement.jobId ? store.getJobResult(settlement.jobId) : null,
  ]);
  if (!receipt || !jobResult || jobResult.results.length === 0) {
    return retryDelivery('DELIVERY_UNAVAILABLE', 'Retry the original request.', '5');
  }
  return deliveryResponse(receipt, jobResult.results[0]);
}

function baseUsdcRequirements(amount: string, payTo: string): X402AcceptOption {
  const base = getNetwork(X402_BASE_NETWORK)!;
  return {
    scheme: 'exact',
    network: X402_BASE_NETWORK,
    asset: base.usdcAsset,
    amount,
    payTo,
    maxTimeoutSeconds: 60,
    extra: { name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009' },
  };
}

export async function handleX402Discovery(origin: string): Promise<X402HandlerResult> {
  const readiness = await getX402Readiness();
  if (!readiness.enabled) return response(503, { error: readiness.error });

  const resources = Object.entries(X402_SERVICE_PATHS).flatMap(([serviceId, path]) => {
    const url = new URL(path, origin).href;
    const discovery = describeX402Service(serviceId, url);
    if (!discovery) return [];
    return [{
      resource: url,
      method: 'POST',
      description: discovery.resource.description,
      accepts: [baseUsdcRequirements(getX402Price(serviceId).amountAtomic, readiness.payTo)],
      extensions: discovery.extensions,
    }];
  });
  return response(200, { x402Version: 2, resources });
}

export async function handleX402CapabilityExecution(options: {
  serviceId: string;
  input: unknown;
  headers: Record<string, string | string[] | undefined>;
  resourceUrl: string;
}): Promise<X402HandlerResult> {
  const { serviceId, input, headers, resourceUrl } = options;
  const discovery = ACTIVE_SERVICES.includes(serviceId) ? describeX402Service(serviceId, resourceUrl) : null;
  if (!discovery) {
    return response(404, { error: 'UNSUPPORTED_CAPABILITY', message: 'This capability is unavailable over x402.' });
  }

  const readiness = await getX402Readiness();
  if (!readiness.enabled) return response(503, { error: readiness.error, message: readiness.reason });

  const store = getAgentEconomyStore();
  const { amountAtomic, amountUsdc } = getX402Price(serviceId);
  const requirements = baseUsdcRequirements(amountAtomic, readiness.payTo);
  const signatureHeader = Object.entries(headers).find(([key]) => key.toLowerCase() === 'payment-signature')?.[1];
  const payment = typeof signatureHeader === 'string'
    ? getPaymentPayload(signatureHeader.trim(), requirements, resourceUrl)
    : null;
  if (!payment) {
    const challenge: X402Challenge = {
      x402Version: 2,
      status: 402,
      title: 'Payment Required',
      error: signatureHeader ? 'PAYMENT_VERIFICATION_FAILED' : 'Payment signature required.',
      ...discovery,
      serviceId,
      accepts: [requirements],
    };
    const encoded = Buffer.from(JSON.stringify(challenge), 'utf8').toString('base64');
    return response(402, challenge, { 'PAYMENT-REQUIRED': encoded });
  }

  let result: ReturnType<typeof executeCsvAuditWorker> | ReturnType<typeof executeJsonValidateWorker>;
  let inputHash: string;
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object.');
    const data = input as Record<string, unknown>;
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > 2_100_000) throw new Error('Request exceeds the maximum supported size.');
    inputHash = createHash('sha256').update(serialized).digest('hex');
    if (serviceId === 'gxeon_csv_audit_v1') {
      result = executeCsvAuditWorker(data as unknown as CsvAuditInput);
    } else {
      if (!Object.prototype.hasOwnProperty.call(data, 'payload') && typeof data.rawJson !== 'string') {
        throw new Error('Provide the JSON to validate in the payload field.');
      }
      result = executeJsonValidateWorker({
        payload: typeof data.rawJson === 'string' ? data.rawJson : data.payload,
        schema: data.schema as JsonValidateInput['schema'],
      });
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Invalid capability input.';
    return response(400, { error: 'INVALID_INPUT', message });
  }

  const requestHash = createHash('sha256').update(JSON.stringify([serviceId, inputHash, payment])).digest('hex');
  // Discovery metadata can change after a payment intent has been reserved.
  const paymentResult = await verifyX402Settlement({ ...payment, ...discovery }, requestHash);
  if (paymentResult.kind === 'pending') {
    return retryDelivery('SETTLEMENT_PENDING', 'Wait for Base finality, then retry the same request and payment signature.', '30');
  }
  if (paymentResult.kind === 'delivered') return replayDelivery(store, paymentResult.settlement);
  if (paymentResult.kind === 'conflict') {
    await store.recordSecurityEvent('replaysBlocked');
    return response(409, { error: 'PAYMENT_ALREADY_BOUND', message: 'The payment is bound to a different request.' });
  }
  if (paymentResult.kind === 'invalid') {
    await store.recordSecurityEvent('invalidPaymentsBlocked');
    return response(402, { error: 'PAYMENT_VERIFICATION_FAILED', message: paymentResult.message });
  }

  const { settlementId, txHash, blockNumber } = paymentResult.proof;
  const jobId = 'job_x402_' + txHash.slice(2);
  const payer = payment.payload.authorization.from;
  const receipt = createX402Receipt({
    buyer: payer, serviceId, quantity: 1, amountAtomic, network: X402_BASE_NETWORK,
    settlementId, txHash, blockNumber, jobId, result,
  });
  const now = receipt.createdAt;
  const passed = 'valid' in result ? result.valid : result.qualityPass;

  const committed = await store.commitX402Delivery({
    settlement: {
      txHash, settlementId, network: X402_BASE_NETWORK, payer, recipient: readiness.payTo,
      asset: requirements.asset, amountAtomic, amountUsdc, serviceId, quantity: 1,
      state: 'DELIVERED', claimedAt: now, blockNumber, jobId, receiptId: receipt.receiptId,
    },
    receipt,
    revenue: {
      revenueId: 'rev_' + receipt.receiptId, rail: 'x402', asset: 'USDC', network: X402_BASE_NETWORK,
      txHash, serviceId, buyer: payer, amountAtomic, amountUsdc, status: 'SETTLED',
      verifiedAt: now, jobId, receiptId: receipt.receiptId,
    },
    job: {
      jobId, accountId: 'x402_buyer_' + payer, serviceId, quoteId: 'x402_quote_' + settlementId,
      state: 'COMPLETED', financialState: 'CREDITS_SETTLED', input: { sha256: inputHash }, createdAt: now,
      updatedAt: now, completedAt: now, workerId: 'worker_x402_gateway',
    },
    result: {
      jobId, serviceId, state: 'COMPLETED', summary: { total: 1, healthy: passed ? 1 : 0, failed: passed ? 0 : 1 },
      results: [result], completedAt: now,
    },
  });
  if (committed) return deliveryResponse(receipt, result);

  const stored = await store.getX402Settlement(txHash);
  if (stored?.settlementId !== settlementId || stored.serviceId !== serviceId || !stored.receiptId) {
    await store.recordSecurityEvent('replaysBlocked');
    return response(409, { error: 'SETTLEMENT_ALREADY_USED' });
  }
  return replayDelivery(store, stored);
}
