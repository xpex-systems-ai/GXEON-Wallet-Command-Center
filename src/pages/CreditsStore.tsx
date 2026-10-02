import { useEffect, useRef, useState } from 'react';
import { Coins, ShieldCheck, ArrowRight, CheckCircle2, Lock, Cpu, AlertCircle, Download } from 'lucide-react';
import { TOPUP_PACKS } from '../agent-economy/billingCatalog';

interface Checkout {
  checkoutUrl: string;
  targetAccountId: string;
  apiKey?: string;
}

const currency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CreditsStore() {
  const [agentName, setAgentName] = useState('');
  const [existingKey, setExistingKey] = useState('');
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const returnStatus = new URLSearchParams(window.location.search).get('status');

  useEffect(() => {
    if (error || checkout?.apiKey) {
      feedbackRef.current?.scrollIntoView({ block: 'center' });
      feedbackRef.current?.focus({ preventScroll: true });
    }
  }, [error, checkout?.apiKey]);

  async function handleCheckout(packId: string) {
    setError('');
    if (!existingKey.trim() && !agentName.trim()) {
      setError('Informe o nome do agente ou projeto para criar sua conta.');
      return;
    }
    setLoadingPack(packId);
    setKeySaved(false);
    try {
      const response = await fetch('/v1/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(existingKey.trim() ? { Authorization: 'Bearer ' + existingKey.trim() } : {}) },
        body: JSON.stringify({ packId, name: agentName.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error?.message || 'Não foi possível preparar a compra.');
      const destination = new URL(data.checkoutUrl);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('Endereço de pagamento inválido.');
      setCheckout(data);
      if (!data.apiKey) window.location.assign(data.checkoutUrl);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível preparar a compra.');
    } finally {
      setLoadingPack(null);
    }
  }

  function downloadKey() {
    if (!checkout?.apiKey) return;
    const contents = JSON.stringify({
      accountId: checkout.targetAccountId, apiKey: checkout.apiKey,
      apiBase: 'https://gxeon-wallet-command-center.vercel.app/v1',
      mcpUrl: 'https://gxeon-wallet-command-center.vercel.app/api/v1/mcp',
    }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gxeon-access.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function checkBalance() {
    setError('');
    setBalance(null);
    setCheckingBalance(true);
    try {
      const response = await fetch('/v1/balance', {
        headers: { Authorization: 'Bearer ' + existingKey.trim() }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Não foi possível consultar o saldo.');
      setBalance(data.availableCredits);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Saldo indisponível.');
    } finally {
      setCheckingBalance(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070D18] text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-[#0B1220]">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="text-xl font-bold">GXEON<span className="text-[#FF7A00]">.</span></a>
          <nav className="flex gap-5 text-sm text-slate-400"><a href="/market">Agent Market</a><a href="/fix">Quick Fix</a><a href="/mcp">Como usar a API</a><a href="/">Painel</a></nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 text-emerald-400 text-xs mb-4"><Coins className="w-4 h-4" /> CRÉDITOS PRÉ-PAGOS</div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">GXEON Machine Credits</h1>
          <p className="text-slate-300">Pacotes a partir de R$ 0,99 para agentes comprarem capacidade sob demanda. Use o saldo por API ou MCP, sem assinatura.</p>
        </div>
        {returnStatus && (
          <div role="status" className="max-w-xl mx-auto mb-8 rounded-xl p-5 bg-slate-900 border border-slate-700 text-sm">
            {returnStatus === 'cancelled'
              ? 'Checkout cancelado. Use a chave que você salvou para tentar novamente na mesma conta.'
              : 'Você voltou do checkout. Use sua chave abaixo para consultar o saldo. Os créditos aparecem após a confirmação do pagamento; retornar a esta página não confirma a compra.'}
          </div>
        )}
        <section className="max-w-xl mx-auto mb-10 bg-[#0B1220] border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 text-[#FF7A00]" /> Sua conta de créditos</h2>
          <label htmlFor="agent-name" className="block text-sm mb-2">Nome do agente ou projeto</label>
          <input id="agent-name" maxLength={100} value={agentName} onChange={e => setAgentName(e.target.value)}
            placeholder="Meu projeto" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 mb-4" />
          <label htmlFor="existing-key" className="block text-sm mb-2">Já tem conta? Informe sua chave para recarregar</label>
          <input id="existing-key" type="password" autoComplete="off" spellCheck={false} value={existingKey}
            onChange={e => { setExistingKey(e.target.value); setBalance(null); }} placeholder="gxa_live_… (opcional)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-3 font-mono text-sm" />
          <p className="text-xs text-slate-400 mt-3">Na primeira compra, você recebe uma chave para salvar antes de pagar. Guarde-a para acessar os serviços e recarregar.</p>
          {existingKey.trim() && <button onClick={checkBalance} disabled={checkingBalance} className="mt-4 text-sm text-cyan-400 disabled:opacity-50">{checkingBalance ? 'Consultando…' : 'Consultar saldo'}</button>}
          {balance !== null && <p role="status" className="mt-3 text-emerald-400">{balance} créditos disponíveis</p>}
        </section>
        <div ref={feedbackRef} tabIndex={-1}>
        {error && <div role="alert" className="max-w-xl mx-auto mb-8 p-4 bg-red-950 border border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-200"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}
        {checkout?.apiKey && (
          <section aria-label="Chave de acesso" className="max-w-xl mx-auto mb-10 p-6 rounded-2xl border border-cyan-500 bg-slate-900">
            <h2 className="text-xl font-bold mb-3">Salve sua chave de acesso</h2>
            <p className="text-sm text-slate-300 mb-4">Ela aparece somente agora. Você precisa dela para usar os créditos depois do pagamento. Mantenha o arquivo em local privado.</p>
            <p className="text-xs text-slate-400 break-all mb-3">Conta: {checkout.targetAccountId}</p>
            <code className="block break-all bg-slate-950 p-3 rounded-lg text-xs text-cyan-300">{checkout.apiKey}</code>
            <button onClick={downloadKey} className="flex items-center gap-2 my-4 px-4 py-2 border border-slate-600 rounded-lg text-sm"><Download className="w-4 h-4" />Baixar chave de acesso</button>
            <label className="flex items-center gap-3 text-sm mb-4"><input type="checkbox" checked={keySaved} onChange={e => setKeySaved(e.target.checked)} />Salvei minha chave em um local seguro.</label>
            <button disabled={!keySaved} onClick={() => window.location.assign(checkout.checkoutUrl)}
              className="w-full bg-[#FF7A00] text-black font-bold py-3 rounded-xl disabled:opacity-40">Continuar para o pagamento</button>
          </section>
        )}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Object.values(TOPUP_PACKS).map(pack => (
            <section key={pack.id} className={'bg-[#0B1220] rounded-2xl p-7 border flex flex-col ' + (pack.id === 'pack_250' ? 'border-[#FF7A00]' : 'border-slate-800')}>
              <div className="flex justify-between items-center gap-2 mb-5"><h2 className="font-mono text-sm">{pack.name}</h2><span className="text-xs bg-slate-800 p-2 rounded">{pack.credits} créditos</span></div>
              <p className="text-4xl font-bold">{currency(pack.priceCents / 100)}</p>
              <p className="text-xs text-slate-400 mt-2 mb-6">{(pack.priceCents / 100 / pack.credits).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 3 })} por crédito · {pack.credits >= 5 ? `até ${Math.floor(pack.credits / 5)} URLs ou ${Math.floor(pack.credits / 2)} validações JSON` : `${Math.floor(pack.credits / 2)} validação JSON`}</p>
              <ul className="space-y-3 text-sm text-slate-300 mb-8 flex-1">
                {[
                  pack.credits >= 5
                    ? Math.floor(pack.credits / 5) + ' verificações de URL ou ' + Math.floor(pack.credits / 2) + ' validações JSON'
                    : Math.floor(pack.credits / 2) + ' validação JSON',
                  'Combine os serviços usando o mesmo saldo',
                  'Acesso por API REST e MCP',
                  'Resultado estruturado e registro de execução',
                  'Compra avulsa, sem assinatura',
                ].map(item => <li key={item} className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" /><span>{item}</span></li>)}
              </ul>
              <button disabled={loadingPack !== null || Boolean(checkout?.apiKey)} onClick={() => handleCheckout(pack.id)}
                className="w-full py-3 rounded-xl bg-[#FF7A00] text-black font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-50">
                <Lock className="w-4 h-4" />{loadingPack === pack.id ? 'Preparando…' : 'Comprar ' + pack.name}<ArrowRight className="w-4 h-4" />
              </button>
            </section>
          ))}
        </div>
        <p className="text-center text-sm text-slate-400 mt-8">URL Verify: 5 créditos por URL. JSON Validate: 2 créditos por validação. API Health: 10 créditos por endpoint.</p>
        <div className="max-w-xl mx-auto text-center text-xs text-slate-400 mt-10 space-y-3">
          <p className="flex items-center justify-center gap-2 text-emerald-400"><ShieldCheck className="w-4 h-4" />Pagamento processado pela Stripe</p>
          <p>O saldo é liberado após a confirmação do pagamento. Em seguida, use a chave salva para consultar o saldo e executar os serviços.</p>
          <a href="/mcp" className="inline-block text-cyan-400 underline">Ver instruções de integração</a>
        </div>
      </main>
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">GXEON Systems AI © 2026</footer>
    </div>
  );
}
