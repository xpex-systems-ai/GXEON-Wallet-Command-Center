import crypto from 'node:crypto';
import { X402Receipt } from './types.js';

export function createX402Receipt(params: {
  buyer: string;
  serviceId: string;
  quantity: number;
  amountAtomic: string;
  network: string;
  settlementId: string;
  jobId: string;
}): X402Receipt {
  const receiptId = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = new Date().toISOString();
  const amountUsdc = (Number(params.amountAtomic) / 1_000_000).toFixed(6);

  const hashContent = [
    receiptId,
    'GXEON',
    params.buyer,
    params.serviceId,
    String(params.quantity),
    params.amountAtomic,
    params.network,
    params.settlementId,
    params.jobId,
    timestamp,
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
    amount: amountUsdc,
    amountAtomic: params.amountAtomic,
    network: params.network,
    settlementId: params.settlementId,
    jobId: params.jobId,
    evidenceHash,
    timestamp,
  };
}
