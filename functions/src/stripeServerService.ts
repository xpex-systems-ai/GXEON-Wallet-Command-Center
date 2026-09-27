import Stripe from 'stripe';
import { CustomerOrder, JobTicket, FirestoreStore } from './adminFirestoreAdapter';

export interface CheckoutSessionInput {
  customerName: string;
  customerEmail: string;
  problemSummary: string;
  repoOrCodeUrl?: string;
  customOrderId?: string;
  clientOrderId?: string;
  requestId?: string;
}

export interface CheckoutSessionResult {
  orderId: string;
  checkoutUrl: string;
  sessionId: string;
}

export interface WebhookResult {
  status:
    | 'PAYMENT_SUCCEEDED'
    | 'DUPLICATE_IGNORED'
    | 'REFUNDED'
    | 'UNVERIFIED_SIGNATURE'
    | 'UNPAID'
    | 'AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'SERVICE_MISMATCH'
    | 'ORDER_NOT_FOUND'
    | 'SESSION_MISMATCH'
    | 'INVALID_ORDER_STATE'
    | 'UNHANDLED_EVENT';
  processed: boolean;
  orderId?: string;
  jobId?: string;
  error?: string;
}

export class StripeServerService {
  private stripe: Stripe;
  private webhookSecret: string;
  private firestore: FirestoreStore;
  private publicUrl: string;

  constructor(options: {
    stripeApiKey?: string;
    webhookSecret?: string;
    firestore: FirestoreStore;
    stripeInstance?: Stripe;
    publicUrl?: string;
  }) {
    this.firestore = options.firestore;
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
    this.publicUrl = (options.publicUrl || process.env.GXEON_PUBLIC_URL || 'https://gxeon.xpex.systems').replace(/\/$/, '');

    if (options.stripeInstance) {
      this.stripe = options.stripeInstance;
    } else {
      const apiKey = options.stripeApiKey || process.env.STRIPE_SECRET_KEY;
      if (!apiKey) {
        throw new Error('STRIPE_SECRET_KEY is missing. StripeServerService fails closed in production.');
      }
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2025-02-24.acacia' as any
      });
    }
  }

  async createCheckoutSession(
    input: CheckoutSessionInput
  ): Promise<CheckoutSessionResult> {
    if (!input.customerEmail || !input.problemSummary) {
      throw new Error('customerEmail and problemSummary are required');
    }

    const orderId =
      input.clientOrderId ||
      input.customOrderId ||
      input.requestId ||
      `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const existingOrder = await this.firestore.getOrder(orderId);

    if (existingOrder && existingOrder.stripeSessionId) {
      try {
        const existingSession = await this.stripe.checkout.sessions.retrieve(existingOrder.stripeSessionId);
        if (existingSession.url) {
          return {
            orderId: existingOrder.id,
            checkoutUrl: existingSession.url,
            sessionId: existingSession.id
          };
        }
      } catch {
        // Fallthrough
      }
    }

    let order: CustomerOrder;
    if (existingOrder) {
      order = existingOrder;
    } else {
      order = {
        id: orderId,
        customerName: input.customerName || 'Customer',
        customerEmail: input.customerEmail,
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CUSTOMER_CREATED',
        problemSummary: input.problemSummary,
        repoOrCodeUrl: input.repoOrCodeUrl,
        createdAt: now,
        updatedAt: now
      };
      await this.firestore.setOrder(orderId, order);
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              unit_amount: 4900,
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
        payment_intent_data: {
          metadata: {
            order_id: orderId,
            service_id: 'gxeon_quick_fix_v1'
          }
        },
        success_url: `${this.publicUrl}/order/${orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.publicUrl}/order/${orderId}/cancel`
      },
      {
        idempotencyKey: `cs_create_${orderId}`
      }
    );

    if (!session.url || !session.id) {
      throw new Error('Failed to generate Stripe checkout session');
    }

    await this.firestore.updateOrderState(orderId, 'CHECKOUT_CREATED', {
      stripeSessionId: session.id,
      updatedAt: new Date().toISOString()
    });

    return {
      orderId,
      checkoutUrl: session.url,
      sessionId: session.id
    };
  }

  async handleWebhook(
    payload: string | Buffer,
    signatureHeader: string
  ): Promise<WebhookResult> {
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

    return this.firestore.runTransaction(async (tx) => {
      const isAlreadyProcessed = await tx.getProcessedEvent(eventId);
      if (isAlreadyProcessed) {
        return {
          status: 'DUPLICATE_IGNORED',
          processed: true
        };
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        const serviceId = session.metadata?.service_id;
        const paymentStatus = session.payment_status;
        const amountTotal = session.amount_total;
        const currency = session.currency?.toLowerCase();
        const sessionId = session.id;
        const paymentIntentId = (session.payment_intent as string) || sessionId;

        if (paymentStatus !== 'paid') {
          return {
            status: 'UNPAID',
            processed: false,
            error: `Payment status is ${paymentStatus}, expected paid`
          };
        }

        if (amountTotal !== 4900) {
          return {
            status: 'AMOUNT_MISMATCH',
            processed: false,
            error: `Expected amount 4900, received ${amountTotal}`
          };
        }

        if (currency !== 'brl') {
          return {
            status: 'CURRENCY_MISMATCH',
            processed: false,
            error: `Expected currency brl, received ${currency}`
          };
        }

        if (serviceId !== 'gxeon_quick_fix_v1') {
          return {
            status: 'SERVICE_MISMATCH',
            processed: false,
            error: `Expected service_id gxeon_quick_fix_v1, received ${serviceId}`
          };
        }

        if (!orderId) {
          return {
            status: 'ORDER_NOT_FOUND',
            processed: false,
            error: 'Session metadata is missing order_id'
          };
        }

        const existingOrder = await tx.getOrder(orderId);
        if (!existingOrder) {
          return {
            status: 'ORDER_NOT_FOUND',
            processed: false,
            error: `Order ${orderId} does not exist in Firestore`
          };
        }

        if (!existingOrder.stripeSessionId || existingOrder.stripeSessionId !== sessionId) {
          return {
            status: 'SESSION_MISMATCH',
            processed: false,
            error: `Strict session binding mismatch for order ${orderId}`
          };
        }

        const validInitialStates = ['CUSTOMER_CREATED', 'CHECKOUT_CREATED', 'PAYMENT_PENDING'];
        if (!validInitialStates.includes(existingOrder.state) && existingOrder.state !== 'PAYMENT_SUCCEEDED') {
          return {
            status: 'INVALID_ORDER_STATE',
            processed: false,
            error: `Invalid order state transition from ${existingOrder.state}`
          };
        }

        const now = new Date().toISOString();

        await tx.updateOrderState(orderId, 'PAYMENT_SUCCEEDED', {
          stripePaymentIntentId: paymentIntentId,
          stripeSessionId: sessionId,
          updatedAt: now
        });

        const jobId = `job_${orderId}`;
        const jobTicket: JobTicket = {
          ticketId: jobId,
          orderId: orderId,
          service: 'gxeon_quick_fix_v1',
          customerIntake: {
            customerEmail: session.customer_details?.email || existingOrder.customerEmail,
            customerName: session.customer_details?.name || existingOrder.customerName,
            problemSummary: existingOrder.problemSummary,
            repoOrCodeUrl: existingOrder.repoOrCodeUrl
          },
          paymentReference: paymentIntentId,
          state: 'JOB_CREATED',
          createdAt: now,
          updatedAt: now
        };

        await tx.createJob(jobId, jobTicket);

        if (paymentIntentId) {
          await tx.setPaymentIntentMapping(paymentIntentId, orderId);
        }

        await tx.recordProcessedEvent(eventId, event.type, { orderId, jobId });

        return {
          status: 'PAYMENT_SUCCEEDED',
          processed: true,
          orderId,
          jobId
        };
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        let orderId: string | undefined = charge.metadata?.order_id;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;

        if (!orderId && paymentIntentId) {
          const mapped = await tx.getOrderIdByPaymentIntent(paymentIntentId);
          if (mapped) {
            orderId = mapped;
          }
        }

        if (orderId) {
          const order = await tx.getOrder(orderId);
          if (order) {
            await tx.updateOrderState(orderId, 'REFUNDED', {
              updatedAt: new Date().toISOString()
            });
          }
        }

        await tx.recordProcessedEvent(eventId, event.type, {
          orderId: orderId || null,
          chargeId: charge.id
        });

        return {
          status: 'REFUNDED',
          processed: true,
          orderId
        };
      }

      await tx.recordProcessedEvent(eventId, event.type);

      return {
        status: 'UNHANDLED_EVENT',
        processed: true
      };
    });
  }
}
