import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { GXEON_QUICK_FIX_SERVICE, CustomerOrder } from './types';
import {
  StripeServerService,
  InMemoryFirestoreAdapter
} from '../../server/stripeServerService';
import { SalesClientService } from '../../services/salesClientService';
import {
  handleCheckoutEndpoint,
  handleStripeWebhookEndpoint
} from '../../server/httpEndpoints';

describe('GXEON Dual Revenue Engine - Track B: Stripe Direct Sales (PR #4 Hardened Round 3)', () => {
  let memoryDb: InMemoryFirestoreAdapter;
  let mockStripe: Stripe;

  const TEST_WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests_12345';
  const SERVER_PUBLIC_URL = 'https://gxeon.xpex.systems';

  beforeEach(() => {
    memoryDb = new InMemoryFirestoreAdapter();

    mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockImplementation(async (params: any) => {
            return {
              id: 'cs_test_session_999',
              url: `https://checkout.stripe.com/c/pay/cs_test_session_999`,
              payment_status: 'unpaid',
              amount_total: params.line_items[0].price_data.unit_amount,
              currency: params.line_items[0].price_data.currency
            };
          })
        }
      },
      webhooks: {
        constructEvent: vi.fn().mockImplementation((payload: any, sig: string, secret: string) => {
          if (sig !== 'valid_signed_header' || secret !== TEST_WEBHOOK_SECRET) {
            throw new Error('Stripe signature verification failed');
          }
          const raw = typeof payload === 'string' ? payload : payload.toString();
          return JSON.parse(raw);
        })
      }
    } as unknown as Stripe;
  });

  describe('Product Catalog & Zero-Trust Pricing', () => {
    it('enforces R$49.00 (BRL 49.00) server-enforced price in product catalog', () => {
      expect(GXEON_QUICK_FIX_SERVICE.id).toBe('gxeon_quick_fix_v1');
      expect(GXEON_QUICK_FIX_SERVICE.priceBrl).toBe(49.0);
      expect(GXEON_QUICK_FIX_SERVICE.currency).toBe('BRL');
      expect(GXEON_QUICK_FIX_SERVICE.refundPolicy).toBe(
        'Solicitações elegíveis a reembolso serão processadas de acordo com a política do serviço.'
      );
    });
  });

  describe('StripeServerService: Configuration & Fail-Closed Guardrails', () => {
    it('fails closed when STRIPE_SECRET_KEY is missing and no instance is provided', () => {
      const origKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      expect(() => {
        new StripeServerService({
          firestore: memoryDb
        });
      }).toThrow('STRIPE_SECRET_KEY is missing. StripeServerService fails closed in production.');

      if (origKey) process.env.STRIPE_SECRET_KEY = origKey;
    });

    it('enforces server-controlled GXEON_PUBLIC_URL and ignores arbitrary client origin', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET,
        publicUrl: 'https://custom-gxeon.xpex.systems'
      });

      const res = await serverService.createCheckoutSession({
        customerName: 'Cliente',
        customerEmail: 'cliente@xpex.systems',
        problemSummary: 'Fix bug'
      });

      expect(res.orderId).toBeDefined();
      const createSpy = mockStripe.checkout.sessions.create as any;
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: `https://custom-gxeon.xpex.systems/order/${res.orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `https://custom-gxeon.xpex.systems/order/${res.orderId}/cancel`
        }),
        expect.objectContaining({
          idempotencyKey: `cs_create_${res.orderId}`
        })
      );
    });
  });

  describe('StripeServerService: Checkout Creation & State Flow', () => {
    it('starts at CUSTOMER_CREATED and transitions to CHECKOUT_CREATED with idempotencyKey', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET,
        publicUrl: SERVER_PUBLIC_URL
      });

      const result = await serverService.createCheckoutSession({
        customerName: 'Cliente Produção',
        customerEmail: 'cliente@producao.com',
        problemSummary: 'Falha no endpoint /auth/login',
        repoOrCodeUrl: 'https://github.com/org/repo'
      });

      expect(result.orderId).toBeDefined();
      expect(result.sessionId).toBe('cs_test_session_999');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_session_999');

      // Verify Firestore persistence
      const savedOrder = await memoryDb.getOrder(result.orderId);
      expect(savedOrder).toBeDefined();
      expect(savedOrder?.customerEmail).toBe('cliente@producao.com');
      expect(savedOrder?.amountBrl).toBe(49.0);
      expect(savedOrder?.state).toBe('CHECKOUT_CREATED');
      expect(savedOrder?.stripeSessionId).toBe('cs_test_session_999');

      // Verify idempotencyKey passed to Stripe SDK
      const createSpy = mockStripe.checkout.sessions.create as any;
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          customer_email: 'cliente@producao.com',
          payment_intent_data: {
            metadata: {
              order_id: result.orderId,
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }),
        {
          idempotencyKey: `cs_create_${result.orderId}`
        }
      );
    });

    it('recovers cleanly from partial Firestore failure on retry without duplicate Stripe sessions', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET,
        publicUrl: SERVER_PUBLIC_URL
      });

      const fixedOrderId = 'ord_recovery_test_01';

      // 1. First attempt sets initial order
      const res1 = await serverService.createCheckoutSession({
        customOrderId: fixedOrderId,
        customerName: 'Cliente Retry',
        customerEmail: 'retry@producao.com',
        problemSummary: 'Testing retry safety'
      });

      expect(res1.orderId).toBe(fixedOrderId);

      // 2. Second attempt with same orderId reuses stable idempotencyKey
      const res2 = await serverService.createCheckoutSession({
        customOrderId: fixedOrderId,
        customerName: 'Cliente Retry',
        customerEmail: 'retry@producao.com',
        problemSummary: 'Testing retry safety'
      });

      expect(res2.orderId).toBe(fixedOrderId);
      expect(res2.sessionId).toBe('cs_test_session_999');

      const createSpy = mockStripe.checkout.sessions.create as any;
      expect(createSpy).toHaveBeenLastCalledWith(
        expect.anything(),
        { idempotencyKey: `cs_create_${fixedOrderId}` }
      );
    });
  });

  describe('StripeServerService: Webhook Processing & Concurrency', () => {
    it('handles true parallel concurrent webhook deliveries: exactly 1 event recorded, 1 order updated, 1 job created', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const order: CustomerOrder = {
        id: 'ord_concurrent_100',
        customerName: 'Concurrent Tester',
        customerEmail: 'concurrent@empresa.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        stripeSessionId: 'cs_concurrent_123',
        problemSummary: 'Concurrent webhook test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(order.id, order);

      const event = {
        id: 'evt_concurrent_999',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_concurrent_123',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            payment_intent: 'pi_concurrent_123',
            metadata: {
              order_id: 'ord_concurrent_100',
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }
      };

      const payload = JSON.stringify(event);

      // Fire 2 concurrent webhook deliveries at the same time
      const [res1, res2] = await Promise.all([
        serverService.handleWebhook(payload, 'valid_signed_header'),
        serverService.handleWebhook(payload, 'valid_signed_header')
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain('PAYMENT_SUCCEEDED');
      expect(statuses).toContain('DUPLICATE_IGNORED');

      // Assert true single side-effect outcome
      expect(memoryDb.jobs.size).toBe(1);
      expect(memoryDb.stripeEvents.size).toBe(1);
      const savedJob = await memoryDb.getJob('job_ord_concurrent_100');
      expect(savedJob).toBeDefined();
      expect(savedJob?.state).toBe('JOB_CREATED');
    });

    it('enforces strict session binding: rejects if stripeSessionId is missing or does not match', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      // 1. Order without stripeSessionId in DB
      const orderNoSession: CustomerOrder = {
        id: 'ord_no_session',
        customerName: 'No Session',
        customerEmail: 'no@session.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CUSTOMER_CREATED',
        problemSummary: 'Missing session ID',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(orderNoSession.id, orderNoSession);

      const event1 = {
        id: 'evt_bind_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_injected_session',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            metadata: { order_id: 'ord_no_session', service_id: 'gxeon_quick_fix_v1' }
          }
        }
      };

      const res1 = await serverService.handleWebhook(JSON.stringify(event1), 'valid_signed_header');
      expect(res1.status).toBe('SESSION_MISMATCH');
      expect(res1.processed).toBe(false);
      expect(memoryDb.jobs.size).toBe(0);

      // 2. Order with mismatched stripeSessionId
      const orderMismatch: CustomerOrder = {
        id: 'ord_mismatch_session',
        customerName: 'Mismatch',
        customerEmail: 'mismatch@session.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        stripeSessionId: 'cs_real_session_001',
        problemSummary: 'Mismatched session ID',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(orderMismatch.id, orderMismatch);

      const event2 = {
        id: 'evt_bind_2',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fraudulent_session_002',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            metadata: { order_id: 'ord_mismatch_session', service_id: 'gxeon_quick_fix_v1' }
          }
        }
      };

      const res2 = await serverService.handleWebhook(JSON.stringify(event2), 'valid_signed_header');
      expect(res2.status).toBe('SESSION_MISMATCH');
      expect(res2.processed).toBe(false);
      expect(memoryDb.jobs.size).toBe(0);
    });

    it('rolls back and leaves event uncommitted if an error occurs during processing (allowing Stripe retry)', async () => {
      const failingDb: typeof memoryDb = {
        ...memoryDb,
        runTransaction: async (fn: any) => {
          const fakeTx = {
            getProcessedEvent: async () => false,
            getOrder: async () => {
              throw new Error('Transient database timeout');
            },
            recordProcessedEvent: async () => {},
            updateOrderState: async () => {},
            createJob: async () => {},
            setPaymentIntentMapping: async () => {},
            getOrderIdByPaymentIntent: async () => null,
            getJob: async () => null,
            setOrder: async () => {}
          };
          return fn(fakeTx);
        }
      } as any;

      const failingService = new StripeServerService({
        firestore: failingDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const event = {
        id: 'evt_transient_error',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_transient',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            metadata: { order_id: 'ord_transient', service_id: 'gxeon_quick_fix_v1' }
          }
        }
      };

      await expect(
        failingService.handleWebhook(JSON.stringify(event), 'valid_signed_header')
      ).rejects.toThrow('Transient database timeout');

      expect(await memoryDb.getProcessedEvent('evt_transient_error')).toBe(false);
    });

    it('handles refund event correlating order via payment intent mapping', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const orderToRefund: CustomerOrder = {
        id: 'ord_refund_correlation',
        customerName: 'Cliente Reembolso',
        customerEmail: 'reembolso@empresa.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'PAYMENT_SUCCEEDED',
        stripePaymentIntentId: 'pi_refund_target_123',
        problemSummary: 'Fora de escopo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(orderToRefund.id, orderToRefund);
      await memoryDb.setPaymentIntentMapping('pi_refund_target_123', orderToRefund.id);

      const refundEvent = {
        id: 'evt_refund_corr_999',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refund_123',
            amount_refunded: 4900,
            payment_intent: 'pi_refund_target_123',
            metadata: {}
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(refundEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('REFUNDED');
      expect(result.processed).toBe(true);
      expect(result.orderId).toBe('ord_refund_correlation');

      const updated = await memoryDb.getOrder('ord_refund_correlation');
      expect(updated?.state).toBe('REFUNDED');
      expect(await memoryDb.getProcessedEvent('evt_refund_corr_999')).toBe(true);
    });
  });

  describe('HTTP Endpoints: POST /api/checkout & POST /api/stripe/webhook', () => {
    it('handles POST /api/checkout successfully', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET,
        publicUrl: SERVER_PUBLIC_URL
      });

      const req: any = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          customerName: 'HTTP Test',
          customerEmail: 'http@test.com',
          problemSummary: 'HTTP endpoint validation'
        }
      };

      let responseBody = '';
      let statusCode = 0;
      const res: any = {
        writeHead: (code: number) => {
          statusCode = code;
        },
        end: (data: string) => {
          responseBody = data;
        }
      };

      await handleCheckoutEndpoint(req, res, serverService);

      expect(statusCode).toBe(200);
      const parsed = JSON.parse(responseBody);
      expect(parsed.orderId).toBeDefined();
      expect(parsed.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_session_999');
    });

    it('handles POST /api/stripe/webhook successfully', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET,
        publicUrl: SERVER_PUBLIC_URL
      });

      const order: CustomerOrder = {
        id: 'ord_http_webhook',
        customerName: 'HTTP Webhook',
        customerEmail: 'webhook@http.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        stripeSessionId: 'cs_http_123',
        problemSummary: 'Webhook endpoint test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(order.id, order);

      const event = {
        id: 'evt_http_webhook_01',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_http_123',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            payment_intent: 'pi_http_123',
            metadata: {
              order_id: 'ord_http_webhook',
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }
      };

      const req: any = {
        method: 'POST',
        headers: {
          'stripe-signature': 'valid_signed_header',
          'content-type': 'application/json'
        },
        body: JSON.stringify(event)
      };

      let responseBody = '';
      let statusCode = 0;
      const res: any = {
        writeHead: (code: number) => {
          statusCode = code;
        },
        end: (data: string) => {
          responseBody = data;
        }
      };

      await handleStripeWebhookEndpoint(req, res, serverService);

      expect(statusCode).toBe(200);
      const parsed = JSON.parse(responseBody);
      expect(parsed.received).toBe(true);
      expect(parsed.status).toBe('PAYMENT_SUCCEEDED');
      expect(parsed.orderId).toBe('ord_http_webhook');
      expect(parsed.jobId).toBe('job_ord_http_webhook');
    });
  });

  describe('SalesClientService: Browser API Client', () => {
    it('calls POST /api/checkout and returns session data', async () => {
      const client = new SalesClientService('/api');

      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (url === '/api/checkout' && init.method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              orderId: 'ord_client_1',
              checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_client_1',
              sessionId: 'cs_client_1'
            })
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const res = await client.requestCheckout({
        customerName: 'Test Client',
        customerEmail: 'test@client.com',
        problemSummary: 'Broken form'
      });

      expect(res.orderId).toBe('ord_client_1');
      expect(res.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_client_1');
    });
  });
});
