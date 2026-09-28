import { describe, it, expect, beforeEach } from 'vitest';
import { StripeServerService } from '../../../shared/stripe/stripeServerService';
import { validateCheckoutInput, canTransitionPaymentState } from '../../../shared/stripe/paymentValidation';
import { GXEON_SERVICES } from '../../../shared/stripe/paymentTypes';

describe('Unit Tests: Stripe Payment Validation & State Machine', () => {
  it('should validate valid checkout input payload', () => {
    const input = {
      requestId: 'req-stable-id-12345',
      customerName: 'Carlos Silva',
      customerEmail: 'carlos@example.com',
      problemSummary: 'TypeScript compilation issue in vite project after update',
      repoOrCodeUrl: 'https://github.com/my-org/my-repo',
    };

    const result = validateCheckoutInput(input);
    expect(result.valid).toBe(true);
    expect(result.data?.requestId).toBe('req-stable-id-12345');
    expect(result.data?.customerEmail).toBe('carlos@example.com');
  });

  it('should reject invalid emails in checkout payload', () => {
    const input = {
      requestId: 'req-stable-id-12345',
      customerName: 'Carlos Silva',
      customerEmail: 'invalid-email-format',
      problemSummary: 'TypeScript compilation issue in vite project after update',
      repoOrCodeUrl: 'https://github.com/my-org/my-repo',
    };

    const result = validateCheckoutInput(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('customerEmail');
  });

  it('should reject invalid or unsafe URLs', () => {
    const input = {
      requestId: 'req-stable-id-12345',
      customerName: 'Carlos Silva',
      customerEmail: 'carlos@example.com',
      problemSummary: 'TypeScript compilation issue in vite project after update',
      repoOrCodeUrl: 'javascript:alert(1)',
    };

    const result = validateCheckoutInput(input);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('repoOrCodeUrl');
  });

  it('should enforce Phase 6 finite state machine transitions', () => {
    // Valid transitions
    expect(canTransitionPaymentState('CUSTOMER_CREATED', 'CHECKOUT_CREATED')).toBe(true);
    expect(canTransitionPaymentState('CHECKOUT_CREATED', 'PAYMENT_PENDING')).toBe(true);
    expect(canTransitionPaymentState('PAYMENT_PENDING', 'PAYMENT_SUCCEEDED')).toBe(true);
    expect(canTransitionPaymentState('PAYMENT_SUCCEEDED', 'JOB_CREATED')).toBe(true);
    expect(canTransitionPaymentState('JOB_CREATED', 'EXECUTING')).toBe(true);
    expect(canTransitionPaymentState('EXECUTING', 'QA_PASSED')).toBe(true);
    expect(canTransitionPaymentState('QA_PASSED', 'DELIVERED')).toBe(true);
    expect(canTransitionPaymentState('DELIVERED', 'FUNDS_PENDING')).toBe(true);
    expect(canTransitionPaymentState('FUNDS_PENDING', 'FUNDS_AVAILABLE_STRIPE')).toBe(true);
    expect(canTransitionPaymentState('FUNDS_AVAILABLE_STRIPE', 'PAYOUT_PENDING')).toBe(true);
    expect(canTransitionPaymentState('PAYOUT_PENDING', 'PAYOUT_PAID_TO_BANK')).toBe(true);

    // Invalid shortcut transitions
    expect(canTransitionPaymentState('CHECKOUT_CREATED', 'PAYOUT_PAID_TO_BANK')).toBe(false);
    expect(canTransitionPaymentState('CUSTOMER_CREATED', 'PAYMENT_SUCCEEDED')).toBe(false);
    expect(canTransitionPaymentState('PAYOUT_PAID_TO_BANK', 'PAYMENT_PENDING')).toBe(false);
  });
});

describe('Unit Tests: StripeServerService Invariants & Service Pricing', () => {
  let service: StripeServerService;

  beforeEach(() => {
    service = new StripeServerService();
  });

  it('should report correct unconfigured status when no secret is provided', () => {
    const status = service.getStatus();
    expect(status.configured).toBe(false);
    expect(status.webhookConfigured).toBe(false);
    expect(status.liveMode).toBe(false);
    expect(status.activeService.unitAmountCents).toBe(4900);
    expect(status.activeService.currency).toBe('brl');
  });

  it('should enforce fixed R$ 49.00 (4900 BRL) server-authoritative service pricing', () => {
    const quickFix = GXEON_SERVICES.gxeon_quick_fix_v1;
    expect(quickFix.unitAmountCents).toBe(4900);
    expect(quickFix.currency).toBe('brl');
  });

  it('should reject webhook calls without proper server configuration', async () => {
    await expect(service.handleWebhook(Buffer.from('{}'), undefined)).rejects.toThrow(
      'Webhook handling requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET'
    );
  });
});
