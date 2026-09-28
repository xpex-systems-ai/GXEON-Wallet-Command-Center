import crypto from 'node:crypto';
import { Quote } from './types.js';
import { getService } from './services/registry.js';
import { getAgentEconomyStore } from './store.js';

const QUOTE_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes

export function computeQuoteHash(
  quoteId: string,
  serviceId: string,
  quantity: number,
  totalCredits: number,
  expiresAt: string,
  accountId: string
): string {
  const content = `${quoteId}:${serviceId}:${quantity}:${totalCredits}:${expiresAt}:${accountId}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface CreateQuoteParams {
  accountId: string;
  serviceId: string;
  quantity: number;
}

export interface QuoteResult {
  success: boolean;
  quote?: Quote;
  errorCode?: 'SERVICE_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_INPUT';
  message?: string;
}

export async function createQuote(params: CreateQuoteParams): Promise<QuoteResult> {
  const service = getService(params.serviceId);
  if (!service) {
    return {
      success: false,
      errorCode: 'SERVICE_NOT_FOUND',
      message: `Unknown capability service: ${params.serviceId}`,
    };
  }

  if (service.status !== 'AVAILABLE') {
    return {
      success: false,
      errorCode: 'SERVICE_UNAVAILABLE',
      message: `Capability service ${params.serviceId} is currently in ${service.status} mode and not available for quotes`,
    };
  }

  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      message: 'Quantity must be a positive integer',
    };
  }

  if (params.quantity > service.maxBatch) {
    return {
      success: false,
      errorCode: 'INVALID_INPUT',
      message: `Quantity ${params.quantity} exceeds service maxBatch limit of ${service.maxBatch}`,
    };
  }

  const quoteId = `quo_${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_VALIDITY_MS).toISOString();

  const totalCredits = Math.max(
    service.minimumChargeCredits,
    params.quantity * service.unitPriceCredits
  );

  const quoteHash = computeQuoteHash(
    quoteId,
    service.serviceId,
    params.quantity,
    totalCredits,
    expiresAt,
    params.accountId
  );

  const quote: Quote = {
    quoteId,
    serviceId: service.serviceId,
    quantity: params.quantity,
    unitPriceCredits: service.unitPriceCredits,
    totalCredits,
    expiresAt,
    quoteHash,
    accountId: params.accountId,
    createdAt: now.toISOString(),
  };

  const store = getAgentEconomyStore();
  await store.saveQuote(quote);

  return {
    success: true,
    quote,
  };
}

export interface ValidateQuoteResult {
  valid: boolean;
  quote?: Quote;
  errorCode?: 'QUOTE_INVALID' | 'QUOTE_EXPIRED' | 'QUANTITY_MISMATCH';
  message?: string;
}

export async function validateQuote(
  quoteId: string,
  accountId: string,
  expectedQuantity?: number
): Promise<ValidateQuoteResult> {
  const store = getAgentEconomyStore();
  const quote = await store.getQuote(quoteId);

  if (!quote) {
    return {
      valid: false,
      errorCode: 'QUOTE_INVALID',
      message: `Quote ${quoteId} not found`,
    };
  }

  // Tenant isolation
  if (quote.accountId !== accountId) {
    return {
      valid: false,
      errorCode: 'QUOTE_INVALID',
      message: 'Quote does not belong to this account',
    };
  }

  // Hash verification for immutability and anti-tamper
  const expectedHash = computeQuoteHash(
    quote.quoteId,
    quote.serviceId,
    quote.quantity,
    quote.totalCredits,
    quote.expiresAt,
    quote.accountId
  );

  if (quote.quoteHash !== expectedHash) {
    return {
      valid: false,
      errorCode: 'QUOTE_INVALID',
      message: 'Quote hash integrity check failed (tampered quote)',
    };
  }

  // Expiration check
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    return {
      valid: false,
      errorCode: 'QUOTE_EXPIRED',
      message: `Quote expired at ${quote.expiresAt}`,
    };
  }

  // Quantity check if specified
  if (expectedQuantity !== undefined && expectedQuantity > quote.quantity) {
    return {
      valid: false,
      errorCode: 'QUANTITY_MISMATCH',
      message: `Input quantity (${expectedQuantity}) exceeds quoted quantity (${quote.quantity})`,
    };
  }

  return {
    valid: true,
    quote,
  };
}
