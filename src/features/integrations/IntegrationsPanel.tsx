import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { ArrowRight, RefreshCw, Users } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { COMMUNITY_COMMAND_URL, CoinbaseRead, EcosystemStatus, parseCoinbaseRead, parseEcosystemStatus } from './catalog';
import { CommunityDirectory } from './CommunityDirectory';
import { CoinbaseCard } from './CoinbaseCard';

export function IntegrationsPanel({ user, expanded = false, onOpen }: { user: User | null; expanded?: boolean; onOpen?: () => void }) {
  const [status, setStatus] = useState<EcosystemStatus | null>(null);
  const [privateBalance, setPrivateBalance] = useState<{ uid: string; data: CoinbaseRead } | null>(null);
  const balance = privateBalance?.uid === user?.uid ? privateBalance?.data : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // Never retain a previous operator's balances while auth/refresh changes.
    setPrivateBalance(null); setStatus(null); setError(null); setLoading(true);
    async function load() {
      try {
        const response = await fetch('/api/integration-status?view=ecosystem', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível verificar as integrações.');
        const data = parseEcosystemStatus(await response.json());
        if (controller.signal.aborted) return;
        setStatus(data);
        if (user && data.coinbase.runtimeConfigured && data.coinbase.operatorAuthConfigured) {
          const token = await user.getIdToken();
          const privateResponse = await fetch('/api/integration-status?view=coinbase', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
          if (!privateResponse.ok) throw new Error(privateResponse.status === 401 || privateResponse.status === 403 ? 'A leitura Coinbase exige a sessão do operador autorizado.' : 'Leitura Coinbase indisponível. Tente atualizar.');
          const privateData = parseCoinbaseRead(await privateResponse.json());
          if (!controller.signal.aborted) setPrivateBalance({ uid: user.uid, data: privateData });
        }
      } catch (failure) {
        if (!controller.signal.aborted) { setPrivateBalance(null); setError(failure instanceof Error ? failure.message : 'Leitura indisponível.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [user, refresh]);

  return <section className="space-y-5" aria-label="Comunidades e integrações">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div><h2 className="text-xl font-semibold text-white">Comunidades e integrações</h2><p className="text-sm text-slate-400 mt-1">Conexões, evidências e acesso à operação GXEON.</p></div>
      <button disabled={loading} onClick={() => setRefresh(value => value + 1)} className="text-sm text-cyan-400 inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Atualizar status</button>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <CoinbaseCard user={user} status={status} balance={balance ?? null} loading={loading} refreshKey={refresh} onRefresh={() => setRefresh(value => value + 1)} />
      <Card glow="orange">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-3"><div className="rounded-xl p-3 bg-orange-500/15"><Users size={24} className="text-orange-400" /></div><div><h3 className="text-lg font-semibold text-white">Rede de comunidades</h3><p className="text-xs text-slate-400">5 plataformas acompanhadas</p></div></div><Badge variant={status?.communityCommand.status === 'AVAILABLE' ? 'green' : 'amber'}>{loading ? 'Verificando' : status?.communityCommand.status === 'AVAILABLE' ? 'Staging disponível' : 'Estado indisponível'}</Badge></div>
        <p className="mt-5 text-sm text-slate-400 leading-6">Diretório e evidências reunidos neste painel. Parcerias, oportunidades, entregas e ledger estão no módulo autenticado de Comunidades.</p>
        <p className="mt-3 text-xs text-amber-400 leading-5">A sincronização dos registros privados exige a sessão do módulo. Disponibilidade do serviço não confirma sincronização ou pagamento.</p>
        <div className="flex flex-wrap gap-4 mt-5 text-sm">
          {onOpen && <button onClick={onOpen} className="text-cyan-400 inline-flex items-center gap-1">Ver comunidades <ArrowRight size={14} /></button>}
          <a href={COMMUNITY_COMMAND_URL} target="_blank" rel="noopener noreferrer" className="text-orange-400 inline-flex items-center gap-1">Abrir operação autenticada <ArrowRight size={14} /></a>
        </div>
        {status && <p className="mt-5 text-xs text-slate-500">Status consultado em {new Date(status.observedAt).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC</p>}
      </Card>
    </div>
    {error && <p role="alert" className="text-sm text-amber-400">{error}</p>}
    {expanded && <><CommunityDirectory /><p className="text-xs text-slate-500">Participação pública, contratação, entrega validada e pagamento confirmado são etapas distintas.</p></>}
  </section>;
}
