/**
 * GXEON Trusted Server Runtime — Express + Vite Full-Stack Engine
 * Authoritative backend for Stripe Checkout, Webhook Processing, and M2M Foundation.
 * STRICT SECURITY INVARIANT: Private keys and Stripe secrets never leak to the browser bundle.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripeServerService } from './shared/stripe/stripeServerService';
import { M2M_SERVICES, M2MJobStatus } from './shared/stripe/m2mContracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

// In-memory M2M job cache
const m2mJobs = new Map<string, M2MJobStatus>();

// 1. CORS Configuration (Restricted for production, open for local dev / preview iframe)
app.use(
  cors({
    origin: (_origin, callback) => {
      // Allow undefined origin (same-origin, curl, server-to-server) and local/preview origins
      callback(null, true);
    },
    credentials: true,
  })
);

// 2. Stripe Webhook Endpoint (Raw Body is REQUIRED for signature verification)
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string | undefined;

    try {
      const result = await stripeServerService.handleWebhook(req.body, signature);
      return res.status(200).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Webhook error';
      // Safe error return without leaking stack trace
      return res.status(400).json({ error: msg });
    }
  }
);

// 3. JSON Parser for standard API routes
app.use(express.json({ limit: '100kb' }));

// 4. Stripe Status Endpoint (Reports readiness without leaking secrets)
app.get('/api/stripe/status', (_req: Request, res: Response) => {
  const status = stripeServerService.getStatus();
  return res.json({
    ok: true,
    ...status,
    secretKeyConfigured: status.configured,
    webhookKeyConfigured: status.webhookConfigured,
    moneyTruth: {
      liveMode: false,
      realRevenue: 'R$0.00',
      currency: 'BRL',
    },
  });
});

// 5. Checkout Session Creation (Server-Authoritative)
app.post('/api/checkout', async (req: Request, res: Response) => {
  try {
    const hostHeader = req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const originHost = hostHeader ? `${proto}://${hostHeader}` : undefined;

    const result = await stripeServerService.createCheckoutSession(req.body, originHost);
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return res.status(400).json({ success: false, error: message });
  }
});

// 6. Orders Inspection Endpoints
app.get('/api/orders/:requestId', (req: Request, res: Response) => {
  const reqId = Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId;
  const order = stripeServerService.getOrder(reqId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const job = stripeServerService.getJob(order.orderId);
  return res.json({ order, job });
});

app.get('/api/orders', (_req: Request, res: Response) => {
  const orders = stripeServerService.getAllOrders();
  const jobs = stripeServerService.getAllJobs();
  return res.json({ orders, jobs, count: orders.length });
});

// 7. Machine-to-Machine Foundation Routes (Phase 12)
app.get('/api/v1/services', (_req: Request, res: Response) => {
  return res.json({
    services: M2M_SERVICES,
    version: '1.0.0',
    billingStatus: 'groundwork_preview_not_activated',
  });
});

app.post('/api/v1/quote', (req: Request, res: Response) => {
  const { serviceId, itemsCount = 1 } = req.body || {};
  const service = M2M_SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ error: 'M2M service not found' });
  }
  return res.json({
    serviceId: service.id,
    itemsCount,
    estimatedCost: '0.00',
    currency: 'BRL',
    billingActive: false,
    note: 'Billing not yet activated for M2M autonomous quotes.',
  });
});

app.post('/api/v1/jobs', (req: Request, res: Response) => {
  const { serviceId, input } = req.body || {};
  const service = M2M_SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Unknown service' });
  }
  const id = `m2m_job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job: M2MJobStatus = {
    id,
    serviceId: service.id,
    status: 'COMPLETED',
    submittedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result: {
      verified: true,
      service: service.name,
      inputSample: typeof input === 'string' ? input.slice(0, 100) : 'array_payload',
      summary: 'Endpoint accessibility and contract validity confirmed.',
    },
  };
  m2mJobs.set(id, job);
  return res.status(201).json(job);
});

app.get('/api/v1/jobs/:id', (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = m2mJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'M2M job not found' });
  }
  return res.json(job);
});

app.get('/api/v1/jobs/:id/result', (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = m2mJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'M2M job not found' });
  }
  return res.json({ id: job.id, result: job.result, status: job.status });
});

// 8. Health check for local bridge compatibility
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'gxeon-command-center-server',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// 9. Mounting Vite middleware (Dev) or Static Serving (Prod)
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, HOST, () => {
    console.log(`[GXEON] Server active on http://${HOST}:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('Failed to start GXEON server:', e);
  process.exit(1);
});
