import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Terminal,
  Zap,
  RotateCcw,
  Bot,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { salesService, StripeServerStatus } from '../../services/salesService';
import {
  OrderRecord,
  JobRecord,
  GXEON_SERVICES,
  PaymentState,
} from '../../../shared/stripe/paymentTypes';

export const SalesView: React.FC = () => {
  const [stripeStatus, setStripeStatus] = useState<StripeServerStatus | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [problemSummary, setProblemSummary] = useState('');
  const [repoOrCodeUrl, setRepoOrCodeUrl] = useState('');
  const [requestId, setRequestId] = useState(
    () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );

  const [activeSessionUrl, setActiveSessionUrl] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);

  const fetchOrdersAndStatus = async () => {
    try {
      const [status, data] = await Promise.all([
        salesService.getStatus(),
        salesService.getAllOrders(),
      ]);
      setStripeStatus(status);
      setOrders(data.orders);
      setJobs(data.jobs);

      // Check URL query parameters for session completion return
      const params = new URLSearchParams(window.location.search);
      const reqId = params.get('request_id');
      const statusParam = params.get('status');

      if (reqId) {
        const orderData = await salesService.getOrder(reqId);
        if (orderData) {
          setActiveOrder(orderData.order);
          setActiveJob(orderData.job);
          if (statusParam === 'success') {
            setSuccessMsg(`Stripe Checkout completed for Request ID: ${reqId}`);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching sales data:', e);
    }
  };

  useEffect(() => {
    fetchOrdersAndStatus();
    const interval = setInterval(fetchOrdersAndStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStartCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await salesService.createCheckout({
        requestId,
        customerName,
        customerEmail,
        problemSummary,
        repoOrCodeUrl,
      });

      setActiveSessionUrl(result.checkoutUrl);
      setSuccessMsg(
        result.isExisting
          ? 'Retrieved existing idempotent Stripe checkout session.'
          : 'New Stripe checkout session created.'
      );
      await fetchOrdersAndStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout initiation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const service = GXEON_SERVICES.gxeon_quick_fix_v1;

  const getStateBadge = (state: PaymentState) => {
    switch (state) {
      case 'PAYMENT_SUCCEEDED':
      case 'JOB_CREATED':
      case 'QA_PASSED':
      case 'DELIVERED':
        return <Badge variant="green">{state}</Badge>;
      case 'CHECKOUT_CREATED':
      case 'PAYMENT_PENDING':
      case 'EXECUTING':
        return <Badge variant="cyan">{state}</Badge>;
      case 'FAILED':
      case 'REFUNDED':
        return <Badge variant="red">{state}</Badge>;
      default:
        return <Badge variant="amber">{state}</Badge>;
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Top Banner: Strict Money Truth */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#111C30] via-[#152238] to-[#111C30] border border-[#1E314F] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-[#FF7A00] tracking-widest uppercase">
                GXEON Dual Revenue Engine
              </span>
              <span className="text-slate-600">//</span>
              <span className="text-xs text-slate-400">Direct Sales & Stripe Authority</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Stripe Direct Sales & Autonomous Triage
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Server-authoritative Stripe Checkout, webhook verification, idempotent order flow, and automated job dispatch.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="px-3 py-2 rounded-lg bg-[#0B1220] border border-[#1E314F] text-xs">
              <div className="text-slate-400 text-[10px]">MONEY TRUTH</div>
              <div className="text-emerald-400 font-bold">REAL REVENUE: R$0.00</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#0B1220] border border-[#1E314F] text-xs">
              <div className="text-slate-400 text-[10px]">STRIPE MODE</div>
              <div className="text-amber-400 font-bold">TEST ONLY (LIVE DISABLED)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Invariant Callout */}
      <div className="bg-[#111C30] border-l-4 border-emerald-400 border-y border-r border-[#1E314F] rounded-r-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <div className="font-bold text-white">Absolute Trusted Backend Boundary Enforced</div>
          <p className="text-slate-400">
            Browser bundle contains zero Stripe secret keys (<code className="text-white">sk_test_*</code>, <code className="text-white">whsec_*</code>). All checkout creations and webhook signatures are handled exclusively by server authority.
          </p>
        </div>
      </div>

      {/* Stripe Runtime Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card glow="cyan">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase">Server Authority</span>
            <Terminal className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="text-lg font-bold text-white">READY (EXPRESS)</div>
          <p className="text-[11px] text-slate-400 mt-2">
            Endpoints: <code className="text-[#00D4FF]">/api/checkout</code> & <code className="text-[#00D4FF]">/api/stripe/webhook</code>
          </p>
        </Card>

        <Card glow={stripeStatus?.secretKeyConfigured ? 'cyan' : 'orange'}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase">Stripe Secret Key</span>
            <CreditCard className={`w-4 h-4 ${stripeStatus?.secretKeyConfigured ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div className="text-lg font-bold text-white">
            {stripeStatus?.secretKeyConfigured ? 'STORED (SERVER)' : 'SERVER SECRETS PENDING'}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {stripeStatus?.secretKeyConfigured
              ? 'Server has STRIPE_SECRET_KEY loaded.'
              : 'Requires STRIPE_SECRET_KEY in server environment.'}
          </p>
        </Card>

        <Card glow={stripeStatus?.webhookKeyConfigured ? 'cyan' : 'orange'}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase">Webhook Verification</span>
            <CheckCircle2 className={`w-4 h-4 ${stripeStatus?.webhookKeyConfigured ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div className="text-lg font-bold text-white">
            {stripeStatus?.webhookKeyConfigured ? 'ACTIVE (whsec)' : 'STANDBY (whsec)'}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Official <code className="text-slate-300">stripe.webhooks.constructEvent</code> signature verification.
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase">Active Orders / Jobs</span>
            <Zap className="w-4 h-4 text-[#FF7A00]" />
          </div>
          <div className="text-lg font-bold text-white">
            {orders.length} Orders • {jobs.length} Jobs
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            State transitions tracked with strict idempotency.
          </p>
        </Card>
      </div>

      {/* Main Dual Grid: Intake & Live Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Customer Intake & Hosted Checkout Launcher */}
        <Card glow="orange">
          <div className="flex items-center justify-between border-b border-[#1E314F] pb-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#FF7A00]" />
                Direct Intake: {service.name}
              </h2>
              <p className="text-xs text-slate-400">Fixed rate: R$ 49,00 (4900 BRL) • Server-enforced</p>
            </div>
            <Badge variant="orange">4900 BRL</Badge>
          </div>

          <form onSubmit={handleStartCheckout} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Stable Request ID (Idempotency Key Source)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  className="w-full bg-[#0B1220] border border-[#1E314F] rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF7A00]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setRequestId(`req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)}
                  className="px-2.5 py-1.5 rounded bg-[#152238] border border-[#1E314F] text-slate-300 hover:text-white"
                  title="Generate new unique request ID"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[10px] text-slate-400">Repeated requests with identical ID guarantee idempotent session reuse.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Customer Full Name</label>
                <input
                  type="text"
                  placeholder="Carlos Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-[#0B1220] border border-[#1E314F] rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF7A00]"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Customer Email</label>
                <input
                  type="email"
                  placeholder="carlos@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-[#0B1220] border border-[#1E314F] rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF7A00]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Repository or Codebase URL</label>
              <input
                type="url"
                placeholder="https://github.com/my-org/service-api"
                value={repoOrCodeUrl}
                onChange={(e) => setRepoOrCodeUrl(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#1E314F] rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF7A00]"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Problem Diagnosis & Environment Summary</label>
              <textarea
                rows={3}
                placeholder="Describe bug symptoms, failing tests, or broken integration..."
                value={problemSummary}
                onChange={(e) => setProblemSummary(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#1E314F] rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF7A00]"
                required
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-black font-bold text-xs font-mono rounded-lg transition-all shadow-glow-orange flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Generating Server Session...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Generate Stripe Checkout Session (R$ 49,00)
                </>
              )}
            </button>
          </form>

          {/* Active Hosted Checkout Session Action */}
          {activeSessionUrl && (
            <div className="mt-4 pt-4 border-t border-[#1E314F] space-y-2">
              <div className="text-xs text-slate-300 font-bold flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-[#00D4FF]" />
                Official Stripe Hosted Checkout Page Ready:
              </div>
              <a
                href={activeSessionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center py-2 px-3 rounded bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-bold text-xs transition-all"
              >
                Open Stripe Checkout Page →
              </a>
              <p className="text-[10px] text-slate-400">
                Uses official Stripe test payment methods (4242 4242...). Never use real card credentials.
              </p>
            </div>
          )}
        </Card>

        {/* Right: Payment State Machine & Persisted Pipeline */}
        <Card glow="cyan" className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E314F] pb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#00D4FF]" />
                Payment State Machine & Job Pipeline
              </h2>
              <p className="text-xs text-slate-400">Strict money truth: CUSTOMER_PAYMENT != BANK_PAYOUT</p>
            </div>
            <button
              onClick={fetchOrdersAndStatus}
              className="p-1.5 rounded bg-[#111C30] hover:bg-[#152238] border border-[#1E314F] text-slate-300"
              title="Refresh pipeline state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* State Transition Flow Visualizer */}
          <div className="bg-[#0B1220] p-3 rounded-lg border border-[#1E314F] text-[11px] text-slate-300 space-y-2">
            <div className="font-bold text-[#FF7A00] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Finite State Transitions:
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-slate-300">CUSTOMER_CREATED</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-slate-300">CHECKOUT_CREATED</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-amber-400">PAYMENT_PENDING</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-emerald-400">PAYMENT_SUCCEEDED</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-[#00D4FF]">JOB_CREATED</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-purple-400">DELIVERED</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-[#152238] text-slate-400">PAYOUT_PAID_TO_BANK</span>
            </div>
          </div>

          {/* Selected / Recent Order Inspector */}
          {activeOrder ? (
            <div className="bg-[#0B1220] p-4 rounded-lg border border-[#1E314F] space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">Active Order: {activeOrder.orderId}</span>
                {getStateBadge(activeOrder.state)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
                <div>Request: <span className="text-slate-200">{activeOrder.requestId}</span></div>
                <div>Amount: <span className="text-emerald-400">R$ {(activeOrder.amountTotal / 100).toFixed(2)} {activeOrder.currency.toUpperCase()}</span></div>
                <div>Customer: <span className="text-slate-200">{activeOrder.customerName}</span></div>
                <div>Email: <span className="text-slate-200">{activeOrder.customerEmail}</span></div>
              </div>

              {activeJob && (
                <div className="pt-2 border-t border-[#1E314F] space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#00D4FF] font-bold">Autonomous Job: {activeJob.jobId}</span>
                    <Badge variant="cyan">{activeJob.status}</Badge>
                  </div>
                  <div className="text-[10px] text-slate-400">Worker: {activeJob.assignedEngine}</div>
                  <div className="bg-[#111C30] p-2 rounded text-[10px] text-slate-300 font-mono space-y-0.5 max-h-24 overflow-y-auto">
                    {activeJob.executionLogs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs">
              No order selected. Submit the intake form to generate a live order.
            </div>
          )}

          {/* Persisted Orders List */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Persisted Backend Orders ({orders.length})</span>
              <span className="text-[10px] text-slate-500">Live Server Memory / Firestore</span>
            </div>

            {orders.length === 0 ? (
              <div className="p-4 rounded bg-[#0B1220] border border-[#1E314F] text-center text-xs text-slate-500">
                Zero orders generated yet. All data is backed by server authority.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {orders.map((ord) => (
                  <div
                    key={ord.orderId}
                    onClick={() => {
                      setActiveOrder(ord);
                      const matchingJob = jobs.find((j) => j.orderId === ord.orderId) || null;
                      setActiveJob(matchingJob);
                    }}
                    className={`p-2.5 rounded border text-xs cursor-pointer transition-all ${
                      activeOrder?.orderId === ord.orderId
                        ? 'bg-[#152238] border-[#FF7A00]'
                        : 'bg-[#0B1220] border-[#1E314F] hover:bg-[#111C30]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold">{ord.customerName}</span>
                      {getStateBadge(ord.state)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>R$ {(ord.amountTotal / 100).toFixed(2)}</span>
                      <span>Ref: {ord.requestId.slice(0, 16)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Phase 12 Groundwork: Machine-to-Machine (M2M) Agent Economy Preview */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-white">
              GXEON Agent Economy — M2M Contracts Foundation (Phase 12)
            </h2>
          </div>
          <Badge variant="purple">PREVIEW ONLY</Badge>
        </div>
        <p className="text-xs text-slate-300">
          Autonomous machine-callable endpoints are registered in server routing (<code className="text-[#00D4FF]">GET /api/v1/services</code>, <code className="text-[#00D4FF]">POST /api/v1/quote</code>, <code className="text-[#00D4FF]">POST /api/v1/jobs</code>). Billing remains inactive until Phase 2 activation.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-[#0B1220] rounded border border-[#1E314F] text-xs space-y-1">
            <div className="text-white font-bold flex items-center justify-between">
              <span>GXEON URL VERIFY</span>
              <span className="text-[10px] text-purple-400 font-mono">machineCallable: true</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Input: <code className="text-slate-300">url[]</code> • Output: <code className="text-slate-300">verification[]</code> • Pricing: <code className="text-slate-300">per_item</code>
            </p>
          </div>
          <div className="p-3 bg-[#0B1220] rounded border border-[#1E314F] text-xs space-y-1">
            <div className="text-white font-bold flex items-center justify-between">
              <span>GXEON QUICK AUDIT</span>
              <span className="text-[10px] text-purple-400 font-mono">machineCallable: true</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Input: <code className="text-slate-300">address_or_code</code> • Output: <code className="text-slate-300">audit_summary</code> • Pricing: <code className="text-slate-300">fixed</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
