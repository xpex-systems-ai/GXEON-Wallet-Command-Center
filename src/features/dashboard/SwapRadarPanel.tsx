import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, RefreshCw, ShieldCheck, Radar, LockKeyhole } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';

type MoneyTruth = {
  rtc?: { balance: string | null; status: string; verifiedAt: string | null };
  usdc?: { settledRevenue: string; coinbase?: { status: string; available: string | null } };
};

type IntegrationStatus = { moneyTruthSnapshot?: MoneyTruth };

const ASSETS = ['RTC', 'USDC', 'SOL', 'ETH', 'BRL'] as const;

export function SwapRadarPanel() {
  const [from, setFrom] = useState('RTC');
  const [to, setTo] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [truth, setTruth] = useState<MoneyTruth | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/integration-status', { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json() as IntegrationStatus;
        setTruth(data.moneyTruthSnapshot || null);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const route = useMemo(() => {
    if (from === 'RTC' && to === 'USDC') return 'RTC → wRTC → market → USDC';
    if (to === 'BRL') return from + ' → supported settlement provider → BRL';
    return from + ' → verified venue → ' + to;
  }, [from, to]);

  const rtcVerified = truth?.rtc?.status === 'CONFIRMED';
  const hasExecutableQuote = false; // fail closed until a verified venue+liquidity quote exists

  return (
    <Card glow="cyan" className="border-t-2 border-t-[#00D4FF]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1E314F]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <ArrowRightLeft className="w-4 h-4 text-[#00D4FF]" />
            <h2 className="text-lg font-bold font-mono text-white">GXEON Swap Radar</h2>
            <Badge variant="cyan">READ-ONLY V1</Badge>
            <Badge variant="green">FAIL CLOSED</Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-1">
            Discovers conversion routes without signing, transferring, bridging, swapping or withdrawing funds.
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="px-3 py-2 bg-[#152238] border border-[#1E314F] rounded-lg text-xs font-mono text-slate-200 flex items-center gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh truth
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs font-mono text-slate-400">FROM
            <select value={from} onChange={e => setFrom(e.target.value)}
              className="mt-1 w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white">
              {ASSETS.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="text-xs font-mono text-slate-400">AMOUNT
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g,''))}
              placeholder={rtcVerified && from === 'RTC' ? truth?.rtc?.balance || '0' : '0'}
              className="mt-1 w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white" />
          </label>
          <label className="text-xs font-mono text-slate-400">TO
            <select value={to} onChange={e => setTo(e.target.value)}
              className="mt-1 w-full bg-[#0B1220] border border-[#1E314F] rounded-lg p-2.5 text-white">
              {ASSETS.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
        </div>

        <div className="bg-[#0B1220] border border-[#1E314F] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">Confirmed RTC</div>
          <div className="text-xl font-bold font-mono text-[#FF7A00] mt-1">
            {rtcVerified ? `${truth?.rtc?.balance} RTC` : 'UNAVAILABLE'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Authoritative wallet read only</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg bg-[#0B1220] border border-[#1E314F]"><span className="text-slate-500">Route</span><div className="text-white mt-1">{route}</div></div>
        <div className="p-3 rounded-lg bg-[#0B1220] border border-[#1E314F]"><span className="text-slate-500">Executable price</span><div className="text-amber-400 mt-1">NOT VERIFIED</div></div>
        <div className="p-3 rounded-lg bg-[#0B1220] border border-[#1E314F]"><span className="text-slate-500">Liquidity / slippage</span><div className="text-amber-400 mt-1">NOT VERIFIED</div></div>
        <div className="p-3 rounded-lg bg-[#0B1220] border border-[#1E314F]"><span className="text-slate-500">Settlement</span><div className="text-slate-300 mt-1">{truth?.usdc?.coinbase?.status || 'EXTERNAL'}</div></div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex gap-2 text-[11px] font-mono text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Money Truth gate: a displayed balance is not a quote. A quote is not settlement. No asset moves without an executable venue, verified liquidity and explicit transaction approval.</span>
        </div>
        <button disabled={!hasExecutableQuote}
          className="px-4 py-2 rounded-lg bg-slate-800 text-slate-500 border border-slate-700 text-xs font-mono font-bold cursor-not-allowed whitespace-nowrap flex items-center gap-2">
          <LockKeyhole className="w-3.5 h-3.5" /> SWAP LOCKED
        </button>
      </div>
      <div className="mt-3 text-[10px] font-mono text-slate-500 flex items-center gap-1.5">
        <Radar className="w-3 h-3" /> Next gate: verified venue + token identity + executable quote + liquidity + fee/slippage evidence.
      </div>
    </Card>
  );
}
