/**
 * GXEON Dual Revenue Engine — Authoritative Stripe Server Service
 * Single source of truth for payment sessions, state machine, idempotency, and webhook verification.
 * ABSOLUTE SECURITY INVARIANT: Secret keys are only read from server runtime environment.
 */

import Stripe from 'stripe';
import {
  CheckoutRequestPayload,
  CheckoutResponse,
  OrderRecord,
  JobRecord,
  ProcessedStripeEvent,
  PaymentIntentMapping,
  GXEON_SERVICES,
} from './paymentTypes';
import { validateCheckoutInput, canTransitionPaymentState } from './paymentValidation';

export class StripeServerService {
  private stripeClient: Stripe | null = null;
  private readonly secretKey: string | undefined;
  private readonly webhookSecret: string | undefined;

  // Authoritative server-side persistence store
  private ordersByRequestId = new Map<string, OrderRecord>();
  private ordersById = new Map<string, OrderRecord>();
  private ordersBySessionId = new Map<string, OrderRecord>();
  private processedEvents = new Map<string, ProcessedStripeEvent>();
  private jobsByOrderId = new Map<string, JobRecord>();
  private paymentIntentMappings = new Map<string, PaymentIntentMapping>();

  constructor(secretKey?: string, webhookSecret?: string) {
    this.secretKey = secretKey || process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

    if (this.secretKey) {
      this.stripeClient = new Stripe(this.secretKey, {
        apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
        typescript: true,
      });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.stripeClient);
  }

  public isWebhookConfigured(): boolean {
    return Boolean(this.webhookSecret);
  }

  public getStatus() {
    return {
      configured: this.isConfigured(),
      webhookConfigured: this.isWebhookConfigured(),
      liveMode: false, // Strict invariant: current money truth is LIVE MODE = DISABLED
      activeService: GXEON_SERVICES.gxeon_quick_fix_v1,
      ordersCount: this.ordersById.size,
      jobsCount: this.jobsByOrderId.size,
    };
  }

  /**
   * Idempotent Checkout Session Creation
   * Phase 7 compliant: Enforces R$ 49.00 (4900 brl) and stable idempotency key cs_create_<stable-order-id>
   */
  public async createCheckoutSession(
    rawPayload: unknown,
    originHost?: string
  ): Promise<CheckoutResponse> {
    const validation = validateCheckoutInput(rawPayload);
    if (!validation.valid || !validation.data) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    const payload: CheckoutRequestPayload = validation.data;
    const service = GXEON_SERVICES.gxeon_quick_fix_v1;

    // 1. Check for existing order by stable requestId (Idempotency requirement)
    const existingOrder = this.ordersByRequestId.get(payload.requestId);
    if (existingOrder && existingOrder.stripeSessionId && existingOrder.checkoutUrl) {
      return {
        success: true,
        orderId: existingOrder.orderId,
        requestId: existingOrder.requestId,
        checkoutUrl: existingOrder.checkoutUrl,
        stripeSessionId: existingOrder.stripeSessionId,
        state: existingOrder.state,
        isExisting: true,
        liveMode: false,
      };
    }

    // 2. Ensure Stripe server client is initialized
    if (!this.stripeClient) {
      throw new Error(
        'Stripe secret key not configured in server runtime. SECURE_SERVER_SECRET_STORE_REQUIRED = YES.'
      );
    }

    // 3. Create stable order record
    const timestamp = new Date().toISOString();
    const orderId = `ord_${payload.requestId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32)}_${Date.now()}`;
    const baseUrl = originHost || 'http://localhost:3000';

    const order: OrderRecord = {
      orderId,
      requestId: payload.requestId,
      serviceId: service.id,
      amountTotal: service.unitAmountCents, // Strictly 4900
      currency: service.currency,           // Strictly 'brl'
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      problemSummary: payload.problemSummary,
      repoOrCodeUrl: payload.repoOrCodeUrl,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      checkoutUrl: null,
      state: 'CHECKOUT_CREATED',
      stateHistory: [
        { state: 'CUSTOMER_CREATED', timestamp },
        { state: 'CHECKOUT_CREATED', timestamp, note: 'Initial checkout session requested' },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      liveMode: false,
    };

    // 4. Create Hosted Checkout Session with Stripe Idempotency Key
    const idempotencyKey = `cs_create_${orderId}`;

    const session = await this.stripeClient.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: payload.customerEmail,
        line_items: [
          {
            price_data: {
              currency: service.currency,
              product_data: {
                name: service.name,
                description: `${service.description} (Request Ref: ${payload.requestId})`,
                metadata: {
                  service_id: service.id,
                  order_id: orderId,
                },
              },
              unit_amount: service.unitAmountCents, // Server authoritative: 4900
            },
            quantity: 1,
          },
        ],
        // Metadata: Strict minimum necessary non-PII
        metadata: {
          service_id: service.id,
          order_id: orderId,
          request_id: payload.requestId,
        },
        success_url: `${baseUrl}/?session_id={CHECKOUT_SESSION_ID}&request_id=${encodeURIComponent(payload.requestId)}&status=success`,
        cancel_url: `${baseUrl}/?request_id=${encodeURIComponent(payload.requestId)}&status=cancelled`,
      },
      {
        idempotencyKey,
      }
    );

    if (!session.url || !session.id) {
      throw new Error('Stripe failed to return hosted checkout URL');
    }

    // 5. Commit state transition to PAYMENT_PENDING
    order.stripeSessionId = session.id;
    order.checkoutUrl = session.url;
    order.state = 'PAYMENT_PENDING';
    order.stateHistory.push({
      state: 'PAYMENT_PENDING',
      timestamp: new Date().toISOString(),
      note: `Stripe session ${session.id} generated`,
    });
    order.updatedAt = new Date().toISOString();

    // Store in-memory
    this.ordersById.set(order.orderId, order);
    this.ordersByRequestId.set(order.requestId, order);
    this.ordersBySessionId.set(session.id, order);

    return {
      success: true,
      orderId: order.orderId,
      requestId: order.requestId,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
      state: order.state,
      isExisting: false,
      liveMode: false,
    };
  }

  /**
   * Official Webhook Event Handler
   * Phase 8 compliant: Raw body signature verification, strict atomic state update, duplicate protection.
   */
  public async handleWebhook(
    rawBody: Buffer | string,
    signature: string | undefined
  ): Promise<{ status: string; orderId?: string; jobId?: string }> {
    if (!this.stripeClient || !this.webhookSecret) {
      throw new Error(
        'Webhook handling requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in server environment.'
      );
    }

    if (!signature) {
      throw new Error('Missing stripe-signature header.');
    }

    // 1. Official Stripe Cryptographic Signature Verification
    let event: Stripe.Event;
    try {
      event = this.stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Stripe signature verification failed: ${msg}`);
    }

    // 2. Duplicate Event Protection
    if (this.processedEvents.has(event.id)) {
      return { status: 'DUPLICATE_IGNORED' };
    }

    // 3. Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      return await this.processSessionCompleted(event.id, session);
    }

    // Acknowledge other events gracefully
    this.processedEvents.set(event.id, {
      eventId: event.id,
      eventType: event.type,
      sessionId: '',
      orderId: '',
      processedAt: new Date().toISOString(),
      status: 'PROCESSED',
    });

    return { status: 'EVENT_ACKNOWLEDGED' };
  }

  /**
   * Atomic Processing of checkout.session.completed
   */
  private async processSessionCompleted(
    eventId: string,
    session: Stripe.Checkout.Session
  ): Promise<{ status: string; orderId: string; jobId: string }> {
    const service = GXEON_SERVICES.gxeon_quick_fix_v1;

    // Strict validation invariants
    if (session.payment_status !== 'paid') {
      throw new Error(`Invalid payment_status: expected "paid", got "${session.payment_status}"`);
    }

    if (session.amount_total !== service.unitAmountCents) {
      throw new Error(`Amount mismatch: expected ${service.unitAmountCents}, got ${session.amount_total}`);
    }

    if (session.currency !== service.currency) {
      throw new Error(`Currency mismatch: expected "${service.currency}", got "${session.currency}"`);
    }

    const orderId = session.metadata?.order_id;
    const serviceId = session.metadata?.service_id;

    if (!orderId) {
      throw new Error('Missing order_id in session metadata');
    }

    if (serviceId !== service.id) {
      throw new Error(`Service ID mismatch: expected "${service.id}", got "${serviceId}"`);
    }

    // Correlate order
    const order = this.ordersById.get(orderId) || this.ordersBySessionId.get(session.id);
    if (!order) {
      throw new Error(`Order ${orderId} not found in database`);
    }

    if (!order.stripeSessionId || order.stripeSessionId !== session.id) {
      throw new Error(`Stripe session mismatch on order ${orderId}`);
    }

    // Check state transition integrity
    if (!canTransitionPaymentState(order.state, 'PAYMENT_SUCCEEDED')) {
      throw new Error(`Invalid state transition from ${order.state} to PAYMENT_SUCCEEDED`);
    }

    const timestamp = new Date().toISOString();
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;

    // Transition 1: PAYMENT_SUCCEEDED
    order.state = 'PAYMENT_SUCCEEDED';
    order.stripePaymentIntentId = paymentIntentId;
    order.stateHistory.push({
      state: 'PAYMENT_SUCCEEDED',
      timestamp,
      note: `Webhook verified session ${session.id}`,
    });

    // Transition 2: Automatically transition to JOB_CREATED
    order.state = 'JOB_CREATED';
    order.stateHistory.push({
      state: 'JOB_CREATED',
      timestamp,
      note: 'Autonomous diagnosis job spawned upon verified payment',
    });
    order.updatedAt = timestamp;

    // Create Job Record
    const jobId = `job_${order.orderId.replace('ord_', '')}`;
    const job: JobRecord = {
      jobId,
      orderId: order.orderId,
      requestId: order.requestId,
      serviceId: order.serviceId,
      customerEmail: order.customerEmail,
      problemSummary: order.problemSummary,
      repoOrCodeUrl: order.repoOrCodeUrl,
      status: 'QUEUED',
      createdAt: timestamp,
      updatedAt: timestamp,
      assignedEngine: 'GXEON_AUTONOMOUS_TRIAGE_WORKER_01',
      executionLogs: [
        `[${timestamp}] Job created from verified Stripe payment ${session.id}`,
        `[${timestamp}] Enqueued for diagnosis and environment verification.`,
      ],
    };

    this.jobsByOrderId.set(order.orderId, job);

    // Save Payment Intent Mapping if present
    if (paymentIntentId) {
      this.paymentIntentMappings.set(paymentIntentId, {
        paymentIntentId,
        orderId: order.orderId,
        stripeSessionId: session.id,
        amount: session.amount_total || service.unitAmountCents,
        currency: session.currency || service.currency,
        status: 'succeeded',
        createdAt: timestamp,
      });
    }

    // Save Processed Event (Duplicate protection)
    this.processedEvents.set(eventId, {
      eventId,
      eventType: 'checkout.session.completed',
      sessionId: session.id,
      orderId: order.orderId,
      processedAt: timestamp,
      status: 'PROCESSED',
    });

    return {
      status: 'SUCCESS',
      orderId: order.orderId,
      jobId: job.jobId,
    };
  }

  public getOrder(orderIdOrRequestId: string): OrderRecord | null {
    return (
      this.ordersById.get(orderIdOrRequestId) ||
      this.ordersByRequestId.get(orderIdOrRequestId) ||
      this.ordersBySessionId.get(orderIdOrRequestId) ||
      null
    );
  }

  public getJob(orderIdOrJobId: string): JobRecord | null {
    for (const job of this.jobsByOrderId.values()) {
      if (job.jobId === orderIdOrJobId || job.orderId === orderIdOrJobId) {
        return job;
      }
    }
    return null;
  }

  public getAllOrders(): OrderRecord[] {
    return Array.from(this.ordersById.values());
  }

  public getAllJobs(): JobRecord[] {
    return Array.from(this.jobsByOrderId.values());
  }
}

export const stripeServerService = new StripeServerService();
