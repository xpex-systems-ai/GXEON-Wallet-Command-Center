import { useEffect } from 'react';
import { CommunityDirectory } from '../features/integrations/CommunityDirectory';

export function Ecosystem() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'GXEON Open Agent Infrastructure';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100">
      <header className="border-b border-[#1E314F] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.22em] text-[#00D4FF]">GXEON</p>
            <h1 className="text-2xl font-semibold mt-1">Ecossistema e Infraestrutura Aberta</h1>
          </div>
          <a
            href="/"
            className="text-sm font-mono text-slate-300 hover:text-white transition-colors"
          >
            Voltar ao Command Center
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <section className="space-y-4">
          <p className="text-slate-300 leading-7">
            O GXEON acompanha infraestrutura pública relevante para operações de agentes, automação,
            recompensas técnicas e mídia orientada por agentes. Esta página registra referências
            externas usadas para pesquisa, interoperabilidade e verificação operacional.
          </p>
          <p className="text-sm text-slate-500">
            As referências abaixo são informativas e apontam diretamente para os respectivos projetos.
          </p>
        </section>

        <section className="space-y-5"><h2 className="text-xl font-semibold">Rede de comunidades GXEON</h2><CommunityDirectory /><a href="/?tab=integrations" className="inline-block text-cyan-400 text-sm">Abrir Comunidades e Integrações no painel →</a></section>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-[#1E314F] bg-[#111B2D] p-6">
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-[#FF7A00]">
              Rewards & infrastructure
            </div>
            <h2 className="mt-3 text-xl font-semibold">RustChain</h2>
            <p className="mt-3 text-slate-300 leading-7">
              Para pesquisa de rede, recompensas e ecossistema técnico, o GXEON referencia a
              documentação pública da{' '}
              <a
                href="https://rustchain.org"
                className="font-medium text-[#00D4FF] underline underline-offset-4 hover:text-cyan-300"
              >
                RustChain
              </a>
              .
            </p>
          </article>

          <article className="rounded-2xl border border-[#1E314F] bg-[#111B2D] p-6">
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-[#00D4FF]">
              Agent media
            </div>
            <h2 className="mt-3 text-xl font-semibold">BoTTube</h2>
            <p className="mt-3 text-slate-300 leading-7">
              Para observação de mídia publicada por agentes e experimentos de distribuição, o GXEON
              também acompanha a plataforma pública{' '}
              <a
                href="https://bottube.ai"
                className="font-medium text-[#FF7A00] underline underline-offset-4 hover:text-orange-300"
              >
                BoTTube
              </a>
              .
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-[#1E314F] bg-[#0E1726] p-6">
          <h2 className="text-lg font-semibold">Política de referência externa</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            O GXEON não solicita chaves privadas, seed phrases ou credenciais por meio destas
            referências. Links externos são usados apenas para navegação informativa e verificação
            independente de recursos públicos.
          </p>
        </section>
      </main>
    </div>
  );
}

export default Ecosystem;
