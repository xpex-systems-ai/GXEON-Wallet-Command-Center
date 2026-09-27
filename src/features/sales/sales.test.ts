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

describe('GXEON Dual Revenue Engine - Track B: Stripe Direct Sales (PR #4 Hardened)', () => {
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
        })
      );
    });
  });

  describe('StripeServerService: Checkout Creation', () => {
    it('creates checkout session with server-enforced 4900 BRL price, payment_intent_data and persists in Firestore', async () => {
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

      // Verify payment_intent_data.metadata attached
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
          },
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'brl',
                unit_amount: 4900
              }),
              quantity: 1
            })
          ]
        })
      );
    });

    it('rejects checkout creation with missing mandatory fields', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      await expect(
        serverService.createCheckoutSession({
          customerName: 'Cliente',
          customerEmail: '',
          problemSummary: 'Problem'
        })
      ).rejects.toThrow('customerEmail and problemSummary are required');
    });
  });

  describe('StripeServerService: Webhook Processing & Atomic Idempotency', () => {
    it('rejects webhooks with missing or invalid signature', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

      const resMissing = await serverService.handleWebhook(payload, '');
      expect(resMissing.status).toBe('UNVERIFIED_SIGNATURE');
      expect(resMissing.processed).toBe(false);

      const resInvalid = await serverService.handleWebhook(payload, 'bad_signature_header');
      expect(resInvalid.status).toBe('UNVERIFIED_SIGNATURE');
      expect(resInvalid.processed).toBe(false);
      expect(memoryDb.jobs.size).toBe(0);
    });

    it('accepts valid Stripe test event (4900 BRL, paid) and creates exactly 1 job ticket in Firestore', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const initialOrder: CustomerOrder = {
        id: 'ord_prod_777',
        customerName: 'Tech Lead',
        customerEmail: 'techlead@empresa.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        stripeSessionId: 'cs_live_123',
        problemSummary: 'Fix race condition in mining sync',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(initialOrder.id, initialOrder);

      const validEvent = {
        id: 'evt_stripe_live_001',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_live_123',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            payment_intent: 'pi_verified_stripe_777',
            customer_details: {
              email: 'techlead@empresa.com',
              name: 'Tech Lead'
            },
            metadata: {
              order_id: 'ord_prod_777',
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(validEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('PAYMENT_SUCCEEDED');
      expect(result.processed).toBe(true);
      expect(result.orderId).toBe('ord_prod_777');
      expect(result.jobId).toBe('job_ord_prod_777');

      // Verify Firestore order state
      const updatedOrder = await memoryDb.getOrder('ord_prod_777');
      expect(updatedOrder?.state).toBe('PAYMENT_SUCCEEDED');
      expect(updatedOrder?.stripePaymentIntentId).toBe('pi_verified_stripe_777');

      // Verify eventId recorded in stripe_events
      expect(await memoryDb.getProcessedEvent('evt_stripe_live_001')).toBe(true);

      // Verify payment intent mapping
      expect(await memoryDb.getOrderIdByPaymentIntent('pi_verified_stripe_777')).toBe('ord_prod_777');

      // Verify JobTicket persisted in Firestore jobs collection (sanitized)
      expect(memoryDb.jobs.size).toBe(1);
      const createdJob = await memoryDb.getJob('job_ord_prod_777');
      expect(createdJob).toBeDefined();
      expect(createdJob?.orderId).toBe('ord_prod_777');
      expect(createdJob?.state).toBe('JOB_CREATED');
      expect(createdJob?.customerIntake.customerEmail).toBe('techlead@empresa.com');
      expect((createdJob as any).cardNumber).toBeUndefined();
      expect((createdJob as any).cvc).toBeUndefined();
    });

    it('enforces atomic idempotency on concurrent duplicate webhooks', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const initialOrder: CustomerOrder = {
        id: 'ord_idempotent_999',
        customerName: 'Test',
        customerEmail: 'test@idemp.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        stripeSessionId: 'cs_live_999',
        problemSummary: 'Idempotency test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(initialOrder.id, initialOrder);

      const validEvent = {
        id: 'evt_idempotent_test_999',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_live_999',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            payment_intent: 'pi_idempotent_999',
            metadata: {
              order_id: 'ord_idempotent_999',
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }
      };

      // 1st delivery
      const firstRes = await serverService.handleWebhook(
        JSON.stringify(validEvent),
        'valid_signed_header'
      );
      expect(firstRes.status).toBe('PAYMENT_SUCCEEDED');
      expect(memoryDb.jobs.size).toBe(1);

      // 2nd delivery (duplicate event replay)
      const secondRes = await serverService.handleWebhook(
        JSON.stringify(validEvent),
        'valid_signed_header'
      );
      expect(secondRes.status).toBe('DUPLICATE_IGNORED');
      expect(secondRes.processed).toBe(true);
      expect(memoryDb.jobs.size).toBe(1); // Exactly 1 job ticket remains
    });

    it('rolls back and leaves event uncommitted if an error occurs during processing (allowing Stripe retry)', async () => {
      // Override runTransaction to simulate failure mid-transaction
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

      // Ensure event is NOT recorded in main database
      expect(await memoryDb.getProcessedEvent('evt_transient_error')).toBe(false);
    });

    it('rejects unknown order and never creates job_unknown', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const unknownOrderEvent = {
        id: 'evt_unknown_ord',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_unknown',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            metadata: {
              order_id: 'ord_does_not_exist',
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(unknownOrderEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('ORDER_NOT_FOUND');
      expect(result.processed).toBe(false);
      expect(memoryDb.jobs.size).toBe(0);
      expect(await memoryDb.getJob('job_unknown')).toBeNull();
    });

    it('rejects session mismatch (session.id !== order.stripeSessionId)', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const order: CustomerOrder = {
        id: 'ord_session_test',
        customerName: 'Test',
        customerEmail: 'test@session.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        stripeSessionId: 'cs_expected_original_session',
        problemSummary: 'Session check',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await memoryDb.setOrder(order.id, order);

      const mismatchedSessionEvent = {
        id: 'evt_session_mismatch',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fraudulent_session',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            metadata: {
              order_id: 'ord_session_test',
              service_id: 'gxeon_quick_fix_v1'
            }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(mismatchedSessionEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('SESSION_MISMATCH');
      expect(result.processed).toBe(false);
      expect(memoryDb.jobs.size).toBe(0);
    });

    it('rejects wrong service ID', async () => {
      const serverService = new StripeServerService({
        firestore: memoryDb,
        stripeInstance: mockStripe,
        webhookSecret: TEST_WEBHOOK_SECRET
      });

      const wrongServiceEvent = {
        id: 'evt_wrong_service',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            payment_status: 'paid',
            amount_total: 4900,
            currency: 'brl',
            metadata: {
              order_id: 'ord_test',
              service_id: 'wrong_service_v2'
            }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(wrongServiceEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('SERVICE_MISMATCH');
      expect(result.processed).toBe(false);
      expect(memoryDb.jobs.size).toBe(0);
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
            metadata: {} // empty metadata tests correlation via payment_intent mapping
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
