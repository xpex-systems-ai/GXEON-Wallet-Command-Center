import { useEffect, useState } from 'react';
import { Bot, BriefcaseBusiness, CheckCircle2, Coins, LockKeyhole, Radar, ShieldCheck, WalletCards } from 'lucide-react';

type Truth = {
  rtc?: { balance: string | null; status: string };
  usdc?: { settledRevenue?: string; coinbase?: { status?: string } };
  taskmarket?: { open?: number; qualified?: number; active?: number; submitted?: number; paid?: number };
};

const flow = [
  ['AGENTS','Identity & permissions'],['TASK MARKET','Qualified work'],['EXECUTION','Bounded automation'],
  ['EVIDENCE','Proof & verification'],['PAYMENT','Confirmed assets'],['TREASURY','Multi-asset truth'],
  ['SETTLEMENT','Human-approved'],['REPORTS','Auditable results']
];

export function AgentFiOS() {
  const [truth,setTruth]=useState<Truth>({});
  const [updated,setUpdated]=useState<string>('loading');
  useEffect(()=>{ fetch('/api/integration-status',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{setTruth(d.moneyTruthSnapshot||{});setUpdated(new Date().toLocaleString('pt-BR'));}).catch(()=>setUpdated('offline / sem dados novos')); },[]);
  const rtc = truth.rtc?.status === 'CONFIRMED' ? truth.rtc.balance : null;
  const tm = truth.taskmarket || {};
  return <div className="min-h-screen bg-[#050b16] text-slate-100 font-mono">
    <header className="border-b border-cyan-950 bg-[#07101f]/95 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div><div className="text-xl sm:text-2xl font-black tracking-tight"><span className="text-[#FF7A00]">GXEON</span> <span className="text-[#00D4FF]">AgentFi OS</span></div><div className="text-[9px] text-slate-500 tracking-[.25em]">PRIVATE AGENT FINANCIAL OPERATING SYSTEM</div></div>
        <div className="flex gap-2"><span className="px-2 py-1 rounded border border-emerald-700 text-emerald-400 text-[10px]">GXO ONLINE</span><span className="px-2 py-1 rounded border border-cyan-800 text-cyan-400 text-[10px]">EVIDENCE FIRST</span></div>
      </div>
    </header>

    <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-[#FF7A00]/40 bg-gradient-to-br from-[#111a2d] via-[#07101f] to-[#061827] p-6 sm:p-8">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-[#FF7A00]/10 blur-3xl"/>
        <div className="relative max-w-3xl">
          <div className="text-[#FF7A00] text-xs tracking-[.25em] font-bold">XPeX SYSTEMS AI // GXO LEÃO DE JUDÁ</div>
          <h1 className="text-3xl sm:text-5xl font-black mt-3 leading-tight">Work → Evidence → <span className="text-[#00D4FF]">Revenue</span></h1>
          <p className="text-slate-400 mt-3 text-sm sm:text-base">Agentes descobrem trabalho, executam sob políticas, provam a entrega e reconciliam apenas receita confirmada. O executor não aprova sua própria entrega.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/market" className="px-4 py-2 rounded-lg bg-[#FF7A00] text-black font-bold text-xs">OPEN TASK MARKET</a>
            <a href="/mcp" className="px-4 py-2 rounded-lg border border-[#00D4FF]/50 text-[#00D4FF] text-xs">MCP GATEWAY</a>
            <a href="/" className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs">COMMAND CENTER</a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="RTC CONFIRMED" value={rtc ? rtc+' RTC' : 'UNAVAILABLE'} icon={<Coins/>} accent="text-[#FF7A00]"/>
        <Metric label="USDC SETTLED" value={(truth.usdc?.settledRevenue || '0')+' USDC'} icon={<WalletCards/>} accent="text-emerald-400"/>
        <Metric label="OPEN TASKS" value={String(tm.open ?? '—')} icon={<BriefcaseBusiness/>} accent="text-[#00D4FF]"/>
        <Metric label="QUALIFIED" value={String(tm.qualified ?? '—')} icon={<CheckCircle2/>} accent="text-violet-400"/>
      </section>

      <section className="rounded-2xl border border-[#1E314F] bg-[#0a1425] p-5">
        <div className="flex items-center justify-between gap-3 mb-5"><div><div className="text-[#00D4FF] font-bold">AGENT ECONOMY PIPELINE</div><div className="text-[10px] text-slate-500 mt-1">No stage silently promotes itself.</div></div><Radar className="text-[#00D4FF]"/></div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">{flow.map(([a,b],i)=><div key={a} className="relative p-3 rounded-xl border border-[#1E314F] bg-[#07101f] min-h-24"><div className="text-[10px] text-[#FF7A00]">0{i+1}</div><div className="font-bold text-xs mt-2">{a}</div><div className="text-[9px] text-slate-500 mt-1">{b}</div></div>)}</div>
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <Panel title="GXEON MCP GATEWAY" icon={<Bot/>}><p>ChatGPT ↔ AgentFi OS ↔ agents ↔ evidence.</p><div className="mt-3 space-y-1 text-cyan-400 text-[11px]"><div>tasks.discover()</div><div>tasks.qualify()</div><div>evidence.verify()</div><div>treasury.balances()</div><div>routes.quote()</div></div></Panel>
        <Panel title="MULTI-ASSET TREASURY" icon={<Coins/>}><p>RTC · USDC · SOL · ETH · BRL</p><p className="mt-3 text-slate-500 text-[11px]">Balance ≠ quote ≠ settlement. No synthetic fiat valuation.</p><a href="/" className="inline-block mt-4 text-[#00D4FF] text-xs">OPEN MONEY TRUTH →</a></Panel>
        <Panel title="POLICY & RISK ENGINE" icon={<ShieldCheck/>}><p>Fail-closed financial governance.</p><div className="mt-3 space-y-1 text-[11px] text-slate-400"><div>✓ Independent verifier</div><div>✓ Isolated signing plane</div><div>✓ Evidence ledger</div><div>✓ Human approval for asset movement</div></div></Panel>
      </section>

      <section className="rounded-2xl border border-amber-800/60 bg-amber-950/10 p-4 flex gap-3 items-start">
        <LockKeyhole className="text-amber-400 shrink-0"/><div><div className="font-bold text-amber-300 text-sm">SETTLEMENT GATE LOCKED BY DEFAULT</div><p className="text-[11px] text-slate-400 mt-1">Signing, swaps, bridges, transfers, withdrawals and spending require verified route evidence and the appropriate explicit authorization.</p></div>
      </section>
      <div className="text-[10px] text-slate-600 text-center pb-4">LIVE CONTROL PLANE · last read: {updated}</div>
    </main>
  </div>;
}

function Metric({label,value,icon,accent}:{label:string;value:string;icon:React.ReactNode;accent:string}){return <div className="rounded-xl border border-[#1E314F] bg-[#0a1425] p-4"><div className="flex justify-between text-slate-500 text-[10px]">{label}<span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span></div><div className={'mt-3 text-lg sm:text-xl font-black '+accent}>{value}</div></div>}
function Panel({title,icon,children}:{title:string;icon:React.ReactNode;children:React.ReactNode}){return <div className="rounded-2xl border border-[#1E314F] bg-[#0a1425] p-5"><div className="flex gap-2 items-center text-sm font-bold text-white"><span className="text-[#FF7A00] [&>svg]:w-4 [&>svg]:h-4">{icon}</span>{title}</div><div className="mt-3 text-xs text-slate-300">{children}</div></div>}
