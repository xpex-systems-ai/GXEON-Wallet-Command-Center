import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { GXEON_QUICK_FIX_SERVICE, CustomerOrder, JobTicket } from './types';
import { StripeServerService, FirestoreStore } from '../../server/stripeServerService';
import { SalesClientService } from '../../services/salesClientService';

describe('GXEON Dual Revenue Engine - Track B: Stripe Direct Sales (PR #4 Hardened)', () => {
  let mockOrders: Map<string, CustomerOrder>;
  let mockProcessedEvents: Set<string>;
  let mockJobs: Map<string, JobTicket>;
  let mockFirestore: FirestoreStore;
  let mockStripe: Stripe;

  const TEST_WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests_12345';

  beforeEach(() => {
    mockOrders = new Map<string, CustomerOrder>();
    mockProcessedEvents = new Set<string>();
    mockJobs = new Map<string, JobTicket>();

    mockFirestore = {
      getOrder: async (orderId: string) => mockOrders.get(orderId) || null,
      setOrder: async (orderId: string, order: CustomerOrder) => {
        mockOrders.set(orderId, { ...order });
      },
      updateOrderState: async (orderId: string, state, updates = {}) => {
        const existing = mockOrders.get(orderId);
        if (existing) {
          mockOrders.set(orderId, {
            ...existing,
            ...updates,
            state,
            updatedAt: new Date().toISOString()
          });
        }
      },
      getProcessedEvent: async (eventId: string) => mockProcessedEvents.has(eventId),
      recordProcessedEvent: async (eventId: string) => {
        mockProcessedEvents.add(eventId);
      },
      createJob: async (jobId: string, job: JobTicket) => {
        mockJobs.set(jobId, { ...job });
      },
      getJob: async (jobId: string) => mockJobs.get(jobId) || null
    };

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

  describe('StripeServerService: Checkout Creation', () => {
    it('creates checkout session with server-enforced 4900 BRL price and persists in Firestore', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      const result = await serverService.createCheckoutSession(
        {
          customerName: 'Cliente Produção',
          customerEmail: 'cliente@producao.com',
          problemSummary: 'Falha no endpoint /auth/login',
          repoOrCodeUrl: 'https://github.com/org/repo'
        },
        'https://gxeon.xpex.systems'
      );

      expect(result.orderId).toBeDefined();
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_session_999');

      // Verify Firestore persistence
      const savedOrder = mockOrders.get(result.orderId);
      expect(savedOrder).toBeDefined();
      expect(savedOrder?.customerEmail).toBe('cliente@producao.com');
      expect(savedOrder?.amountBrl).toBe(49.0);
      expect(savedOrder?.state).toBe('CHECKOUT_CREATED');
      expect(savedOrder?.stripeSessionId).toBe('cs_test_session_999');

      // Verify Stripe API call parameters (server-controlled price)
      const createSpy = mockStripe.checkout.sessions.create as any;
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          customer_email: 'cliente@producao.com',
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
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      await expect(
        serverService.createCheckoutSession(
          {
            customerName: 'Cliente',
            customerEmail: '',
            problemSummary: 'Problem'
          },
          'https://gxeon.xpex.systems'
        )
      ).rejects.toThrow('customerEmail and problemSummary are required');
    });
  });

  describe('StripeServerService: Webhook Processing & Idempotency', () => {
    it('rejects webhooks with missing or invalid signature', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

      // Missing signature
      const resMissing = await serverService.handleWebhook(payload, '');
      expect(resMissing.status).toBe('UNVERIFIED_SIGNATURE');
      expect(resMissing.processed).toBe(false);

      // Invalid signature
      const resInvalid = await serverService.handleWebhook(payload, 'bad_signature_header');
      expect(resInvalid.status).toBe('UNVERIFIED_SIGNATURE');
      expect(resInvalid.processed).toBe(false);
      expect(mockJobs.size).toBe(0);
    });

    it('accepts valid Stripe test event (4900 BRL, paid) and creates exactly 1 job ticket in Firestore', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      // Initial order in Firestore
      const initialOrder: CustomerOrder = {
        id: 'ord_prod_777',
        customerName: 'Tech Lead',
        customerEmail: 'techlead@empresa.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CHECKOUT_CREATED',
        problemSummary: 'Fix race condition in mining sync',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await mockFirestore.setOrder(initialOrder.id, initialOrder);

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
              order_id: 'ord_prod_777'
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

      // Verify Firestore order updated to PAYMENT_SUCCEEDED
      const updatedOrder = mockOrders.get('ord_prod_777');
      expect(updatedOrder?.state).toBe('PAYMENT_SUCCEEDED');
      expect(updatedOrder?.stripePaymentIntentId).toBe('pi_verified_stripe_777');

      // Verify eventId recorded in stripe_events
      expect(mockProcessedEvents.has('evt_stripe_live_001')).toBe(true);

      // Verify JobTicket persisted in Firestore jobs collection
      expect(mockJobs.size).toBe(1);
      const createdJob = mockJobs.get('job_ord_prod_777');
      expect(createdJob).toBeDefined();
      expect(createdJob?.orderId).toBe('ord_prod_777');
      expect(createdJob?.state).toBe('JOB_CREATED');
      expect(createdJob?.customerIntake.customerEmail).toBe('techlead@empresa.com');
      expect((createdJob as any).cardNumber).toBeUndefined();
      expect((createdJob as any).cvc).toBeUndefined();
    });

    it('enforces durable idempotency: duplicate eventId returns DUPLICATE_IGNORED and creates no duplicate job', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

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
              order_id: 'ord_idempotent_999'
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
      expect(mockJobs.size).toBe(1);

      // 2nd delivery (duplicate event replay)
      const secondRes = await serverService.handleWebhook(
        JSON.stringify(validEvent),
        'valid_signed_header'
      );
      expect(secondRes.status).toBe('DUPLICATE_IGNORED');
      expect(secondRes.processed).toBe(true);
      expect(mockJobs.size).toBe(1); // Exactly 1 job ticket remains
    });

    it('rejects unpaid checkout session (payment_status != paid) without creating job', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      const unpaidEvent = {
        id: 'evt_unpaid_101',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_unpaid_101',
            payment_status: 'unpaid',
            amount_total: 4900,
            currency: 'brl',
            metadata: { order_id: 'ord_unpaid_101' }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(unpaidEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('UNPAID');
      expect(result.processed).toBe(false);
      expect(mockJobs.size).toBe(0);
      expect(mockProcessedEvents.has('evt_unpaid_101')).toBe(false);
    });

    it('rejects amount or currency mismatch (e.g. 1000 BRL instead of 4900 BRL)', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      const wrongAmountEvent = {
        id: 'evt_wrong_amount_102',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_wrong_102',
            payment_status: 'paid',
            amount_total: 1000,
            currency: 'brl',
            metadata: { order_id: 'ord_wrong_102' }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(wrongAmountEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('AMOUNT_MISMATCH');
      expect(result.processed).toBe(false);
      expect(mockJobs.size).toBe(0);
    });

    it('handles refund event and transitions Firestore order to REFUNDED', async () => {
      const serverService = new StripeServerService({
        stripeApiKey: 'sk_test_mock',
        webhookSecret: TEST_WEBHOOK_SECRET,
        firestore: mockFirestore,
        stripeInstance: mockStripe
      });

      const orderToRefund: CustomerOrder = {
        id: 'ord_refund_test',
        customerName: 'Cliente Reembolso',
        customerEmail: 'reembolso@empresa.com',
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'PAYMENT_SUCCEEDED',
        problemSummary: 'Fora de escopo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await mockFirestore.setOrder(orderToRefund.id, orderToRefund);

      const refundEvent = {
        id: 'evt_refund_999',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refund_123',
            amount_refunded: 4900,
            metadata: {
              order_id: 'ord_refund_test'
            }
          }
        }
      };

      const result = await serverService.handleWebhook(
        JSON.stringify(refundEvent),
        'valid_signed_header'
      );

      expect(result.status).toBe('REFUNDED');
      expect(result.processed).toBe(true);

      const updated = mockOrders.get('ord_refund_test');
      expect(updated?.state).toBe('REFUNDED');
      expect(mockProcessedEvents.has('evt_refund_999')).toBe(true);
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
              checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_client_1'
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

    it('throws error when server responds with non-ok status', async () => {
      const client = new SalesClientService('/api');

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal Server Error' })
        };
      });

      await expect(
        client.requestCheckout({
          customerName: 'Test',
          customerEmail: 'test@client.com',
          problemSummary: 'Problem'
        })
      ).rejects.toThrow('Internal Server Error');
    });
  });
});
