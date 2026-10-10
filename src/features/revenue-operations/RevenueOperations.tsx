import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, BriefcaseBusiness, Check, Code2, FileCheck2, Fingerprint, Layers3, LockKeyhole, Radar, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import type { NavTab } from '../../components/layout/Sidebar';
import { COMMUNITY_COMMAND_URL } from '../integrations/catalog';
import { CatalogService, parseCatalog, parseSnapshot, reviewPack, RevenueOpportunity, RevenueSnapshot, SERVICE_PROPOSALS, UNKNOWN } from './model';
import './revenue-operations.css';

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' BRT' : UNKNOWN;
const stateLabel = { UNDER_REVIEW: 'Em análise', BLOCKED_BY_COST: 'Bloqueado por custo', EXPIRED: 'Prazo encerrado' };
const fundingLabel = { RADAR_ONCHAIN_EVIDENCE: 'Evidência on-chain no radar', PROVIDER_REPORTED: 'Informado pelo provedor', UNKNOWN };
const moneyStages = [
  ['Potencial anunciado', 'Recompensas ainda exigem qualificação.'],
  ['Receita contratada', 'Claim autorizado e contrato vinculante.'],
  ['Liquidação pendente', 'Entrega aceita; pagamento a confirmar.'],
  ['Receita confirmada', 'Liquidação verificada e conciliada.'],
];
const proofSteps = [
  ['Descoberta', 'Fonte original e data da leitura.'],
  ['Qualificação', 'Escopo, elegibilidade, financiamento e custo zero.'],
  ['Autorização', 'Aprovação humana antes de qualquer claim.'],
  ['Execução ALETIX', 'Implementação, testes e pacote de evidências.'],
  ['Aceite independente', 'O executor não aprova a própria entrega.'],
  ['Liquidação & ledger', 'USDC recebido, confirmado e conciliado.'],
];

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { method: 'GET', cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Consulta indisponível (HTTP ${response.status}).`);
  return response.json();
}
export function RevenueOperations({ compact = false, onNavigate }: { compact?: boolean; onNavigate: (tab: NavTab) => void }) {
  const [snapshot, setSnapshot] = useState<RevenueSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CatalogService[] | null>(null);
  const [catalogAt, setCatalogAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<'contracts' | 'apis' | 'evidence'>('contracts');
  const [query, setQuery] = useState(''); const [market, setMarket] = useState('all'); const [state, setState] = useState('all');
  const [selected, setSelected] = useState<RevenueOpportunity | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError(null); setCatalogError(null);
    // Clear prior reads during refresh/failure; a previous success is never presented as current.
    setSnapshot(null); setCatalog(null); setCatalogAt(null); setSelected(null); setDraft(null);
    const results = await Promise.allSettled([
      readJson('/api/integration-status?view=revenue-operations', signal).then(parseSnapshot),
      readJson('/api/v1/services', signal).then(parseCatalog),
    ]);
    if (signal.aborted) return;
    const [radar, services] = results;
    if (radar.status === 'fulfilled') setSnapshot(radar.value); else setError('Leitura operacional indisponível. Nenhum valor foi confirmado.');
    if (services.status === 'fulfilled') { setCatalog(services.value); setCatalogAt(new Date().toISOString()); } else setCatalogError('Catálogo GXEON indisponível nesta leitura.');
    setLoading(false);
  }, []);
  useEffect(() => { const c = new AbortController(); const timer = setTimeout(() => { c.abort(); setLoading(false); setError('Tempo de consulta excedido. Atualize a leitura.'); }, 20_000); void load(c.signal).finally(() => clearTimeout(timer)); return () => { clearTimeout(timer); c.abort(); }; }, [load]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setDraft(null); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  useEffect(() => {
    if (!selected && !draft) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const dialog = document.querySelector<HTMLElement>('.gx-dialog');
    const elements = () => [...(dialog?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea') ?? [])].filter(e => !e.hasAttribute('disabled'));
    elements()[0]?.focus();
    const trap = (event: KeyboardEvent) => { if (event.key !== 'Tab') return; const items = elements(); const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } };
    window.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', trap); previous?.focus(); };
  }, [selected, draft]);
  const refresh = () => { const c = new AbortController(); const timer = setTimeout(() => { c.abort(); setLoading(false); setError('Tempo de consulta excedido. Atualize a leitura.'); }, 20_000); void load(c.signal).finally(() => clearTimeout(timer)); };
  const opportunities = snapshot?.opportunities ?? [];
  const completeRadar = !!snapshot && snapshot.sources.every(s => s.count !== null);
  const recordCount = completeRadar || opportunities.length > 0 ? opportunities.length : null;
  const markets = [...new Set(opportunities.map(r => r.provider))];
  const filtered = opportunities.filter(r => (market === 'all' || r.provider === market) && (state === 'all' || r.state === state) && `${r.title} ${r.provider} ${r.externalId}`.toLowerCase().includes(query.toLowerCase()));
  const stale = snapshot?.sources.some(s => s.status !== 'AVAILABLE');

  return <section className="gx-revenue" aria-label="GXEON Revenue Operations">
    <header className="gx-revenue-header">
      <div className="gx-revenue-eyebrow"><span className="gx-revenue-dot" /> XPeX Systems AI <span className="text-slate-600">/</span> GXEON Agent Economy</div>
      <div className="flex items-start justify-between flex-wrap gap-5 mt-5">
        <div><p className="text-[10px] text-amber-300/80 uppercase tracking-[.25em] mb-2">Dual Revenue Engine · Handoff V1.0 + V1.1</p><h2 className="gx-revenue-title">Revenue <span>Operations</span></h2><p className="text-sm text-slate-400 leading-6 mt-3 max-w-xl">Demanda real. Entrega comprovada. Receita conciliada.<br />Contratos e APIs no mesmo centro de controle.</p></div>
        <div className="gx-revenue-seal"><ShieldCheck size={21} /><div><strong>CONTROLE HUMANO</strong><span>Base / USDC · rede prioritária</span><span>Política: custo inicial zero</span></div></div>
      </div>
      <div className="gx-revenue-toolbar"><span className="text-[11px] text-slate-400 flex gap-2 items-center"><Fingerprint size={14} /> {loading ? 'Consultando fontes…' : snapshot ? `Leitura do bloco: ${date(snapshot.observedAt)}` : 'Fontes aguardando validação'}</span><div className="flex flex-wrap gap-2">{compact ? <button className="gx-button gx-button-gold" onClick={() => onNavigate('revenue-operations')}>Abrir operações <ArrowRight size={14} /></button> : <button disabled={loading} className="gx-button" onClick={refresh}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar leituras</button>}<button className="gx-button" onClick={() => onNavigate('integrations')}><Wallet size={13} /> Coinbase &amp; integrações</button></div></div>
    </header>
    {error && <p role="alert" className="gx-alert">{error}</p>}
    <div className="gx-money-grid">{moneyStages.map(([title, note], i) => <div key={title} className={`gx-money-card ${i === 3 ? 'gx-money-confirmed' : ''}`}><div className="flex justify-between gap-2"><p>{title}</p>{i === 3 ? <ShieldCheck size={16} /> : <Layers3 size={15} />}</div><strong>{UNKNOWN}</strong><span>{note}</span></div>)}</div>
    <p className="text-[11px] text-slate-500 px-5 pt-3">Indicadores financeiros aguardam o Revenue Ledger autenticado. Recompensa anunciada e escrow não representam receita recebida.</p>
    <div className="gx-engine-grid">
      <div className="gx-engine"><div className="gx-engine-label"><BriefcaseBusiness size={18} /> ENGINE A <span>CONTRACT REVENUE</span></div><h3>Contratos &amp; entregas</h3><p>Qualificar tarefas, verificar financiamento e preparar execução autorizada com aceite independente.</p><div className="gx-engine-footer"><span>{recordCount !== null ? `${recordCount} registros consultados` : UNKNOWN}<small>Inclui registros antigos; exige revalidação.</small></span><button className="gx-button" onClick={() => compact ? onNavigate('revenue-operations') : setWorkspace('contracts')}>Explorar radar <ArrowUpRight size={14} /></button></div></div>
      <div className="gx-engine"><div className="gx-engine-label"><Code2 size={18} /> ENGINE B <span>API REVENUE</span></div><h3>Serviços &amp; distribuição</h3><p>Reutilizar APIs GXEON e preparar o catálogo AgenticTrade com preço, escopo e revisão comercial.</p><div className="gx-engine-footer"><span>{catalog ? `${catalog.length} serviços no catálogo GXEON` : UNKNOWN}<small>Publicação AgenticTrade não verificada.</small></span><button className="gx-button" onClick={() => compact ? onNavigate('revenue-operations') : setWorkspace('apis')}>Ver serviços <ArrowUpRight size={14} /></button></div></div>
    </div>
    <div className="gx-source-strip">{snapshot?.sources.map(s => <span key={s.id} title={`Data da fonte: ${date(s.observedAt)}`}><i className={s.status === 'AVAILABLE' ? 'gx-source-ok' : 'gx-source-pending'} />{s.name}<b>{s.status === 'AVAILABLE' ? `${s.count} registros · consulta disponível` : s.status === 'STALE' ? 'Snapshot antigo' : 'Indisponível'}</b></span>)}{!snapshot && <span><i className="gx-source-pending" /> Radar e BaseBounty <b>{loading ? 'Em consulta' : UNKNOWN}</b></span>}<span><i className="gx-source-pending" /> AgenticTrade <b>Conta e publicação pendentes</b></span></div>
    {!compact && <>
      <nav className="gx-workspace-tabs" aria-label="Áreas de operações">{([['contracts', 'Radar de contratos', Radar], ['apis', 'Catálogo de APIs', Code2], ['evidence', 'Evidências & controles', FileCheck2]] as const).map(([id, label, Icon]) => <button key={id} aria-pressed={workspace === id} onClick={() => { setWorkspace(id); setDraft(null); }} className={workspace === id ? 'active' : ''}><Icon size={16} />{label}</button>)}</nav>
      {workspace === 'contracts' && <div className="gx-workspace">
        <div className="gx-section-heading"><div><p>01 / CONTRACT INTELLIGENCE</p><h3>Da oportunidade à entrega</h3></div><button className="gx-button" onClick={() => onNavigate('agent-economy')}>Abrir radar existente <ArrowUpRight size={14} /></button></div>
        <div className="gx-stat-strip">{[['Registros consultados', recordCount], ['Com evidência de financiamento', completeRadar ? opportunities.filter(r => r.funding === 'RADAR_ONCHAIN_EVIDENCE').length : null], ['Bloqueados por custo', completeRadar ? opportunities.filter(r => r.state === 'BLOCKED_BY_COST').length : null], ['Prontos para executar', null]].map(([label, number]) => <div key={String(label)}><strong>{number === null ? '—' : number}</strong><span>{label}</span></div>)}</div>
        {stale && <p className="gx-alert">Há fontes antigas ou indisponíveis. As evidências do radar são históricas e precisam de nova validação antes de um claim.</p>}
        <div className="gx-filters"><label>Buscar oportunidade<input placeholder="Título, mercado ou identificador" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Mercado<select value={market} onChange={e => setMarket(e.target.value)}><option value="all">Todos os mercados</option>{markets.map(m => <option key={m}>{m}</option>)}</select></label><label>Estado<select value={state} onChange={e => setState(e.target.value)}><option value="all">Todos os estados</option>{Object.entries(stateLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        <div className="gx-table-wrap"><table className="gx-table"><thead><tr><th>Oportunidade / fonte</th><th>Recompensa anunciada</th><th>Financiamento</th><th>Estado</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{filtered.map(r => <tr key={r.key}><td><strong>{r.title}</strong><small>{r.provider} · {r.network ?? 'Rede não verificada'}{r.stale && ' · snapshot antigo'}</small></td><td className="font-mono whitespace-nowrap">{r.reward === null ? '—' : r.reward.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} {r.currency === 'UNKNOWN' ? '' : r.currency}<small>Valor não contratado</small></td><td><span className="gx-tag">{fundingLabel[r.funding]}</span></td><td><span className={`gx-tag ${r.state === 'BLOCKED_BY_COST' ? 'gx-tag-risk' : ''}`}>{stateLabel[r.state]}</span></td><td><button className="gx-button" onClick={() => { setSelected(r); setDraft(null); }}>Analisar</button></td></tr>)}</tbody></table>{!filtered.length && <div role="status" className="gx-empty"><Radar size={25} /><strong>{loading ? 'Consultando o radar…' : !snapshot || !completeRadar ? 'Radar indisponível ou parcial nesta leitura' : 'Nenhum registro corresponde a esta consulta'}</strong><p>Uma lista vazia não comprova ausência de oportunidades nos outros mercados.</p></div>}</div>
        <div className="gx-policy"><ShieldCheck size={18} /><p><strong>Custo inicial zero</strong>Gas, bond, stake, depósito e taxas antecipadas bloqueiam o avanço. BaseBounty exige gas para claim; sua leitura pública permanece disponível. Custos e elegibilidade desconhecidos também impedem liberação.</p></div>
        <div className="gx-market-links"><span>Fontes para análise manual:</span><a href="https://ubounty.ai/bounties" target="_blank" rel="noopener noreferrer">uBounty ↗</a><a href="https://www.openbounty.app/" target="_blank" rel="noopener noreferrer">Open Bounty ↗</a><a href="https://github.com/xpex-systems-ai" target="_blank" rel="noopener noreferrer">GitHub ↗</a><small>Não estão sincronizadas neste bloco. Open Bounty não exige pré-financiamento.</small></div>
      </div>}
      {workspace === 'apis' && <div className="gx-workspace">
        <div className="gx-section-heading"><div><p>02 / SERVICE DISTRIBUTION</p><h3>AgenticTrade · catálogo proposto</h3></div><a className="gx-button" href="https://agentictrade.io/docs/getting-started" target="_blank" rel="noopener noreferrer">Documentação oficial <ArrowUpRight size={14} /></a></div>
        <p className="text-sm text-slate-400 leading-6">Três propostas do handoff, com preço por chamada em USDC. Registro, autenticação do provedor e publicação comercial aguardam validação e aprovação humana.</p>
        <div className="gx-proposal-grid">{SERVICE_PROPOSALS.map(s => <article key={s.id} className="gx-proposal"><span className="gx-tag">PROPOSTA · NÃO PUBLICADO</span><h4>{s.name}</h4><p>{s.purpose}</p><div className="gx-proposal-price">{s.price}<span> USDC / chamada</span><small>Preço proposto no handoff</small></div><p className="gx-reuse">{s.reuse}</p><button className="gx-button" onClick={() => { setDraftName(s.name); setDraft(JSON.stringify({ kind: 'SERVICE_PUBLICATION_REVIEW_DRAFT', status: 'UNSENT', name: s.name, proposedPriceUsdc: s.price.replace(',', '.'), currency: 'USDC', existingCapability: s.serviceId, endpoint: null, providerAccountVerified: false, humanApprovalRequired: true, published: false, requiredEvidence: ['working_endpoint', 'input_output_schema', 'auth', 'rate_limits', 'ssrf_controls', 'cost_and_margin', 'provider_account', 'commercial_approval'] }, null, 2)); }}>Preparar revisão <ArrowRight size={13} /></button></article>)}</div>
        <div className="gx-section-heading mt-8"><div><p>REUSO / SEM DUPLICAR O BACKEND</p><h3>Catálogo GXEON existente</h3></div><a className="gx-button" href="/market" target="_blank" rel="noopener noreferrer">Abrir marketplace <ArrowUpRight size={14} /></a></div>
        <p className="text-xs text-slate-500 mb-3">Fonte: GET /api/v1/services · {date(catalogAt)}. Presença no catálogo não comprova chamadas pagas, execução ou receita.</p>
        {catalogError && <p role="alert" className="gx-alert">{catalogError}</p>}
        <div className="gx-catalog-list">{catalog?.map(s => <div key={s.serviceId}><Code2 size={17} /><span><strong>{s.name}</strong><small>{s.serviceId}</small></span><b>{s.unitPriceCredits} créditos internos</b><span className="gx-tag">{s.status === 'AVAILABLE' ? 'Declarado no catálogo' : 'Estado a revisar'}</span></div>)}</div>
        <div className="gx-stat-strip mt-5">{['Serviços no AgenticTrade', 'Chamadas pagas', 'Receita bruta / comissão', 'Saldo sacável', 'USDC liquidado'].map(label => <div key={label}><strong>—</strong><span>{label}<small>{UNKNOWN}</small></span></div>)}</div>
      </div>}
      {workspace === 'evidence' && <div className="gx-workspace">
        <div className="gx-section-heading"><div><p>03 / EVIDENCE & GOVERNANCE</p><h3>Uma trilha completa para cada receita</h3></div><Fingerprint size={25} className="text-amber-300" /></div>
        <div className="gx-proof-grid">{proofSteps.map(([label, note], i) => <div key={label}><b>{String(i + 1).padStart(2, '0')}</b><h4>{label}</h4><p>{note}</p><span className="gx-tag">{i === 0 && snapshot ? 'Fontes consultadas' : 'Validação por contrato pendente'}</span></div>)}</div>
        <div className="gx-control-grid"><div><LockKeyhole size={20} /><h4>Identidade & permissões</h4><p>Coinbase, saldos e ledger dependem de sessão autorizada. O bloco público consulta fontes e metadados; não expõe credenciais.</p><button className="gx-button" onClick={() => onNavigate('integrations')}>Ver conexão Coinbase</button></div><div><FileCheck2 size={20} /><h4>Liquidação & conciliação</h4><p>Vincular contrato, entrega, aceite, rede, conta, token e transação. A conciliação financeira autenticada ainda precisa ser integrada.</p><a className="gx-button" href={COMMUNITY_COMMAND_URL} target="_blank" rel="noopener noreferrer">Abrir XPeX Systems Command <ArrowUpRight size={13} /></a></div></div>
        <div className="gx-policy"><Check size={18} /><p><strong>Critério de avanço</strong>Somente um contrato com escopo, financiamento, elegibilidade e custo verificados pode chegar à aprovação humana. Preparar revisão gera apenas um rascunho nesta sessão.</p></div>
        <div className="gx-source-evidence">{snapshot?.sources.map(s => <div key={s.id}><strong>{s.name}</strong><p>Estado: {s.status === 'AVAILABLE' ? 'Consulta disponível' : s.status === 'STALE' ? 'Snapshot antigo' : 'Indisponível'} · registros: {s.count ?? UNKNOWN}</p><p>Data da fonte: {date(s.observedAt)}</p><a href={s.id === 'unified' ? '/api/v1/radar' : 'https://www.basebounty.app/api/v1/bounties?status=open'} target="_blank" rel="noopener noreferrer">Abrir fonte da leitura ↗</a></div>)}</div>
      </div>}
    </>}
    <footer className="gx-revenue-footer"><span>GXEON — BUILD. CONNECT. EARN. VERIFY.</span><small>Conexão ≠ saldo · saldo ≠ receita · receita exige liquidação e conciliação.</small></footer>
    {selected && <div className="gx-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Análise de oportunidade" className="gx-dialog"><div className="flex justify-between gap-4 items-start"><div><p className="text-[10px] uppercase tracking-widest text-amber-300">REVISÃO DE CONTRATO</p><h3>{selected.title}</h3></div><button className="gx-button" aria-label="Fechar análise" onClick={() => setSelected(null)}><X size={18} /></button></div><p className="text-xs text-slate-500 break-all">{selected.key}</p><dl className="gx-detail-grid">{[['Fonte consultada', date(selected.observedAt)], ['Estado', stateLabel[selected.state]], ['Financiamento', fundingLabel[selected.funding]], ['Data da evidência de escrow', date(selected.fundingCheckedAt)], ['Custo inicial', selected.initialCostRequired ? 'BLOQUEADO · custo exigido' : UNKNOWN], ['Elegibilidade / critérios de aceite', UNKNOWN], ['Rede', selected.network ?? UNKNOWN], ['Prazo', date(selected.deadline)]].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl><p className="gx-hash">Hash de financiamento: {selected.fundingTx ?? UNKNOWN}</p><p className="gx-hash">Hash da fonte: {selected.sourceHash ?? UNKNOWN}</p><p className="gx-alert">Claim, execução, aceite e pagamento não foram validados para o GXEON. Esta análise não libera uma operação.</p><a className="gx-button gx-button-gold" href={selected.url} target="_blank" rel="noopener noreferrer">Abrir fonte original <ArrowUpRight size={14} /></a><button className="gx-button ml-2" onClick={() => { setDraftName(selected.title); setDraft(JSON.stringify(reviewPack(selected), null, 2)); setSelected(null); }}>Preparar revisão</button></section></div>}
    {draft && <div className="gx-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Rascunho de revisão" className="gx-dialog"><div className="flex justify-between gap-4 items-start"><div><p className="text-[10px] uppercase tracking-widest text-amber-300">REVISÃO HUMANA · RASCUNHO</p><h3>{draftName}</h3></div><button className="gx-button" aria-label="Fechar rascunho" onClick={() => setDraft(null)}><X size={18} /></button></div><p className="text-sm text-slate-400">Preparado nesta sessão. Não foi enviado, registrado ou publicado. Nenhum claim ou operação foi executado.</p><pre className="gx-draft">{draft}</pre></section></div>}
  </section>;
}
