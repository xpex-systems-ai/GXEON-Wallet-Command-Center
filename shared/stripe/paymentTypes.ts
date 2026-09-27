/**
 * GXEON Dual Revenue Engine — Authoritative Payment Types & State Machine
 * Security Invariant: Client never defines amount, currency, or transitions payment states directly.
 */

export type PaymentState =
  | 'CUSTOMER_CREATED'
  | 'CHECKOUT_CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_SUCCEEDED'
  | 'JOB_CREATED'
  | 'EXECUTING'
  | 'QA_PASSED'
  | 'DELIVERED'
  | 'FUNDS_PENDING'
  | 'FUNDS_AVAILABLE_STRIPE'
  | 'PAYOUT_PENDING'
  | 'PAYOUT_PAID_TO_BANK'
  | 'FAILED'
  | 'REFUNDED';

export type JobStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'QA_VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  unitAmountCents: number; // In smallest currency unit, e.g. 4900 = R$ 49.00
  currency: 'brl';
  active: boolean;
}

export const GXEON_SERVICES: Record<string, ServiceDefinition> = {
  gxeon_quick_fix_v1: {
    id: 'gxeon_quick_fix_v1',
    name: 'GXEON Quick Fix V1',
    description: 'Autonomous rapid bug triage, environment configuration, and codebase diagnosis.',
    unitAmountCents: 4900, // Fixed R$ 49.00
    currency: 'brl',
    active: true,
  },
};

export interface CheckoutRequestPayload {
  requestId: string;
  customerName: string;
  customerEmail: string;
  problemSummary: string;
  repoOrCodeUrl: string;
}

export interface OrderRecord {
  orderId: string;
  requestId: string;
  serviceId: string;
  amountTotal: number; // 4900
  currency: string;    // 'brl'
  customerName: string;
  customerEmail: string;
  problemSummary: string;
  repoOrCodeUrl: string;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  checkoutUrl: string | null;
  state: PaymentState;
  stateHistory: {
    state: PaymentState;
    timestamp: string;
    note?: string;
  }[];
  createdAt: string;
  updatedAt: string;
  liveMode: boolean; // Always false in current money truth
}

export interface JobRecord {
  jobId: string;
  orderId: string;
  requestId: string;
  serviceId: string;
  customerEmail: string;
  problemSummary: string;
  repoOrCodeUrl: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  assignedEngine: string;
  executionLogs: string[];
}

export interface ProcessedStripeEvent {
  eventId: string;
  eventType: string;
  sessionId: string;
  orderId: string;
  processedAt: string;
  status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'ERROR';
}

export interface PaymentIntentMapping {
  paymentIntentId: string;
  orderId: string;
  stripeSessionId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface CheckoutResponse {
  success: boolean;
  orderId: string;
  requestId: string;
  checkoutUrl: string;
  stripeSessionId: string;
  state: PaymentState;
  isExisting: boolean;
  liveMode: boolean;
}
