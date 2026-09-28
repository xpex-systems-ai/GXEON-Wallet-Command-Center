import crypto from 'node:crypto';
import { X402Receipt } from './types.js';

export function createX402Receipt(params: {
  buyer: string;
  serviceId: string;
  quantity: number;
  amountAtomic: string;
  network: string;
  settlementId: string;
  txHash: string;
  blockNumber: string | number;
  jobId: string;
  result: unknown;
}): X402Receipt {
  const receiptId = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const amountUsdc = (Number(params.amountAtomic) / 1_000_000).toFixed(6);

  // Hash of worker result
  const resultJson = JSON.stringify(params.result ?? {});
  const resultHash = crypto.createHash('sha256').update(resultJson).digest('hex');

  // Canonical Evidence Hash
  const hashContent = [
    receiptId,
    'GXEON',
    params.buyer,
    params.serviceId,
    String(params.quantity),
    params.amountAtomic,
    amountUsdc,
    params.network,
    params.settlementId,
    params.txHash,
    String(params.blockNumber),
    params.jobId,
    resultHash,
    createdAt,
  ].join('|');

  const evidenceHash = crypto.createHash('sha256').update(hashContent).digest('hex');

  return {
    receiptId,
    seller: 'GXEON',
    buyer: params.buyer,
    serviceId: params.serviceId,
    quantity: params.quantity,
    paymentRail: 'x402',
    currency: 'USDC',
    amountAtomic: params.amountAtomic,
    amountUsdc,
    network: params.network,
    settlementId: params.settlementId,
    txHash: params.txHash,
    blockNumber: params.blockNumber,
    jobId: params.jobId,
    resultHash,
    evidenceHash,
    createdAt,
  };
}
