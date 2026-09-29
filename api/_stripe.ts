import Stripe from 'stripe';
import { FirestoreRestClient } from './_firestoreRest.js';

export interface CustomerOrder {
  id: string;
  requestId: string;
  customerName: string;
  customerEmail: string;
  serviceId: string;
  amountBrl: number;
  state: string;
  problemSummary: string;
  repoOrCodeUrl?: string;
  source?: string;
  agentId?: string;
  opportunityId?: string;
  offerId?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobTicket {
  ticketId: string;
  orderId: string;
  service: string;
  customerIntake: {
    customerEmail: string;
    customerName: string;
    problemSummary: string;
    repoOrCodeUrl?: string;
  };
  paymentReference: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutSessionInput {
  customerName: string;
  customerEmail: string;
  problemSummary: string;
  repoOrCodeUrl?: string;
  customOrderId?: string;
  clientOrderId?: string;
  requestId?: string;
  serviceId?: string;
  source?: string;
  agentId?: string;
  opportunityId?: string;
  offerId?: string;
}

export interface CheckoutSessionResult {
  orderId: string;
  checkoutUrl: string;
  sessionId: string;
}

export interface WebhookResult {
  status:
    | 'PAYMENT_SUCCEEDED'
    | 'PAYMENT_INTENT_MISSING'
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

export interface PaymentStore {
  getOrder(orderId: string): Promise<CustomerOrder | null>;
  createOrderIfAbsent(orderId: string, order: CustomerOrder): Promise<CustomerOrder>;
  updateOrder(orderId: string, order: CustomerOrder): Promise<void>;
  getProcessedEvent(eventId: string): Promise<boolean>;
  commitPaymentSuccess(input: {
    eventId: string;
    eventType: string;
    order: CustomerOrder;
    job: JobTicket;
    paymentIntentId: string;
  }): Promise<'COMMITTED' | 'DUPLICATE'>;
  commitRefund(input: {
    eventId: string;
    eventType: string;
    order?: CustomerOrder;
    chargeId: string;
  }): Promise<'COMMITTED' | 'DUPLICATE'>;
  recordEventIfAbsent(eventId: string, eventType: string): Promise<'COMMITTED' | 'DUPLICATE'>;
  getOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null>;
}

export class FirestorePaymentStore implements PaymentStore {
  private readonly db = new FirestoreRestClient();

  async getOrder(orderId: string): Promise<CustomerOrder | null> {
    return (await this.db.get<CustomerOrder>('orders', orderId))?.data || null;
  }

  async createOrderIfAbsent(orderId: string, order: CustomerOrder): Promise<CustomerOrder> {
    const result = await this.db.createIfAbsent('orders', orderId, order as unknown as Record<string, unknown>);
    return result.document.data as unknown as CustomerOrder;
  }

  async updateOrder(orderId: string, order: CustomerOrder): Promise<void> {
    await this.db.set('orders', orderId, order as unknown as Record<string, unknown>);
  }

  async getProcessedEvent(eventId: string): Promise<boolean> {
    return Boolean(await this.db.get('stripe_events', eventId));
  }

  async commitPaymentSuccess(input: {
    eventId: string;
    eventType: string;
    order: CustomerOrder;
    job: JobTicket;
    paymentIntentId: string;
  }): Promise<'COMMITTED' | 'DUPLICATE'> {
    const now = new Date().toISOString();
    const writes = [
      this.db.makeUpdateWrite(
        'stripe_events',
        input.eventId,
        {
          eventId: input.eventId,
          type: input.eventType,
          processedAt: now,
          metadata: { orderId: input.order.id, jobId: input.job.ticketId },
        },
        { exists: false }
      ),
      this.db.makeUpdateWrite('orders', input.order.id, input.order as unknown as Record<string, unknown>, { exists: true }),
      this.db.makeUpdateWrite('jobs', input.job.ticketId, input.job as unknown as Record<string, unknown>),
      this.db.makeUpdateWrite('payment_intent_mappings', input.paymentIntentId, {
        paymentIntentId: input.paymentIntentId,
        orderId: input.order.id,
        updatedAt: now,
      }),
    ];

    const result = await this.db.atomicCommit(writes);
    return result === 'ALREADY_EXISTS' ? 'DUPLICATE' : 'COMMITTED';
  }

  async commitRefund(input: {
    eventId: string;
    eventType: string;
    order?: CustomerOrder;
    chargeId: string;
  }): Promise<'COMMITTED' | 'DUPLICATE'> {
    const now = new Date().toISOString();
    const writes: Array<Record<string, unknown>> = [
      this.db.makeUpdateWrite(
        'stripe_events',
        input.eventId,
        {
          eventId: input.eventId,
          type: input.eventType,
          processedAt: now,
          metadata: { orderId: input.order?.id || null, chargeId: input.chargeId },
        },
        { exists: false }
      ),
    ];

    if (input.order) {
      writes.push(
        this.db.makeUpdateWrite('orders', input.order.id, input.order as unknown as Record<string, unknown>, { exists: true })
      );
    }

    const result = await this.db.atomicCommit(writes);
    return result === 'ALREADY_EXISTS' ? 'DUPLICATE' : 'COMMITTED';
  }

  async recordEventIfAbsent(eventId: string, eventType: string): Promise<'COMMITTED' | 'DUPLICATE'> {
    const result = await this.db.atomicCommit([
      this.db.makeUpdateWrite(
        'stripe_events',
        eventId,
        {
          eventId,
          type: eventType,
          processedAt: new Date().toISOString(),
          metadata: {},
        },
        { exists: false }
      ),
    ]);
    return result === 'ALREADY_EXISTS' ? 'DUPLICATE' : 'COMMITTED';
  }

  async getOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const mapping = await this.db.get<{ orderId: string }>('payment_intent_mappings', paymentIntentId);
    return mapping?.data.orderId || null;
  }
}

function sanitizeOrderId(input: string): string {
  const safe = input.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (!safe) throw new Error('requestId is invalid');
  return safe.startsWith('ord_') ? safe : `ord_${safe}`;
}

export class VercelStripeService {
  private stripe: Stripe;
  private webhookSecret: string;
  private store: PaymentStore;
  private publicUrl: string;

  constructor(options: {
    stripeApiKey?: string;
    webhookSecret?: string;
    store: PaymentStore;
    publicUrl?: string;
  }) {
    this.store = options.store;
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
    this.publicUrl = (
      options.publicUrl ||
      process.env.GXEON_PUBLIC_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'https://gxeon-wallet-command-center.vercel.app')
    ).replace(/\/$/, '');

    const apiKey = options.stripeApiKey || process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is missing. VercelStripeService fails closed.');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    if (!input.customerEmail || !input.problemSummary) {
      throw new Error('customerEmail and problemSummary are required');
    }

    const requestId = input.clientOrderId || input.customOrderId || input.requestId;
    const orderId = requestId
      ? sanitizeOrderId(requestId)
      : `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    let order = await this.store.getOrder(orderId);

    if (order?.stripeSessionId) {
      const existingSession = await this.stripe.checkout.sessions.retrieve(order.stripeSessionId);
      if (existingSession.url) {
        return {
          orderId: order.id,
          checkoutUrl: existingSession.url,
          sessionId: existingSession.id,
        };
      }
    }

    const targetServiceId = input.serviceId || 'gxeon_quick_fix_v1';
    if (targetServiceId !== 'gxeon_quick_fix_v1') {
      throw new Error(`Unsupported Stripe serviceId: ${targetServiceId}. Only gxeon_quick_fix_v1 is active.`);
    }

    if (!order) {
      const proposed: CustomerOrder = {
        id: orderId,
        requestId: requestId || orderId,
        customerName: input.customerName || 'Customer',
        customerEmail: input.customerEmail.trim().toLowerCase(),
        serviceId: 'gxeon_quick_fix_v1',
        amountBrl: 49.0,
        state: 'CUSTOMER_CREATED',
        problemSummary: input.problemSummary,
        repoOrCodeUrl: input.repoOrCodeUrl,
        source: input.source || 'web',
        agentId: input.agentId,
        opportunityId: input.opportunityId,
        offerId: input.offerId,
        createdAt: now,
        updatedAt: now,
      };
      order = await this.store.createOrderIfAbsent(orderId, proposed);
    }

    const sessionMetadata: Record<string, string> = {
      order_id: orderId,
      service_id: 'gxeon_quick_fix_v1',
      opportunity_id: input.opportunityId || '',
      agent_id: input.agentId || 'GXEON_STRIPE_AGENT',
      source: input.source || 'gxeon_quantum_swarm',
    };

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
                  provider: 'GXEON AI Systems',
                },
              },
            },
            quantity: 1,
          },
        ],
        customer_email: order.customerEmail,
        metadata: {
          order_id: orderId,
          service_id: 'gxeon_quick_fix_v1',
          source: input.source || (order as any).source || 'web',
          agent_id: input.agentId || (order as any).agentId || 'GXEON_STRIPE_AGENT',
          opportunity_id: input.opportunityId || (order as any).opportunityId || '',
          offer_id: input.offerId || (order as any).offerId || '',
        },
        payment_intent_data: {
          metadata: {
            order_id: orderId,
            service_id: 'gxeon_quick_fix_v1',
            source: input.source || (order as any).source || 'web',
            agent_id: input.agentId || (order as any).agentId || 'GXEON_STRIPE_AGENT',
            opportunity_id: input.opportunityId || (order as any).opportunityId || '',
            offer_id: input.offerId || (order as any).offerId || '',
          },
        },
        success_url: `${this.publicUrl}/order/${orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.publicUrl}/order/${orderId}/cancel`,
      },
      { idempotencyKey: `cs_create_${orderId}` }
    );

    if (!session.url || !session.id) {
      throw new Error('Stripe did not return a Checkout URL and session ID');
    }

    order = {
      ...order,
      stripeSessionId: session.id,
      state: 'CHECKOUT_CREATED',
      updatedAt: new Date().toISOString(),
    };
    await this.store.updateOrder(orderId, order);

    return {
      orderId,
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  }

  async handleWebhook(payload: string | Buffer, signatureHeader: string): Promise<WebhookResult> {
    if (!signatureHeader || !this.webhookSecret) {
      return {
        status: 'UNVERIFIED_SIGNATURE',
        processed: false,
        error: 'Missing Stripe signature header or webhook secret',
      };
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signatureHeader, this.webhookSecret);
    } catch {
      return {
        status: 'UNVERIFIED_SIGNATURE',
        processed: false,
        error: 'Stripe signature verification failed',
      };
    }

    if (await this.store.getProcessedEvent(event.id)) {
      return { status: 'DUPLICATE_IGNORED', processed: true };
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const serviceId = session.metadata?.service_id;

      // Phase 9 Money Truth: In production, test sessions NEVER count
      if (process.env.NODE_ENV === 'production' && !event.livemode) {
        return { status: 'INVALID_ORDER_STATE', processed: false, error: 'Test sessions never count toward production revenue (livemode required)' };
      }

      if (session.payment_status !== 'paid') {
        return { status: 'UNPAID', processed: false, error: 'Stripe session is not paid' };
      }
      if (session.currency?.toLowerCase() !== 'brl') {
        return { status: 'CURRENCY_MISMATCH', processed: false, error: 'Stripe currency mismatch' };
      }

      if (serviceId === 'agent_credit_topup') {
        const accountId = session.metadata?.account_id;
        const credits = parseInt(session.metadata?.credits || '0', 10);
        if (!accountId || credits <= 0) {
          return { status: 'INVALID_ORDER_STATE', processed: false, error: 'Missing or invalid account_id or credits in metadata' };
        }

        const { creditAccount } = await import('../src/agent-economy/ledger.js');
        const creditRes = await creditAccount(accountId, credits, `stripe_${event.id}`);
        if (!creditRes.success) {
          return { status: 'INVALID_ORDER_STATE', processed: false, error: creditRes.error?.error.message || 'Failed to credit account' };
        }

        await this.store.recordEventIfAbsent(event.id, event.type);
        return {
          status: 'PAYMENT_SUCCEEDED',
          processed: true,
          orderId: `topup_${event.id}`,
          jobId: `topup_acc_${accountId}`,
        };
      }

      const orderId = session.metadata?.order_id;
      if (session.amount_total !== 4900) {
        return { status: 'AMOUNT_MISMATCH', processed: false, error: 'Stripe amount mismatch' };
      }
      if (serviceId !== 'gxeon_quick_fix_v1') {
        return { status: 'SERVICE_MISMATCH', processed: false, error: 'Stripe service mismatch' };
      }
      if (!orderId) {
        return { status: 'ORDER_NOT_FOUND', processed: false, error: 'Missing order_id metadata' };
      }

      const order = await this.store.getOrder(orderId);
      if (!order) {
        return { status: 'ORDER_NOT_FOUND', processed: false, error: 'Order not found in durable store' };
      }
      if (!order.stripeSessionId || order.stripeSessionId !== session.id) {
        return { status: 'SESSION_MISMATCH', processed: false, error: 'Stripe session binding mismatch' };
      }
      if (!['CUSTOMER_CREATED', 'CHECKOUT_CREATED', 'PAYMENT_PENDING', 'PAYMENT_SUCCEEDED'].includes(order.state)) {
        return { status: 'INVALID_ORDER_STATE', processed: false, error: 'Order state cannot accept payment completion' };
      }

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;

      if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
        return {
          status: 'PAYMENT_INTENT_MISSING',
          processed: false,
          error: 'A genuine Stripe PaymentIntent ID is required',
        };
      }

      const now = new Date().toISOString();
      const paidOrder: CustomerOrder = {
        ...order,
        state: 'PAYMENT_SUCCEEDED',
        stripePaymentIntentId: paymentIntentId,
        updatedAt: now,
      };
      const jobId = `job_${orderId}`;
      const job: JobTicket = {
        ticketId: jobId,
        orderId,
        service: 'gxeon_quick_fix_v1',
        customerIntake: {
          customerEmail: session.customer_details?.email || order.customerEmail,
          customerName: session.customer_details?.name || order.customerName,
          problemSummary: order.problemSummary,
          repoOrCodeUrl: order.repoOrCodeUrl,
        },
        paymentReference: paymentIntentId,
        state: 'JOB_CREATED',
        createdAt: now,
        updatedAt: now,
      };

      const committed = await this.store.commitPaymentSuccess({
        eventId: event.id,
        eventType: event.type,
        order: paidOrder,
        job,
        paymentIntentId,
      });

      if (committed === 'DUPLICATE') {
        return { status: 'DUPLICATE_IGNORED', processed: true };
      }

      return {
        status: 'PAYMENT_SUCCEEDED',
        processed: true,
        orderId,
        jobId,
      };
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      let orderId: string | undefined = charge.metadata?.order_id;
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || null;

      if (!orderId && paymentIntentId) {
        orderId = (await this.store.getOrderIdByPaymentIntent(paymentIntentId)) || undefined;
      }

      let refundedOrder: CustomerOrder | undefined;
      if (orderId) {
        const order = await this.store.getOrder(orderId);
        if (order) {
          refundedOrder = {
            ...order,
            state: 'REFUNDED',
            updatedAt: new Date().toISOString(),
          };
        }
      }

      const committed = await this.store.commitRefund({
        eventId: event.id,
        eventType: event.type,
        order: refundedOrder,
        chargeId: charge.id,
      });

      if (committed === 'DUPLICATE') {
        return { status: 'DUPLICATE_IGNORED', processed: true };
      }

      return {
        status: 'REFUNDED',
        processed: true,
        orderId,
      };
    }

    const committed = await this.store.recordEventIfAbsent(event.id, event.type);
    return {
      status: committed === 'DUPLICATE' ? 'DUPLICATE_IGNORED' : 'UNHANDLED_EVENT',
      processed: true,
    };
  }
}
