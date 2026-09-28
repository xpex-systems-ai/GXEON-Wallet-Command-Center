/**
 * GXEON Client Sales & Order Service
 * Communicates ONLY with trusted backend routes (/api/checkout, /api/orders, /api/stripe/status).
 * ABSOLUTE SECURITY INVARIANT: No Stripe keys, secrets, or tokens exist on the client.
 */

import {
  CheckoutRequestPayload,
  CheckoutResponse,
  OrderRecord,
  JobRecord,
} from '../../shared/stripe/paymentTypes';

export interface StripeServerStatus {
  ok: boolean;
  configured: boolean;
  webhookConfigured: boolean;
  secretKeyConfigured: boolean;
  webhookKeyConfigured: boolean;
  liveMode: boolean;
  moneyTruth: {
    liveMode: boolean;
    realRevenue: string;
    currency: string;
  };
  ordersCount: number;
  jobsCount: number;
}

export class SalesService {
  async getStatus(): Promise<StripeServerStatus | null> {
    try {
      const res = await fetch('/api/stripe/status');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async createCheckout(payload: CheckoutRequestPayload): Promise<CheckoutResponse> {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to initiate checkout session');
    }
    return data;
  }

  async getOrder(requestId: string): Promise<{ order: OrderRecord; job: JobRecord | null } | null> {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(requestId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async getAllOrders(): Promise<{ orders: OrderRecord[]; jobs: JobRecord[]; count: number }> {
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) return { orders: [], jobs: [], count: 0 };
      return await res.json();
    } catch {
      return { orders: [], jobs: [], count: 0 };
    }
  }
}

export const salesService = new SalesService();
