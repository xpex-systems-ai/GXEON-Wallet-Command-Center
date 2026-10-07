import { useEffect, useState } from 'react';
import {
  DollarSign,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Bot,
  WalletCards,
  Radar,
  CircleDollarSign,
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
  moneyTruthSnapshot?: MoneyTruthStatus;
}

interface MoneyTruthStatus {
  observedAt: string;
  agent: {
    name: string;
    mode: string;
    status: string;
    canScan: boolean;
    canQualify: boolean;
    canReconcile: boolean;
  };
  rtc: {
    asset: string;
    address: string;
    balance: string | null;
    status: string;
    source: string;
    verifiedAt: string | null;
    historyCount: number | null;
    pendingRtc?: number;
    pendingTransactions?: number;
    experimentalToken: boolean;
  };
  usdc: {
    settledRevenue: string;
    settledPayments: number;
    coinbase: {
      status: string;
      available: string | null;
      hold: string | null;
      openOrders: number | null;
      verifiedAt: string | null;
    };
  };
  radar: Record<string, unknown> | null;
}

export function RealRevenuePanel() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [moneyTruth, setMoneyTruth] = useState<MoneyTruthStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const integrationRes = await fetch('/api/integration-status', { cache: 'no-store' });

      if (integrationRes.ok) {
        const data = await integrationRes.json() as IntegrationStatus;
        setStatus(data);
        setMoneyTruth(data.moneyTruthSnapshot || null);
      }
    } catch (e) {
      console.warn('Failed to load money truth status:', e);
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

  const rtcConfirmed = moneyTruth?.rtc.status === 'CONFIRMED' && moneyTruth.rtc.balance !== null;
  const coinbaseReady = moneyTruth?.usdc.coinbase.status === 'READ_ONLY_SNAPSHOT';
  const radarActive = Boolean(moneyTruth?.radar);

  return (
    <Card glow="orange" className="border-t-2 border-t-[#FF7A00]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E314F]">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono font-bold text-[#FF7A00] uppercase tracking-widest flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> GXEON Money Truth
            </span>
            <span className="text-slate-600">//</span>
            <Badge variant={status?.liveMode ? 'orange' : 'cyan'}>
              STRIPE {status?.stripeEnvironment || 'CONNECTING'}
            </Badge>
            <Badge variant={moneyTruth?.agent.status === 'ACTIVE' ? 'green' : 'amber'}>
              AGENT {moneyTruth?.agent.mode || 'CONNECTING'}
            </Badge>
          </div>
          <h2 className="text-lg font-bold font-mono text-white">
            Real Revenue, Wallets & Settlement
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-1">
            Read-only by default. Claims, signatures, trades, transfers, withdrawals and spending require human approval.
          </p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
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

        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            RTC Confirmado
          </div>
          <div className={`text-xl font-bold font-mono ${rtcConfirmed ? 'text-[#FF7A00]' : 'text-slate-400'}`}>
            {rtcConfirmed ? `${moneyTruth?.rtc.balance} RTC` : 'UNAVAILABLE'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <WalletCards className="w-3 h-3" />
            {rtcConfirmed
              ? `RustChain API verificada • pendente: ${moneyTruth?.rtc.pendingRtc || 0} RTC (${moneyTruth?.rtc.pendingTransactions || 0} tx)`
              : 'Aguardando leitura autoritativa'}
          </div>
        </div>

        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            USDC Disponível
          </div>
          <div className={`text-xl font-bold font-mono ${coinbaseReady ? 'text-emerald-400' : 'text-slate-400'}`}>
            {coinbaseReady && moneyTruth?.usdc.coinbase.available !== null
              ? `${moneyTruth.usdc.coinbase.available} USDC`
              : 'EXTERNAL'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {coinbaseReady
              ? `Hold: ${moneyTruth?.usdc.coinbase.hold || '0'} • Ordens: ${moneyTruth?.usdc.coinbase.openOrders ?? 0}`
              : 'Coinbase read-only não está vinculada ao runtime público'}
          </div>
        </div>

        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            USDC Liquidado
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {moneyTruth?.usdc.settledRevenue || '0.000000'} USDC
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <CircleDollarSign className="w-3 h-3" />
            {moneyTruth?.usdc.settledPayments || 0} settlements confirmados
          </div>
        </div>

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

        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            GXEON Agent
          </div>
          <div className={`text-lg font-bold font-mono ${moneyTruth?.agent.status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-400'}`}>
            {moneyTruth?.agent.status || 'CONNECTING'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <Bot className="w-3 h-3" />
            {moneyTruth?.agent.mode || 'READ_ONLY'} • human gate
          </div>
        </div>

        <div className="bg-[#0B1220] p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
            Radar Unificado
          </div>
          <div className={`text-lg font-bold font-mono ${radarActive ? 'text-[#00D4FF]' : 'text-slate-400'}`}>
            {radarActive ? 'ACTIVE' : 'WAITING'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <Radar className="w-3 h-3" />
            Taskmarket • MergePay • RustChain • x402
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-slate-900/80 border border-slate-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            <strong>INVARIANTE:</strong> opportunity ≠ escrow ≠ settlement ≠ withdrawable. RTC permanece token experimental e não é convertido automaticamente para BRL/USDC.
          </span>
        </div>
        <div className="text-[11px] text-slate-500 whitespace-nowrap">
          Store: {status?.storeMode || 'FIRESTORE'}
        </div>
      </div>
    </Card>
  );
}
