import { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Terminal,
  Lock,
  Zap,
  Globe,
  FileCode2,
  Activity,
  Server
} from 'lucide-react';

export function QuickFixLanding() {
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    problemSummary: '',
    repoOrCodeUrl: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    if (!formData.customerEmail || !formData.problemSummary) {
      setErrorMessage('Por favor, informe seu e-mail e a descrição do problema.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Falha ao iniciar checkout no Stripe.');
      }

      // Redireciona para o Stripe Hosted Checkout seguro
      window.location.href = data.checkoutUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  const scrollToForm = () => {
    document.getElementById('intake-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#070D18] text-slate-100 flex flex-col font-sans selection:bg-[#FF7A00] selection:text-black">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-[#0B1220]/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-wider text-white">
              GXEON<span className="text-[#FF7A00]">.</span>
            </span>
            <span className="hidden sm:inline-block text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
              Technical Reliability
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/" className="text-slate-400 hover:text-white transition">Painel</a>
            <a href="/credits" className="text-slate-400 hover:text-white transition">Créditos de API</a>
            <a href="/mcp" className="text-slate-400 hover:text-white transition">Protocolo MCP</a>
            <button
              onClick={scrollToForm}
              className="bg-[#FF7A00] hover:bg-[#FF8A1A] text-black font-semibold text-xs px-3.5 py-1.5 rounded transition shadow-lg shadow-[#FF7A00]/20"
            >
              Pedir Quick Fix
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF7A00]/10 border border-[#FF7A00]/30 text-[#FF7A00] text-xs font-mono mb-6 uppercase tracking-wider">
          <Zap className="w-3.5 h-3.5" /> Diagnóstico Técnico Automatizado
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
          Seu site, API ou integração parou?
        </h1>
        <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-8 font-normal leading-relaxed">
          O GXEON analisa, testa e entrega um diagnóstico técnico automatizado com evidência auditável e recomendações de correção.
        </p>

        {/* Pricing Badge */}
        <div className="inline-flex flex-col sm:flex-row items-center gap-4 bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 sm:p-6 mb-10 shadow-2xl">
          <div className="text-left">
            <div className="text-xs font-mono uppercase text-slate-400">Preço Fixo de Lançamento</div>
            <div className="text-3xl font-black text-white flex items-baseline gap-1">
              R$ 49<span className="text-sm font-normal text-slate-400">,00 / intervenção</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800 hidden sm:block"></div>
          <button
            onClick={scrollToForm}
            className="w-full sm:w-auto bg-[#FF7A00] hover:bg-[#FF8A1A] text-black font-bold text-sm px-6 py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#FF7A00]/25"
          >
            ANALISAR MEU PROBLEMA <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* O que analisamos */}
      <section className="py-16 bg-slate-950/60 border-y border-slate-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">O que nós analisamos</h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto">
              Cobrimos os pontos mais comuns de falha em infraestrutura web moderna e APIs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-[#0B1220] border border-slate-800/80 p-6 rounded-xl">
              <Server className="w-8 h-8 text-[#FF7A00] mb-4" />
              <h3 className="font-semibold text-white mb-2">APIs Fora do Ar</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Testamos tempos de resposta, timeouts de gateway, códigos 502/504 e integridade de endpoints REST e Webhooks.
              </p>
            </div>

            <div className="bg-[#0B1220] border border-slate-800/80 p-6 rounded-xl">
              <Globe className="w-8 h-8 text-blue-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">Links Quebrados</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Verificação profunda de páginas, ativos em 404, redirects infinitos e inconsistências de rotas.
              </p>
            </div>

            <div className="bg-[#0B1220] border border-slate-800/80 p-6 rounded-xl">
              <Activity className="w-8 h-8 text-emerald-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">Integração com Erro</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Auditoria de assinaturas de webhook (Stripe, GitHub), cabeçalhos obrigatórios e falhas de handshake.
              </p>
            </div>

            <div className="bg-[#0B1220] border border-slate-800/80 p-6 rounded-xl">
              <FileCode2 className="w-8 h-8 text-amber-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">JSON & Payload Inválido</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Validação estrita de schemas JSON, incompatibilidade de tipos de dados e payloads corrompidos.
              </p>
            </div>

            <div className="bg-[#0B1220] border border-slate-800/80 p-6 rounded-xl">
              <Terminal className="w-8 h-8 text-purple-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">Problemas de Deploy</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Diagnóstico de falhas de build na Vercel/Cloudflare, variáveis de ambiente ausentes e erros de SPA.
              </p>
            </div>

            <div className="bg-[#0B1220] border border-slate-800/80 p-6 rounded-xl">
              <ShieldCheck className="w-8 h-8 text-teal-400 mb-4" />
              <h3 className="font-semibold text-white mb-2">Falhas de Configuração</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Auditoria de CORS, portas bloqueadas e exposição indevida de rotas internas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-16 max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Como funciona o processo</h2>
          <p className="text-slate-400 text-sm">Sem reuniões ou orçamentos demorados. Simples e direto.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-[#FF7A00]/20 text-[#FF7A00] font-bold mx-auto mb-3 flex items-center justify-center font-mono">1</div>
            <h4 className="font-semibold text-sm text-white mb-1">Enviar Problema</h4>
            <p className="text-xs text-slate-400">Descreva o sintoma e informe o link afetado.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold mx-auto mb-3 flex items-center justify-center font-mono">2</div>
            <h4 className="font-semibold text-sm text-white mb-1">Pagar R$ 49</h4>
            <p className="text-xs text-slate-400">Checkout transparente com garantia Stripe.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold mx-auto mb-3 flex items-center justify-center font-mono">3</div>
            <h4 className="font-semibold text-sm text-white mb-1">GXEON Executa</h4>
            <p className="text-xs text-slate-400">Agentes técnicos e workers isolados diagnosticam.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 font-bold mx-auto mb-3 flex items-center justify-center font-mono">4</div>
            <h4 className="font-semibold text-sm text-white mb-1">Receber Laudo</h4>
            <p className="text-xs text-slate-400">Relatório técnico com passos de resolução.</p>
          </div>
        </div>
      </section>

      {/* Prova Técnica */}
      <section className="py-12 bg-slate-950/80 border-t border-slate-900">
        <div className="max-w-4xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="text-xs font-mono uppercase text-[#FF7A00] mb-2 tracking-wider">Segurança e Rigor</div>
            <h3 className="text-xl font-bold text-white mb-3">Auditoria Técnica Automatizada</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Cada execução é protegida por socket pinning nativo anti-SSRF, validada por agente QA independente e registrada no Firestore com identificadores únicos.
            </p>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Sem acesso a credenciais sensíveis</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Diagnóstico estruturado com hash criptográfico</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Conexões seguras com verificação TLS completa</li>
            </ul>
          </div>
          <div className="w-full md:w-72 bg-[#0B1220] border border-slate-800 p-5 rounded-xl font-mono text-[11px] text-slate-400">
            <div className="text-slate-500 mb-2">// EXECUTION EVIDENCE SAMPLE</div>
            <div className="text-emerald-400 font-semibold mb-1">STATUS: COMPLETED</div>
            <div className="text-slate-300">SERVICE: gxeon_quick_fix_v1</div>
            <div className="text-slate-300">STORE: FIRESTORE_REST_WIF</div>
            <div className="text-slate-300">SECURITY: ANTI_SSRF_PINNED</div>
            <div className="text-slate-400 mt-2 text-[10px]">EVIDENCE_HASH: e7d8a9f...</div>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section id="intake-form" className="py-16 md:py-24 max-w-xl mx-auto px-4 w-full">
        <div className="bg-[#0B1220] border border-slate-800 p-6 md:p-8 rounded-2xl shadow-2xl">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-white mb-2">Iniciar Quick Fix</h3>
            <p className="text-xs text-slate-400">
              Preencha os dados do seu chamado técnico. Ao clicar, você será direcionado ao Stripe Checkout de R$ 49.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-3 bg-red-950/60 border border-red-800 rounded-lg flex items-center gap-2 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
                Seu Nome ou Empresa
              </label>
              <input
                type="text"
                placeholder="Ex: João da Silva / Minha Empresa"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
                Seu E-mail * (para entrega do relatório)
              </label>
              <input
                type="email"
                required
                placeholder="exemplo@empresa.com"
                value={formData.customerEmail}
                onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
                Descrição do Problema *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Ex: Minha API parou de responder depois do último deploy. O frontend retorna status 502 Bad Gateway no endpoint /api/users."
                value={formData.problemSummary}
                onChange={(e) => setFormData({ ...formData, problemSummary: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-slate-400 mb-1">
                URL do Site, API ou Repositório (Opcional)
              </label>
              <input
                type="text"
                placeholder="https://api.meusite.com.br ou https://github.com/org/repo"
                value={formData.repoOrCodeUrl}
                onChange={(e) => setFormData({ ...formData, repoOrCodeUrl: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00]"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#FF7A00] hover:bg-[#FF8A1A] disabled:opacity-50 text-black font-bold text-sm py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#FF7A00]/25"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full"></span>
                    CONECTANDO AO STRIPE...
                  </span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> PAGAR R$ 49 E INICIAR DIAGNÓSTICO
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 text-center pt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Pagamento 100% seguro via Stripe Hosted Checkout (BRL)
            </div>
          </form>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 mt-auto">
        GXEON Systems AI &copy; 2026. Todos os direitos reservados.
      </footer>
    </div>
  );
}
