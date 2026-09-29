import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import type { TaskmarketSnapshot, TaskmarketOpportunity, ActionPreview } from '../../agent-economy/taskmarket/types';
import { getSchedulerHealth } from '../../agent-economy/taskmarket/schedulerHealth';

const money = (value: number | null) => value === null ? 'Indisponível' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} USDC`;
const reasonLabels: Record<string, string> = {
  FUNDING_NOT_VERIFIED: 'Depósito ainda sem confirmação independente na blockchain',
  NO_VERIFIED_EXECUTION_CAPABILITY: 'Escopo sem executor compatível verificado',
  SCOPE_AND_COST_REVIEW_REQUIRED: 'Revisar escopo, critérios e custo de execução',
  COMPETITION_TOO_HIGH_FOR_REWARD: 'Concorrência alta para esta recompensa',
  NO_INDEPENDENT_REQUESTER_PAYOUT_HISTORY: 'Solicitante sem histórico de pagamentos a outros trabalhadores',
  WORKER_IDENTITY_REQUIRED: 'Identidade do trabalhador pendente',
  RISK_ABOVE_30: 'Risco acima do limite da operação',
  LEGAL_ACCEPTANCE_REQUIRED: 'Termos precisam da aceitação do operador',
  WRITES_DISABLED: 'Envio de ações está desativado',
  HUMAN_SIGNATURE_APPROVAL_REQUIRED: 'Assinatura exige sua aprovação',
  USE_OFFICIAL_LOCAL_CLI: 'Ação deve ser concluída pela CLI oficial com carteira local',
  ACTION_NOT_AVAILABLE_FOR_WORKER: 'Ação indisponível para este trabalhador',
  TASK_EXPIRED: 'Prazo encerrado',
  SPEND_APPROVAL_REQUIRED: 'Gasto precisa da sua aprovação',
  BOND_APPROVAL_REQUIRED: 'Caução precisa da sua aprovação',
};
const reasons = (values: string[]) => values.map(v => reasonLabels[v] || v.replace(/_/g, ' ').toLowerCase());

export function TaskmarketPanel() {
  const [data, setData] = useState<TaskmarketSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TaskmarketOpportunity | null>(null);
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const load = useCallback(async (live = false) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/taskmarket${live ? '?live=1' : ''}`);
      if (!response.ok) throw new Error('Não foi possível consultar o Taskmarket.');
      const result = await response.json() as TaskmarketSnapshot;
      if (result.provider !== 'taskmarket' || !Array.isArray(result.opportunities)) throw new Error('Resposta indisponível.');
      setData(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Consulta indisponível.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const stale = Boolean(data && now - Date.parse(data.fetchedAt) > 20 * 60_000);
  const scheduler = getSchedulerHealth(data?.scheduler.lastSuccessfulPoll || null, Math.max(now, Date.now()));
  async function inspect(task: TaskmarketOpportunity, action: 'qualify' | 'preview') {
    setActionBusy(true); setError(''); setPreview(null); setSelected(task);
    try {
      const nextAction = task.taskMode === 'claim' ? 'claim' : task.taskMode === 'pitch' ? 'pitch' : task.taskMode === 'auction' ? 'bid' : 'submit';
      const response = await fetch(`/api/taskmarket?view=${action}&taskId=${encodeURIComponent(task.taskId)}&action=${nextAction}`);
      if (!response.ok) throw new Error('A consulta atual não está disponível. Tente novamente.');
      const result = await response.json();
      if (action === 'preview') setPreview(result); else setSelected(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Consulta indisponível.'); }
    finally { setActionBusy(false); }
  }
  const metrics: Array<[string, string | number]> = [
    ['API', data ? (data.apiReachable ? stale ? 'DESATUALIZADO' : 'CONECTADA' : 'ERRO') : 'CONSULTANDO'],
    ['REDE', data?.networkVerified ? 'BASE · 8453' : 'A confirmar'],
    ['IDENTIDADE', data?.identityRegistered ? `Agente ${data.agentId}` : 'PENDENTE'],
    ['ABERTAS', data?.openTasks ?? '—'], ['QUALIFICADAS', data?.qualifiedTasksAvailable ?? '—'],
    ['AÇÃO PRONTA', data?.claimReady ?? '—'], ['ATIVAS', data?.activeClaims ?? '—'],
    ['ENVIADAS', data?.submittedTasks ?? '—'], ['PAGAS', data?.paidTasks ?? '—'],
    ['USDC RECEBIDOS', data ? money(data.totalSettledUsdc) : '—'],
  ];
  return <section className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden" aria-label="Taskmarket">
    <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs tracking-widest text-orange-400 font-semibold">GXEON · TRABALHO PAGO</p>
        <h2 className="text-xl text-white font-bold mt-1">Taskmarket</h2>
        <p className="text-sm text-slate-400 mt-1">Tarefas em USDC. Receita registrada após pagamento confirmado.</p></div>
      <button type="button" onClick={() => void load(true)} disabled={loading} className="flex gap-2 items-center rounded-lg border border-cyan-700 bg-cyan-950 px-4 py-2 text-cyan-200 text-sm disabled:opacity-50">
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>{loading ? 'Consultando…' : 'Consultar agora'}
      </button>
    </div>
    {error && <p role="alert" className="m-5 rounded-lg bg-red-950 p-3 text-red-200 text-sm">{error}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-px bg-slate-800 border-b border-slate-800">
      {metrics.map(([name, value]) => <div key={name} className="bg-slate-900 p-4"><p className="text-[10px] font-semibold tracking-widest text-slate-500">{name}</p><p className={`mt-2 font-semibold ${name === 'USDC RECEBIDOS' ? 'text-emerald-300' : 'text-slate-100'}`}>{value}</p></div>)}
    </div>
    <div className="p-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
      <ShieldCheck className="text-cyan-400" size={16}/><span>Modo leitura · Ações com assinatura aguardam aprovação</span>
      <span className="sm:ml-auto">{data ? `Consulta: ${new Date(data.fetchedAt).toLocaleString('pt-BR')}` : 'Aguardando dados reais'}</span>
    </div>
    {stale && <p className="px-4 pb-3 text-amber-300 text-sm">Dados anteriores. Consulte novamente antes de decidir.</p>}
    {data?.errors.length ? <p role="status" className="px-4 pb-3 text-amber-300 text-sm">Consulta incompleta: {reasons(data.errors).join('; ')}</p> : null}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left min-w-[760px]">
      <thead className="bg-slate-950 text-xs text-slate-500"><tr>{['Recompensa', 'Tarefa', 'Fit / Risco', 'Submissões', 'Prazo', 'Estado', 'Ações'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-800">{data?.opportunities.map(t => <tr key={t.taskId} className="hover:bg-slate-800/40">
        <td className="px-4 py-4 text-white font-medium whitespace-nowrap">{money(t.rewardUsdc)}<span className="block text-xs text-slate-500 mt-1">Até {money(t.netRewardUsdc)} após taxas</span></td>
        <td className="px-4 py-4 min-w-[260px] max-w-xs"><p className="text-slate-200">{t.title}</p><p className="text-[11px] text-slate-500 mt-1">{t.fundingStatus === 'ONCHAIN_VERIFIED' ? 'Depósito confirmado' : 'Depósito informado pelo mercado; verificação pendente'}</p></td>
        <td className="px-4 py-4 text-slate-300">{t.fitScore} / {t.riskScore}</td><td className="px-4 py-4 text-slate-300">{t.competition}</td>
        <td className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">{new Date(t.deadline).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
        <td className="px-4 py-4"><span className={`text-xs ${t.state === 'CLAIM_READY' ? 'text-emerald-300' : 'text-amber-300'}`}>{t.state === 'REJECTED' ? 'DESCARTADA' : t.state === 'CLAIM_READY' ? 'AÇÃO PRONTA' : 'EM ANÁLISE'}</span></td>
        <td className="px-4 py-4"><button onClick={() => { setSelected(t); setPreview(null); }} className="text-cyan-300 hover:underline text-xs">Ver análise</button></td>
      </tr>)}</tbody>
    </table></div>
    {data && !data.opportunities.length && <p className="p-6 text-slate-400 text-sm">{data.apiReachable && !data.errors.length ? 'Nenhuma tarefa aberta retornada nesta consulta.' : 'Lista indisponível. Isso não confirma ausência de tarefas.'}</p>}
    {selected && <div className="m-4 p-5 rounded-xl border border-cyan-900 bg-slate-950 space-y-3">
      <div className="flex justify-between gap-3"><h3 className="font-semibold text-white">{selected.title}</h3><button onClick={() => setSelected(null)} className="text-slate-400 text-sm">Fechar</button></div>
      <p className="text-sm text-slate-400">Probabilidade de aceite e retorno esperado: desconhecidos. Nenhuma recompensa desta lista conta como receita.</p>
      <ul className="text-sm text-amber-200 list-disc pl-5 space-y-1">{reasons([...selected.rejectionReasons, ...selected.blockers]).map(r => <li key={r}>{r}</li>)}</ul>
      <div className="flex flex-wrap gap-3 text-xs">
        <a className="text-cyan-300 flex items-center gap-1" href={selected.url} target="_blank" rel="noreferrer">Abrir tarefa <ExternalLink size={12}/></a>
        <a className="text-cyan-300" href={`https://basescan.org/tx/${selected.sourceEvidence.escrow.transactionHash}`} target="_blank" rel="noreferrer">Ver depósito</a>
        <button disabled={actionBusy} onClick={() => void inspect(selected, 'qualify')} className="text-cyan-300 disabled:opacity-50">Requalificar</button>
        <button disabled={actionBusy} onClick={() => void inspect(selected, 'preview')} className="text-cyan-300 disabled:opacity-50">Preparar ação</button>
        <button disabled title="Fase de leitura: identidade, escopo e aprovação ainda são necessários" className="text-slate-600">Executar</button>
        <button disabled title="Requer entrega validada e aprovação da assinatura" className="text-slate-600">Enviar entrega</button>
      </div>
      {preview && <div className="border-t border-slate-800 pt-3 text-sm text-slate-300"><p>Prévia: {preview.action} · Taxa: {money(preview.externalSpend)} · Caução: {money(preview.bondUsdc)}</p><p className="mt-2 text-amber-200">{reasons(preview.reason).join(' · ')}</p></div>}
    </div>}
    <footer className="border-t border-slate-800 p-4 text-xs text-slate-500 space-y-1">
      <p>Varredura prevista a cada 15 minutos. Último ciclo confirmado: {data?.scheduler.lastSuccessfulPoll ? new Date(data.scheduler.lastSuccessfulPoll).toLocaleString('pt-BR') : 'ainda não registrado'}.</p>
      {data && scheduler.health !== 'CURRENT' && <p role="status" className="text-amber-300">
        {scheduler.health === 'DELAYED' ? 'Varredura automática atrasada: mais de 30 minutos sem ciclo confirmado.' : scheduler.health === 'INVALID_TIMESTAMP' ? 'Horário do último ciclo inválido; operação automática não confirmada.' : 'Aguardando o primeiro ciclo automático confirmado.'}
        {' '}Consultar agora atualiza esta tela, mas não confirma a execução do agendamento.
      </p>}
      <p>{data?.persistence === 'DURABLE' ? 'Histórico persistido.' : 'Consulta ao vivo; histórico persistente indisponível nesta resposta.'} Bounty e MergePay continuam em paralelo.</p>
    </footer>
  </section>;
}
