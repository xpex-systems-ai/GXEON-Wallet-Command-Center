import { useState } from 'react';
import {
  Coins,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Lock,
  Cpu,
  AlertCircle
} from 'lucide-react';

interface PackOption {
  id: string;
  name: string;
  tag: string;
  credits: number;
  priceBrl: number;
  popular?: boolean;
  features: string[];
}

const PACKS: PackOption[] = [
  {
    id: 'pack_100',
    name: 'STARTER',
    tag: 'Testes & Protótipos',
    credits: 100,
    priceBrl: 20,
    features: [
      '100 execuções de URL Verify ou JSON Validate',
      'Acesso via API REST e protocolo MCP',
      'Validade indeterminada (sem expiração)',
      'Suporte a webhooks e relatórios estruturados',
    ],
  },
  {
    id: 'pack_500',
    name: 'PRO',
    tag: 'Mais Popular',
    credits: 500,
    priceBrl: 80,
    popular: true,
    features: [
      '500 execuções completas',
      'Economia de 20% por crédito',
      'Prioridade de fila em workers dedicados',
      'Acesso a todas as ferramentas do GXEON MCP',
      'Logs e evidências criptográficas por 90 dias',
    ],
  },
  {
    id: 'pack_2000',
    name: 'ENTERPRISE',
    tag: 'Volume & Produção',
    credits: 2000,
    priceBrl: 250,
    features: [
      '2.000 execuções de alto volume',
      'Maior desconto por unidade (R$ 0,125/unidade)',
      'Concorrência de até 50 requisições simultâneas',
      'Suporte prioritário e canal de integração',
      'Acesso imediato a novos workers e features',
    ],
  },
];

export function CreditsStore() {
  const [selectedPackId, setSelectedPackId] = useState('pack_500');
  const [accountId, setAccountId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCheckout = async (packId: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    // Se o usuário não tiver um accountId existente, geramos um automaticamente
    const effectiveAccountId = accountId.trim() || `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      // 1. Garante que a conta existe no backend se for uma nova
      await fetch('/v1/auth/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: effectiveAccountId,
          name: agentName.trim() || `Agente ${effectiveAccountId.slice(0, 8)}`,
        }),
      }).catch(() => {
        // Se já existir ou endpoint retornar 200/409, prossegue normalmente
      });

      // 2. Chama endpoint oficial de top-up do Stripe
      const res = await fetch('/v1/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId,
          accountId: effectiveAccountId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error?.message || data.error || 'Falha ao gerar link de pagamento.');
      }

      // Redireciona para o Stripe Hosted Checkout seguro
      window.location.href = data.checkoutUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D18] text-slate-100 flex flex-col font-sans selection:bg-[#FF7A00] selection:text-black">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-[#0B1220]/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xl font-bold tracking-wider text-white">
              GXEON<span className="text-[#FF7A00]">.</span>
            </a>
            <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
              Machine Credits
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/" className="text-slate-400 hover:text-white transition">Painel</a>
            <a href="/fix" className="text-slate-400 hover:text-white transition">Quick Fix</a>
            <a href="/mcp" className="text-slate-400 hover:text-white transition">Protocolo MCP</a>
          </nav>
        </div>
      </header>

      {/* Main Section */}
      <main className="py-16 md:py-24 px-4 max-w-6xl mx-auto flex-1">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono mb-4 uppercase tracking-wider">
            <Coins className="w-3.5 h-3.5" /> Saldo Pré-Pago Autônomo
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            GXEON Machine Credits
          </h1>
          <p className="text-slate-300 text-base md:text-lg">
            Adquira créditos pré-pagos em reais para consumo por APIs e agentes de IA sem checkout manual por tarefa.
          </p>
        </div>

        {/* Account Identifier Box */}
        <div className="max-w-xl mx-auto mb-12 bg-[#0B1220] border border-slate-800 p-6 rounded-2xl shadow-xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#FF7A00]" /> Destino dos Créditos
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nome do seu Agente ou Projeto
              </label>
              <input
                type="text"
                placeholder="Ex: Agente Autônomo Alpha / Meu Projeto"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Account ID existente (opcional — deixe em branco para gerar uma nova conta)
              </label>
              <input
                type="text"
                placeholder="Ex: acc_..."
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#FF7A00]"
              />
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="max-w-xl mx-auto mb-8 p-3 bg-red-950/60 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PACKS.map((pack) => {
            const isSelected = selectedPackId === pack.id;
            return (
              <div
                key={pack.id}
                onClick={() => setSelectedPackId(pack.id)}
                className={`relative bg-[#0B1220] rounded-2xl p-6 sm:p-8 border transition flex flex-col justify-between cursor-pointer ${
                  pack.popular
                    ? 'border-[#FF7A00] shadow-2xl shadow-[#FF7A00]/10'
                    : isSelected
                    ? 'border-slate-500 shadow-xl'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF7A00] text-black font-bold text-[10px] uppercase font-mono px-3 py-0.5 rounded-full tracking-wider shadow">
                    {pack.tag}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">{pack.name}</span>
                    <span className="text-xs bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded font-mono">
                      {pack.credits} créditos
                    </span>
                  </div>

                  <div className="mb-6">
                    <div className="text-4xl font-black text-white flex items-baseline gap-1">
                      R$ {pack.priceBrl}
                      <span className="text-xs text-slate-400 font-normal">,00 BRL</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Apenas R$ {(pack.priceBrl / pack.credits).toFixed(2)} por execução
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8 text-xs text-slate-300">
                    {pack.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCheckout(pack.id);
                  }}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                    pack.popular
                      ? 'bg-[#FF7A00] hover:bg-[#FF8A1A] text-black shadow-lg shadow-[#FF7A00]/25'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {isLoading && selectedPackId === pack.id ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></span>
                      PROCESSANDO...
                    </span>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" /> Comprar {pack.name} <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Security & Money Truth Footer Note */}
        <div className="mt-16 text-center text-xs text-slate-500 max-w-xl mx-auto space-y-2">
          <div className="flex items-center justify-center gap-2 text-emerald-400/90 font-mono text-[11px]">
            <ShieldCheck className="w-4 h-4" /> Pagamento Processado com Segurança pela Stripe
          </div>
          <p>
            O saldo é liberado automaticamente após a confirmação do webhook oficial do Stripe. Sem assinatura recorrente oculta.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        GXEON Systems AI &copy; 2026. Todos os direitos reservados.
      </footer>
    </div>
  );
}
