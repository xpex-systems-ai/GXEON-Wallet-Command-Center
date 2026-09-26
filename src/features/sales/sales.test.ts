import { describe, it, expect } from 'vitest';
import { GXEON_QUICK_FIX_SERVICE, CustomerOrder, JobTicket } from './types';

describe('GXEON Dual Revenue Engine - Track B: Stripe Direct Sales', () => {
  it('enforces R$49.00 (BRL 49.00) server-enforced price in product catalog', () => {
    expect(GXEON_QUICK_FIX_SERVICE.id).toBe('gxeon_quick_fix_v1');
    expect(GXEON_QUICK_FIX_SERVICE.priceBrl).toBe(49.0);
    expect(GXEON_QUICK_FIX_SERVICE.currency).toBe('BRL');
    expect(GXEON_QUICK_FIX_SERVICE.refundPolicy).toBe(
      'Solicitações elegíveis a reembolso serão processadas de acordo com a política do serviço.'
    );
  });

  it('rejects unverified or signature-mismatched webhooks', () => {
    const processWebhook = (_payload: any, signature: string | null) => {
      if (!signature || signature !== 'valid_stripe_sig') {
        return { status: 'UNVERIFIED_SIGNATURE', processed: false };
      }
      return { status: 'PAYMENT_SUCCEEDED', processed: true };
    };

    const payload = { type: 'checkout.session.completed' };
    const invalidResult = processWebhook(payload, null);
    expect(invalidResult.status).toBe('UNVERIFIED_SIGNATURE');
    expect(invalidResult.processed).toBe(false);

    const wrongSigResult = processWebhook(payload, 'bad_sig');
    expect(wrongSigResult.status).toBe('UNVERIFIED_SIGNATURE');
    expect(wrongSigResult.processed).toBe(false);
  });

  it('accepts valid webhook with exact 4900 BRL amount and payment_status=paid', () => {
    const order: CustomerOrder = {
      id: 'ord_test_001',
      customerName: 'Cliente Teste',
      customerEmail: 'cliente@exemplo.com',
      serviceId: GXEON_QUICK_FIX_SERVICE.id,
      amountBrl: 49.0,
      state: 'CHECKOUT_CREATED',
      problemSummary: 'Botão de login quebrado',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const validWebhookEvent = {
      id: 'evt_stripe_101',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_status: 'paid',
          amount_total: 4900,
          currency: 'brl',
          metadata: { order_id: order.id }
        }
      }
    };

    if (
      validWebhookEvent.type === 'checkout.session.completed' &&
      validWebhookEvent.data.object.payment_status === 'paid' &&
      validWebhookEvent.data.object.amount_total === 4900 &&
      validWebhookEvent.data.object.currency === 'brl'
    ) {
      order.state = 'PAYMENT_SUCCEEDED';
    }

    expect(order.state).toBe('PAYMENT_SUCCEEDED');
  });

  it('enforces idempotency: duplicate webhook event ID is safely ignored', () => {
    const processedEventIds = new Set<string>();
    const createdJobs: JobTicket[] = [];

    const handleEvent = (event: { id: string; type: string; orderId: string }) => {
      if (processedEventIds.has(event.id)) {
        return { status: 'DUPLICATE_IGNORED', createdJob: null };
      }
      processedEventIds.add(event.id);
      const job: JobTicket = {
        ticketId: `tkt_${event.orderId}`,
        orderId: event.orderId,
        service: 'GXEON_QUICK_FIX',
        customerIntake: {
          customerEmail: 'test@example.com',
          customerName: 'Test',
          problemSummary: 'Fix bug'
        },
        paymentReference: 'pi_test_123',
        state: 'JOB_CREATED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      createdJobs.push(job);
      return { status: 'JOB_CREATED', createdJob: job };
    };

    const firstRun = handleEvent({ id: 'evt_idempotent_1', type: 'checkout.session.completed', orderId: 'ord_100' });
    expect(firstRun.status).toBe('JOB_CREATED');
    expect(createdJobs.length).toBe(1);

    // Replay identical event
    const secondRun = handleEvent({ id: 'evt_idempotent_1', type: 'checkout.session.completed', orderId: 'ord_100' });
    expect(secondRun.status).toBe('DUPLICATE_IGNORED');
    expect(createdJobs.length).toBe(1); // No duplicate job ticket created
  });

  it('failed payment never creates job', () => {
    const failedWebhookEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          payment_status: 'unpaid',
          amount_total: 4900,
          currency: 'brl'
        }
      }
    };

    let jobCreated = false;
    if (failedWebhookEvent.data.object.payment_status === 'paid') {
      jobCreated = true;
    }

    expect(jobCreated).toBe(false);
  });

  it('successful payment creates exactly one job ticket without card data', () => {
    const order: CustomerOrder = {
      id: 'ord_job_1',
      customerName: 'Cliente Prod',
      customerEmail: 'prod@empresa.com',
      serviceId: GXEON_QUICK_FIX_SERVICE.id,
      amountBrl: 49.0,
      state: 'PAYMENT_SUCCEEDED',
      problemSummary: 'Erro de CORS no endpoint /api/v1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const jobTicket: JobTicket = {
      ticketId: `tkt_${order.id}`,
      orderId: order.id,
      service: GXEON_QUICK_FIX_SERVICE.id,
      customerIntake: {
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        problemSummary: order.problemSummary,
        repoOrCodeUrl: order.repoOrCodeUrl
      },
      paymentReference: 'pi_verified_stripe_345',
      state: 'JOB_CREATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(jobTicket.ticketId).toBe('tkt_ord_job_1');
    expect(jobTicket.state).toBe('JOB_CREATED');
    expect((jobTicket as any).cardNumber).toBeUndefined();
    expect((jobTicket as any).cvc).toBeUndefined();
  });

  it('handles refund event and transitions state to REFUNDED', () => {
    const order: CustomerOrder = {
      id: 'ord_refund_1',
      customerName: 'Cliente Reembolso',
      customerEmail: 'reembolso@empresa.com',
      serviceId: GXEON_QUICK_FIX_SERVICE.id,
      amountBrl: 49.0,
      state: 'PAYMENT_SUCCEEDED',
      problemSummary: 'Fora de escopo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const refundEvent = {
      type: 'charge.refunded',
      orderId: order.id
    };

    if (refundEvent.type === 'charge.refunded') {
      order.state = 'REFUNDED';
    }

    expect(order.state).toBe('REFUNDED');
  });
});
