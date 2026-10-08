import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Bot, CheckCircle2, CircleAlert, Clock3, CreditCard, ExternalLink, Globe2, RefreshCw, Shield, Wallet } from 'lucide-react';
import { Card } from '../../components/common/Card';

type Funding = 'VERIFIED_ESCROW' | 'UNVERIFIED_BOUNTY' | 'FREE_REPUTATION';
interface Task {
  taskId: string; title: string; descriptionSummary: string; status: string;
  bountyUsdc: string | null; fundingStatus: Funding; isPaid: boolean;
  bondUsdc: string | null; taskUrl: string; riskFlags: string[];
  requiresCapabilities: string[]; payoutState: string | null;
}
interface BasedAgentsSnapshot {
  provider: 'basedagents'; status: 'CONFIRMED_PUBLIC' | 'PARTIAL' | 'UNAVAILABLE';
  observedAt: string; errors: string[];
  agent: {
    id: string; name: string | null; status: string | null;
    capabilities: string[]; walletAddress: string | null;
    walletVerified: boolean | null; linkedToOfficialCoinbaseBase: boolean | null;
    directContactConfigured: boolean | null; privateEventsStatus: 'AUTH_REQUIRED';
  };
  market: {
    openTasksVisible: number | null; fullyScanned: boolean; fetchedPages: number;
    totalTaskCountAuthoritative: false;
    paidListingsVisible: number | null; verifiedEscrowVisible: number | null;
    ourClaimsVisible: number | null; ourPostedTasksVisible: number | null;
    tasks: Task[];
  };
  safety: { mode: 'READ_ONLY_DISCOVERY'; claimBondUsdcPerPaidSlot: string;
    claimSignedOperationsEnabled: false; revenuesVerifiedFromListings: false; note: string };
}
interface WalletSnapshot {
  status: 'CONFIRMED_ONCHAIN' | 'UNAVAILABLE'; observedAt: string;
  chainId: number; address: string;
  balances: { usdc: string; eth: string } | null; explorer?: string;
  blockNumber?: string;
}
type CardLink = { title: string; description: string; url: string; category: string; external?: boolean };
const LINKS: CardLink[] = [
  { title: 'BasedAgents', description: 'Tarefas e bounties em USDC · Base', url: 'https://basedagents.ai/tasks', category: 'TRABALHO' },
  { title: 'GXEON Taskmarket', description: 'Radar, análise de risco e provas de trabalho', url: '/taskmarket', category: 'TRABALHO' },
  { title: 'AgentBounties', description: 'Microbounties; conferir caução e financiamento', url: 'https://agentbounties.app', category: 'TRABALHO' },
  { title: 'GXEON Marketplace', description: 'Serviços, créditos e compradores', url: '/market', category: 'VENDA' },
  { title: 'MCP Público', description: 'Descoberta técnica para agentes externos', url: '/mcp', category: 'DISTRIBUIÇÃO' },
  { title: 'Stripe', description: 'Pagamentos: validar diretamente no provedor', url: 'https://dashboard.stripe.com', category: 'FINANCEIRO' },
  { title: 'Coinbase Wallet', description: 'Carteira oficial de autocustódia na Base', url: 'https://basescan.org/address/0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428', category: 'CARTEIRA' },
  { title: 'Coinbase Exchange', description: 'Conta da corretora é distinta da Coinbase Wallet', url: 'https://www.coinbase.com/accounts', category: 'CARTEIRA' },
  { title: 'RustChain', description: 'Explorar saldo RTC e bounties nativos', url: 'https://rustchain.org', category: 'CARTEIRA' },
  { title: 'GitHub GXEON', description: 'Código, auditorias, PRs e tarefas', url: 'https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center', category: 'ENGENHARIA' },
];
const officialWallet = '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428';
const textValue = (value: number | null | undefined, fallback = 'INDISPONÍVEL') =>
  value === null || value === undefined ? fallback : String(value);
const short = (address: string | null) => address
  ? address.slice(0, 8) + '…' + address.slice(-6) : 'Aguardando registro';
const fundingLabel: Record<Funding, string> = {
  VERIFIED_ESCROW: 'Escrow informado e verificado',
  UNVERIFIED_BOUNTY: 'Pagamento sem prova independente',
  FREE_REPUTATION: 'Sem remuneração anunciada',
};
const statusTime = (iso: string) => {
  const d = Date.parse(iso);
  return Number.isNaN(d) ? 'Data não disponível' : new Date(d).toLocaleString('pt-BR');
};

/** BasedAgents and Coinbase Wallet are independent read-only providers. No signing, purchases or claims. */
export function AgentOperationsHub() {
  const [based, setBased] = useState<BasedAgentsSnapshot | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [basedError, setBasedError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const [market, funds] = await Promise.allSettled([
      fetch('/api/integration-status?view=basedagents', { cache: 'no-store' }),
      fetch('/api/integration-status?view=base-wallet', { cache: 'no-store' }),
    ]);
    if (market.status === 'fulfilled') {
      try {
        const data = await market.value.json() as BasedAgentsSnapshot;
        if (market.value.ok && data.provider === 'basedagents') {
          setBased(data); setBasedError(null);
        } else {
          setBased(null); setBasedError('BasedAgents indisponível — não inferir ausência de tarefas.');
        }
      } catch {
        setBased(null); setBasedError('Não foi possível validar a resposta do BasedAgents.');
      }
    } else { setBased(null); setBasedError('BasedAgents indisponível.'); }
    if (funds.status === 'fulfilled') {
      try {
        const data = await funds.value.json() as WalletSnapshot;
        if (funds.value.ok && data.status === 'CONFIRMED_ONCHAIN' && data.balances
            && data.chainId === 8453 && data.address.toLowerCase() === officialWallet.toLowerCase()) {
          setWallet(data); setWalletError(null);
        } else { setWallet(null); setWalletError('Sem leitura confiável da Base neste momento.'); }
      } catch { setWallet(null); setWalletError('Falha de leitura da carteira Base.'); }
    } else { setWallet(null); setWalletError('Carteira Base indisponível.'); }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const entries = based?.market.tasks.filter(item => item.isPaid).slice(0, 8) || [];
  const walletDifference = based?.agent.walletAddress &&
    based.agent.walletAddress.toLowerCase() !== officialWallet.toLowerCase();

  return (
    <section aria-label="GXEON Agent Operations Hub" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#1E314F] bg-[#111C30] p-5">
        <div>
          <p className="font-mono text-xs tracking-widest text-[#FF7A00]">GXEON AGENT OPERATIONS</p>
          <h2 className="text-xl font-bold text-white mt-1">Mercados, carteiras e tarefas em um só lugar</h2>
          <p className="text-xs text-slate-400 mt-1">Leitura de fontes externas · Oportunidade anunciada NÃO é receita nem convite particular.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy}
          className="rounded-lg border border-cyan-800 bg-cyan-950/80 px-4 py-2 flex gap-2 items-center text-cyan-200 text-sm disabled:opacity-50">
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />{busy ? 'Sincronizando' : 'Atualizar dados'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card glow="cyan" className="space-y-3">
          <div className="flex justify-between gap-3">
            <h3 className="text-white font-bold flex gap-2 items-center"><Bot size={19} className="text-cyan-300" />BasedAgents — GXEON-AI</h3>
            <span className="text-[10px] text-amber-300 font-mono">READ ONLY</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-xl font-bold text-white">{textValue(based?.market.openTasksVisible)}</div><div className="text-[10px] text-slate-400">Visíveis na consulta</div></div>
            <div><div className="text-xl font-bold text-white">{textValue(based?.market.paidListingsVisible)}</div><div className="text-[10px] text-slate-400">Com prêmio anunciado</div></div>
            <div><div className="text-xl font-bold text-white">{textValue(based?.market.ourClaimsVisible)}</div><div className="text-[10px] text-slate-400">Atribuídas ao agente*</div></div>
          </div>
          <p className="text-[11px] text-slate-400">{based?.market.fullyScanned ? 'Paginação pública concluída nesta consulta.' : 'Amostra parcial do quadro aberto. Total do site pode ser maior.'}</p>
          <p className="text-xs text-slate-400">Identidade: <span className="text-slate-200">{based?.agent.name || 'GXEON-AI'}</span> · Carteira BasedAgents <span className="font-mono">{short(based?.agent.walletAddress || null)}</span></p>
          <p className="text-xs text-slate-400">Contato direto: <span className="text-amber-300">{based?.agent.directContactConfigured === true ? 'Informado no perfil (requer verificação de recebimento)' : 'Não confirmado'}</span> · Caixa privada: <span className="text-amber-300">Autenticação AgentSig necessária</span></p>
          {basedError && <p role="status" className="text-xs text-amber-300">{basedError}</p>}
          {based?.errors.length ? <p className="text-xs text-amber-300">Leitura parcial: {based.errors.join(', ')}</p> : null}
          <p className="text-[10px] text-slate-500">*Contagem da API pública, não necessariamente todas as mensagens privadas. {based ? 'Última consulta: ' + statusTime(based.observedAt) : ''}</p>
          <a href="https://basedagents.ai/tasks" target="_blank" rel="noopener noreferrer" className="text-cyan-300 flex gap-1 items-center text-xs font-semibold">Abrir tarefas BasedAgents <ArrowUpRight size={13}/></a>
        </Card>

        <Card glow="orange" className="space-y-3">
          <div className="flex justify-between gap-3">
            <h3 className="text-white font-bold flex gap-2 items-center"><Wallet size={19} className="text-[#FF7A00]"/>Coinbase Wallet oficial · Base</h3>
            <span className="text-[10px] text-amber-300 font-mono">AUTOCUSTÓDIA</span>
          </div>
          <p className="font-mono text-xs break-all text-slate-400">{officialWallet}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-950/50 border border-slate-800 p-3">
              <span className="text-[10px] text-slate-400">USDC nativo · Base</span>
              <p className="font-mono text-lg text-emerald-300 font-bold">{wallet?.balances?.usdc ?? 'INDISPONÍVEL'}</p>
            </div>
            <div className="rounded-lg bg-slate-950/50 border border-slate-800 p-3">
              <span className="text-[10px] text-slate-400">ETH · gás na Base</span>
              <p className="font-mono text-lg text-cyan-300 font-bold">{wallet?.balances?.eth ?? 'INDISPONÍVEL'}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">{wallet ? 'Confirmado no bloco ' + (wallet.blockNumber || '—') + ' · ' + statusTime(wallet.observedAt) : 'Aguardando resposta autoritativa da blockchain.'}</p>
          {walletDifference && <p role="status" className="rounded-md border border-amber-800/60 bg-amber-950/20 p-2 text-xs text-amber-300 flex gap-2"><CircleAlert size={15} className="shrink-0" />A carteira de recebimento do BasedAgents é outra. Não some nem transfira automaticamente.</p>}
          {walletError && <p role="status" className="text-amber-300 text-xs">{walletError}</p>}
          <a href={`https://basescan.org/address/${officialWallet}`} target="_blank" rel="noopener noreferrer" className="text-cyan-300 flex gap-1 items-center text-xs font-semibold">Ver histórico no BaseScan <ArrowUpRight size={13}/></a>
          <p className="text-[10px] text-slate-500">Saldos de autocustódia ≠ saldo na corretora Coinbase ≠ receita de bounties ou Stripe.</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Activity size={18} className="text-[#00D4FF]"/><h3 className="text-white font-semibold">Acessos diretos do ecossistema</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {LINKS.map(link => (
            <a key={link.title} href={link.url} target="_blank" rel="noopener noreferrer"
              className="group rounded-xl border border-[#27415F] bg-[#0B1220] p-3 hover:border-cyan-700 transition-colors">
              <span className="text-[10px] text-[#00D4FF] font-mono">{link.category}</span>
              <span className="flex gap-1 items-center text-sm font-semibold text-white mt-2">{link.title}<ExternalLink size={12} className="text-slate-500 group-hover:text-cyan-300"/></span>
              <span className="text-xs text-slate-400 mt-1 block">{link.description}</span>
            </a>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-white flex items-center gap-2 font-semibold"><CreditCard size={18} className="text-[#FF7A00]"/>Bounties anunciadas no BasedAgents</h3>
          <span className="text-[11px] text-amber-300">Nenhuma tarefa é aceita automaticamente</span>
        </div>
        {entries.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entries.map(task => (
              <div key={task.taskId} className="rounded-lg border border-slate-800 p-3 bg-slate-950/40 space-y-2">
                <div className="flex justify-between gap-2">
                  <h4 className="text-sm text-slate-100 font-medium">{task.title}</h4>
                  <span className="text-emerald-300 text-sm whitespace-nowrap font-bold font-mono">{task.bountyUsdc} USDC</span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">{task.descriptionSummary}</p>
                <span className="text-xs text-amber-300">{fundingLabel[task.fundingStatus]}</span>
                {task.riskFlags.length > 0 && <p className="text-[11px] text-amber-300">Risco: {task.riskFlags.join(' · ')}</p>}
                <div className="flex gap-2 text-xs items-center justify-between">
                  <span className="text-slate-500">Caução anunciada para claim: {task.bondUsdc || '—'} USDC*</span>
                  <a href={task.taskUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 flex items-center gap-1">Ver tarefa <ArrowUpRight size={13}/></a>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">{based?.market.openTasksVisible !== null && based ? 'Nenhuma bounty remunerada retornou nesta amostra.' : 'Ainda sem leitura confiável das oportunidades.'}</p>}
        <p className="text-[11px] text-slate-500 flex gap-2 items-start"><Shield size={14} className="shrink-0"/>*Caução prevista nas regras da plataforma; custos efetivos, elegibilidade, financiamento e assinaturas devem ser verificados antes de qualquer claim. Nenhuma movimentação é habilitada aqui.</p>
        <p className="text-[11px] text-slate-500 flex gap-2 items-start"><CheckCircle2 size={14} className="shrink-0"/>Oportunidades públicas não são convites direcionados ao GXEON, e recompensas anunciadas não são receitas confirmadas. <Clock3 size={14} className="shrink-0"/>A caixa privada do agente depende de autenticação AgentSig.</p>
      </Card>
    </section>
  );
}
