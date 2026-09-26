import Stripe from 'stripe';
import { CustomerOrder, JobTicket, MoneyTruthState } from '../features/sales/types';

export interface FirestoreStore {
  getOrder: (orderId: string) => Promise<CustomerOrder | null>;
  setOrder: (orderId: string, order: CustomerOrder) => Promise<void>;
  updateOrderState: (orderId: string, state: MoneyTruthState, updates?: Partial<CustomerOrder>) => Promise<void>;
  getProcessedEvent: (eventId: string) => Promise<boolean>;
  recordProcessedEvent: (eventId: string, type: string) => Promise<void>;
  createJob: (jobId: string, job: JobTicket) => Promise<void>;
  getJob: (jobId: string) => Promise<JobTicket | null>;
}

export interface CheckoutSessionInput {
  customerName: string;
  customerEmail: string;
  problemSummary: string;
  repoOrCodeUrl?: string;
}

export interface CheckoutSessionResult {
  orderId: string;
  checkoutUrl: string;
}

export class StripeServerService {
  private stripe: Stripe;
  private webhookSecret: string;
  private firestore: FirestoreStore;

  constructor(options: {
    stripeApiKey?: string;
    webhookSecret?: string;
    firestore: FirestoreStore;
    stripeInstance?: Stripe;
  }) {
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
    this.firestore = options.firestore;

    if (options.stripeInstance) {
      this.stripe = options.stripeInstance;
    } else {
      const apiKey = options.stripeApiKey || process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_typecheck';
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2025-02-24.acacia' as any
      });
    }
  }

  /**
   * Server-side Checkout Session creation.
   * Price is strictly hardcoded and server-enforced at 4900 BRL (R$ 49,00).
   */
  async createCheckoutSession(
    input: CheckoutSessionInput,
    originUrl: string
  ): Promise<CheckoutSessionResult> {
    if (!input.customerEmail || !input.problemSummary) {
      throw new Error('customerEmail and problemSummary are required');
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const order: CustomerOrder = {
      id: orderId,
      customerName: input.customerName || 'Customer',
      customerEmail: input.customerEmail,
      serviceId: 'gxeon_quick_fix_v1',
      amountBrl: 49.0,
      state: 'CHECKOUT_CREATED',
      problemSummary: input.problemSummary,
      repoOrCodeUrl: input.repoOrCodeUrl,
      createdAt: now,
      updatedAt: now
    };

    // 1. Persist initial order in Firestore
    await this.firestore.setOrder(orderId, order);

    // 2. Create Stripe Checkout Session via official SDK
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: 4900, // Exact R$ 49,00 server-enforced
            product_data: {
              name: 'GXEON Quick Fix',
              description: 'Diagnóstico técnico especializado e implementação de 1 correção cirúrgica.',
              metadata: {
                service_id: 'gxeon_quick_fix_v1',
                provider: 'GXEON AI Systems'
              }
            }
          },
          quantity: 1
        }
      ],
      customer_email: input.customerEmail,
      metadata: {
        order_id: orderId,
        service_id: 'gxeon_quick_fix_v1',
        customer_email: input.customerEmail,
        customer_name: input.customerName || ''
      },
      success_url: `${originUrl}/order/${orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${originUrl}/order/${orderId}/cancel`
    });

    if (!session.url) {
      throw new Error('Failed to generate Stripe checkout URL');
    }

    // Update order with session ID
    await this.firestore.updateOrderState(orderId, 'CHECKOUT_CREATED', {
      stripeSessionId: session.id
    });

    return {
      orderId,
      checkoutUrl: session.url
    };
  }

  /**
   * Verified Stripe webhook processor.
   * Uses official Stripe constructEvent SDK for signature verification.
   * Durable idempotency via Firestore stripe_events collection.
   */
  async handleWebhook(
    payload: string | Buffer,
    signatureHeader: string
  ): Promise<{
    status: string;
    processed: boolean;
    orderId?: string;
    jobId?: string;
    error?: string;
  }> {
    if (!signatureHeader || !this.webhookSecret) {
      return {
        status: 'UNVERIFIED_SIGNATURE',
        processed: false,
        error: 'Missing Stripe signature header or webhook secret'
      };
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signatureHeader, this.webhookSecret);
    } catch (err: any) {
      return {
        status: 'UNVERIFIED_SIGNATURE',
        processed: false,
        error: `Signature verification failed: ${err.message}`
      };
    }

    const eventId = event.id;

    // Durable idempotency check in Firestore
    const isAlreadyProcessed = await this.firestore.getProcessedEvent(eventId);
    if (isAlreadyProcessed) {
      return {
        status: 'DUPLICATE_IGNORED',
        processed: true
      };
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      const paymentStatus = session.payment_status;
      const amountTotal = session.amount_total;
      const currency = session.currency?.toLowerCase();

      // Zero-trust money gate: verify exact payment status
      if (paymentStatus !== 'paid') {
        return {
          status: 'UNPAID',
          processed: false,
          error: `Payment status is ${paymentStatus}, expected paid`
        };
      }

      // Zero-trust money gate: verify exact amount and currency
      if (amountTotal !== 4900 || currency !== 'brl') {
        return {
          status: 'AMOUNT_MISMATCH',
          processed: false,
          error: `Expected 4900 BRL, got ${amountTotal} ${currency}`
        };
      }

      // Record durable event ID in Firestore
      await this.firestore.recordProcessedEvent(eventId, event.type);

      const now = new Date().toISOString();

      // Update Firestore order to PAYMENT_SUCCEEDED
      if (orderId) {
        await this.firestore.updateOrderState(orderId, 'PAYMENT_SUCCEEDED', {
          stripePaymentIntentId: (session.payment_intent as string) || session.id,
          updatedAt: now
        });
      }

      // Create durable JobTicket in Firestore (no card information)
      const jobId = `job_${orderId || Date.now()}`;
      const existingOrder = orderId ? await this.firestore.getOrder(orderId) : null;

      const jobTicket: JobTicket = {
        ticketId: jobId,
        orderId: orderId || 'unknown',
        service: 'gxeon_quick_fix_v1',
        customerIntake: {
          customerEmail: session.customer_details?.email || existingOrder?.customerEmail || '',
          customerName: session.customer_details?.name || existingOrder?.customerName || '',
          problemSummary: existingOrder?.problemSummary || 'GXEON Quick Fix request',
          repoOrCodeUrl: existingOrder?.repoOrCodeUrl
        },
        paymentReference: (session.payment_intent as string) || session.id,
        state: 'JOB_CREATED',
        createdAt: now,
        updatedAt: now
      };

      await this.firestore.createJob(jobId, jobTicket);

      return {
        status: 'PAYMENT_SUCCEEDED',
        processed: true,
        orderId,
        jobId
      };
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const orderId = charge.metadata?.order_id;

      await this.firestore.recordProcessedEvent(eventId, event.type);

      if (orderId) {
        await this.firestore.updateOrderState(orderId, 'REFUNDED', {
          updatedAt: new Date().toISOString()
        });
      }

      return {
        status: 'REFUNDED',
        processed: true,
        orderId
      };
    }

    // Record other handled events
    await this.firestore.recordProcessedEvent(eventId, event.type);

    return {
      status: 'UNHANDLED_EVENT',
      processed: true
    };
  }
}
