import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowUpRight, CircleDollarSign, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { CoinbaseHistory, CoinbaseRead, EcosystemStatus, parseCoinbaseHistory } from './catalog';

const unknown = 'NÃO VERIFICADO';
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' BRT';
const short = (value: string) => value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

export function CoinbaseCard({ user, status, balance, loading, refreshKey, onRefresh }: {
  user: User | null; status: EcosystemStatus | null; balance: CoinbaseRead | null;
  loading: boolean; refreshKey: number; onRefresh: () => void;
}) {
  const [history, setHistory] = useState<{ uid: string; data: CoinbaseHistory } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [view, setView] = useState<'transactions' | 'receipts' | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); setHistory(null); setHistoryError(null); setView(null);
    setHistoryLoading(false); setDraftOpen(false); setDraft(null);
    return () => request.current?.abort();
  }, [user, refreshKey]);
  const data = history?.uid === user?.uid ? history?.data : null;
  const ready = Boolean(user && status?.coinbase.runtimeConfigured && status.coinbase.operatorAuthConfigured);
  const historyReady = ready && Boolean(status?.coinbase.historyConfigured);
  async function loadHistory(mode: 'transactions' | 'receipts') {
    if (!user || !historyReady) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setView(mode); setHistory(null); setHistoryError(null); setHistoryLoading(true);
    try {
      const token = await user.getIdToken();
      if (controller.signal.aborted) return;
      const response = await fetch('/api/integration-status?view=coinbase-history', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sessão do operador não autorizada.' : 'Histórico indisponível. Nenhum recebimento foi confirmado.');
      const result = parseCoinbaseHistory(await response.json());
      if (!controller.signal.aborted) setHistory({ uid: user.uid, data: result });
    } catch (error) {
      if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : 'Histórico indisponível.');
    } finally { if (!controller.signal.aborted) setHistoryLoading(false); }
  }
  const portfolios = [...new Set(balance?.accounts.flatMap(row => row.portfolioId ? [row.portfolioId] : []) ?? [])];
  const usdc = balance?.accounts.filter(row => row.currency === 'USDC') ?? [];
  const rows = data?.transactions.filter(row => view !== 'receipts' || row.receiptStatus === 'PROVIDER_COMPLETED') ?? [];
  const connection = balance ? 'Leitura verificada' : loading ? 'Verificando' : 'Leitura pendente';
  return <Card className="!bg-[#0D0D10] !border-amber-500/35 shadow-lg">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3"><div className="bg-amber-400/10 border border-amber-400/30 rounded-xl p-3"><CircleDollarSign size={24} className="text-amber-300" /></div><div><h3 className="text-lg font-semibold text-amber-200 tracking-wider">COINBASE</h3><p className="text-xs text-slate-300">Wallet, USDC &amp; Agent Payments</p><p className="text-xs text-slate-500 mt-1">Finance / Agent Economy</p></div></div>
      <Badge variant={balance ? 'green' : 'amber'}>{connection}</Badge>
    </div>
    <div className="mt-5 space-y-2 text-sm">
      <p className="text-slate-300">Conector ChatGPT: {status?.coinbase.connectorVerifiedAt ? <span className="text-emerald-400">leitura registrada em {date(status.coinbase.connectorVerifiedAt)}</span> : unknown}</p>
      <p className="text-slate-300">Backend do painel: <span className="text-amber-200">{balance ? 'consulta autorizada nesta sessão' : !status ? unknown : !status.coinbase.runtimeConfigured ? 'credencial de leitura pendente' : !status.coinbase.operatorAuthConfigured ? 'autorização do operador pendente' : !user ? 'sessão do operador necessária' : unknown}</span></p>
    </div>
    <dl className="grid sm:grid-cols-2 gap-3 mt-5 text-sm">
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Portfólio autorizado pela chave</dt><dd className="text-slate-200 break-all mt-1">{portfolios.length ? portfolios.map(short).join(', ') : unknown}</dd></div>
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Rede blockchain da conta</dt><dd className="text-slate-200 mt-1">{unknown}</dd><p className="text-xs text-slate-500 mt-1">Base / USDC é a rede planejada; saldo custodial não identifica rede.</p></div>
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">USDC disponível, por conta</dt><dd className="text-amber-200 mt-1">{usdc.length ? usdc.map(row => <div key={row.accountId}>{row.available} USDC · {short(row.accountId)}</div>) : unknown}</dd></div>
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Última sincronização do saldo</dt><dd className="text-slate-200 mt-1">{balance ? date(balance.observedAt) : unknown}</dd></div>
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Receitas Coinbase conciliadas</dt><dd className="text-slate-200 mt-1">{unknown}</dd><p className="text-xs text-slate-500 mt-1">Vínculo autenticado com Revenue Ledger pendente.</p></div>
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Transações recentes</dt><dd className="text-slate-200 mt-1">{data ? `${data.transactions.length} registros consultados` : unknown}</dd><p className="text-xs text-slate-500 mt-1">Contas Track API verificadas separadamente.</p></div>
    </dl>
    {balance && <div className="mt-5 overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-slate-500"><tr><th className="py-2">Conta / Ativo</th><th>Disponível</th><th>Em reserva</th></tr></thead><tbody>{balance.accounts.map(row => <tr key={row.accountId} className="border-t border-slate-800 text-slate-200"><td className="py-2">{row.currency}<span className="block text-xs text-slate-500" title={row.accountId}>{short(row.accountId)}</span></td><td className="font-mono">{row.available}</td><td className="font-mono">{row.hold}</td></tr>)}</tbody></table><p className="text-xs text-slate-500 mt-2">{balance.openOrders} ordens abertas · escopo da chave, sem somar moedas ou portfólios.</p></div>}
    {!ready && <p className="text-xs text-amber-300 mt-4 leading-5">Consulta privada aguardando credencial de leitura e sessão autorizada. Valores permanecem NÃO VERIFICADOS.</p>}
    {!historyReady && <p className="text-xs text-slate-400 mt-3">Histórico e recebimentos aguardam contas Track API autorizadas e autenticação do operador.</p>}
    <div className="flex flex-wrap gap-2 mt-5 text-xs">
      <button disabled={!ready || loading} onClick={onRefresh} className="rounded-lg border border-amber-500/30 px-3 py-2 text-amber-200 disabled:opacity-40">Consultar carteira</button>
      <button disabled={!ready || loading} onClick={onRefresh} className="rounded-lg border border-amber-500/30 px-3 py-2 text-amber-200 disabled:opacity-40">Atualizar saldo</button>
      <button disabled={!historyReady || historyLoading} onClick={() => void loadHistory('transactions')} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200 disabled:opacity-40">Ver transações</button>
      <button disabled={!historyReady || historyLoading} onClick={() => void loadHistory('receipts')} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200 disabled:opacity-40">Ver recebimentos</button>
      <a href="https://www.coinbase.com/" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200 inline-flex gap-1 items-center">Abrir Coinbase <ArrowUpRight size={13} /></a>
      <button onClick={() => { setDraftOpen(value => !value); setDraft(null); }} className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200">Solicitar operação</button>
    </div>
    {historyLoading && <p role="status" className="mt-4 text-sm text-amber-200">Consultando histórico autorizado…</p>}
    {historyError && <p role="alert" className="mt-4 text-sm text-red-300">{historyError}</p>}
    {data && view && <div className="mt-5 space-y-3"><h4 className="text-sm text-amber-200">{view === 'receipts' ? 'Recebimentos concluídos segundo Coinbase' : 'Histórico Coinbase'}</h4><p className="text-xs text-slate-400">Fonte: Coinbase Track API · {date(data.observedAt)}. Recebimento não comprova receita; entrega e ledger ainda exigem conciliação.</p>{!rows.length ? <p className="text-sm text-slate-400">Nenhum registro correspondente retornado nas contas consultadas.</p> : <div className="max-h-96 overflow-auto space-y-2">{rows.map(row => <div key={`${row.accountId}:${row.id}`} className="rounded-lg border border-slate-800 p-3 text-xs text-slate-300"><p className="font-mono text-amber-200">{row.amount} {row.currency} · {row.type} · {row.status}</p><p className="mt-1">Conta {short(row.accountId)} · registro {short(row.id)} · {date(row.createdAt)}</p><p className="mt-1">Rede: {row.network ?? unknown} · confirmação: {row.networkStatus ?? unknown}</p><p className="mt-1 break-all">Hash: {row.txHash ?? unknown}</p><p className="mt-1 text-slate-500">Receita: NÃO CONCILIADA · fonte Coinbase; verificação independente Base pendente.</p></div>)}</div>}</div>}
    {draftOpen && <form className="mt-5 space-y-3 rounded-lg border border-amber-500/20 p-4" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      setDraft(JSON.stringify({ status: 'AGUARDANDO_REVISAO_HUMANA', asset: 'USDC', network: 'Base (planejada)', amount: fields.get('amount'), destination: fields.get('destination'), purpose: fields.get('purpose') }, null, 2));
    }}><p className="text-sm text-amber-200">Preparar solicitação para revisão humana</p><p className="text-xs text-slate-400">Rascunho nesta sessão. Não é enviado ao ledger nem assinado. Não insira tokens, seeds ou chaves.</p><label className="block text-xs text-slate-400">Valor pretendido em USDC<input required name="amount" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" maxLength={30} className="mt-1 block w-full bg-black/30 border border-slate-700 rounded p-2 text-white" /></label><label className="block text-xs text-slate-400">Endereço de destino em Base<input required name="destination" pattern="0x[0-9a-fA-F]{40}" maxLength={42} className="mt-1 block w-full bg-black/30 border border-slate-700 rounded p-2 text-white" /></label><label className="block text-xs text-slate-400">Finalidade<input required name="purpose" maxLength={200} className="mt-1 block w-full bg-black/30 border border-slate-700 rounded p-2 text-white" /></label><button className="text-xs text-amber-200 border border-amber-500/30 rounded px-3 py-2" type="submit">Preparar rascunho</button>{draft && <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all">{draft}</pre>}</form>}
    <div className="mt-5 pt-4 border-t border-slate-800 flex items-start gap-2 text-xs text-slate-500"><ShieldCheck size={15} className="shrink-0" /><span>Somente leitura. Conexão, saldo, recebimento e receita conciliada são estados distintos. Nenhuma ação de trading, swap, saque ou transferência.</span></div>
  </Card>;
}
