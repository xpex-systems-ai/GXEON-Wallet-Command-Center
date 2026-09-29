import { useEffect, useState } from 'react';
import {
  DollarSign,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';

export interface IntegrationMetrics {
  stripeGrossRevenue: string;
  stripeRefunds: string;
  stripeNetRevenue: string;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  creditsSold: number;
  creditsConsumed: number;
  jobsPaid: number;
  jobsDelivered: number;
  moneyTruth: string;
}

export interface IntegrationStatus {
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  durableStoreConfigured: boolean;
  firestoreConnected: boolean;
  storeMode: string;
  liveMode: boolean;
  realRevenue: string;
  stripeEnvironment: string;
  metrics?: IntegrationMetrics;
}

export function RealRevenuePanel() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integration-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.warn('Failed to load integration status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const metrics = status?.metrics || {
    stripeGrossRevenue: 'R$0.00',
    stripeRefunds: 'R$0.00',
    stripeNetRevenue: status?.realRevenue || 'R$0.00',
    successfulPayments: 0,
    pendingPayments: 0,
    failedPayments: 0,
    creditsSold: 0,
    creditsConsumed: 0,
    jobsPaid: 0,
    jobsDelivered: 0,
    moneyTruth: 'REAL MONEY != INTERNAL CREDITS',
  };

  return (
    <Card glow="orange" className="border-t-2 border-t-[#FF7A00]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E314F]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-[#FF7A00] uppercase tracking-widest flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> GXEON Money Truth
            </span>
            <span className="text-slate-600">//</span>
            <Badge variant={status?.liveMode ? 'orange' : 'cyan'}>
              STRIPE {status?.stripeEnvironment || 'CONNECTING'}
            </Badge>
          </div>
          <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
            Real Revenue & Financial Settlement
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 border border-slate-700 rounded-lg transition"
            title="Atualizar métricas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="/fix"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-black bg-[#FF7A00] hover:bg-[#FF8A1A] font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm"
          >
            Abrir /fix <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Grid of Money Truth Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {/* Metric 1: Net Revenue */}
        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            Receita Líquida Real
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {metrics.stripeNetRevenue}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" /> Liquidado no Stripe
          </div>
        </div>

        {/* Metric 2: Gross vs Refunds */}
        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            Bruto / Reembolsos
          </div>
          <div className="text-xl font-bold font-mono text-slate-200">
            {metrics.stripeGrossRevenue}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Estornos: {metrics.stripeRefunds}
          </div>
        </div>

        {/* Metric 3: Pagamentos Concluídos */}
        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            Vendas Pagas
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {metrics.successfulPayments}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Jobs executados: {metrics.jobsDelivered}
          </div>
        </div>

        {/* Metric 4: Internal Credits */}
        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            Créditos Internos
          </div>
          <div className="text-2xl font-bold font-mono text-[#00D4FF]">
            {metrics.creditsSold}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Consumidos: {metrics.creditsConsumed}
          </div>
        </div>
      </div>

      {/* Money Truth Invariant Banner */}
      <div className="mt-4 p-3 bg-slate-900/80 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            <strong>INVARIANTE:</strong> REAL MONEY ≠ INTERNAL CREDITS. Apenas cobranças confirmadas por webhook do Stripe contam como receita.
          </span>
        </div>
        <div className="hidden sm:block text-[11px] text-slate-500">
          Store: {status?.storeMode || 'FIRESTORE'}
        </div>
      </div>
    </Card>
  );
}
