import { useEffect, useMemo, useState } from 'react';
import { Bot, Boxes, Coins, Copy, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react';

type Pack = {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  currency: string;
};

type Service = {
  serviceId: string;
  name: string;
  description?: string;
  unit?: string;
  unitPriceCredits?: number;
  minimumChargeCredits?: number;
  status?: string;
};

type PackResponse = {
  rail: string;
  currency: string;
  packs: Pack[];
};

type ServiceResponse = {
  capabilities?: string[];
  services?: Service[];
};

const MARKET_MCP =
  'https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market';
const OFFICIAL_MCP_REGISTRY =
  'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.xpex-systems-ai%2Fgxeon-agent-marketplace/versions/latest';

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function AgentMarketplace() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [packResponse, serviceResponse] = await Promise.all([
          fetch('/v1/billing/topup', { cache: 'no-store' }),
          fetch('/v1/services', { cache: 'no-store' }),
        ]);
        const [packData, serviceData] = (await Promise.all([
          packResponse.json(),
          serviceResponse.json(),
        ])) as [PackResponse, ServiceResponse];

        if (!cancelled) {
          setPacks(Array.isArray(packData.packs) ? packData.packs : []);
          setServices(Array.isArray(serviceData.services) ? serviceData.services : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeServices = useMemo(
    () => services.filter((service) => service.status === 'AVAILABLE'),
    [services]
  );

  async function copyMcp() {
    await navigator.clipboard.writeText(MARKET_MCP);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="min-h-screen bg-[#070D18] text-slate-100">
      <header className="border-b border-[#1E314F] bg-[#0B1220]">
        <div className="max-w-6xl mx-auto px-5 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono tracking-[0.22em] text-[#00D4FF]">
              GXEON AGENT MARKET
            </div>
            <h1 className="text-2xl font-bold mt-1">
              Capabilities que agentes podem descobrir e consumir
            </h1>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-400">
            <a href="/credits" className="hover:text-white">Créditos</a>
            <a href="/mcp" className="hover:text-white">Integração</a>
            <a href="/ecosystem" className="hover:text-white">Ecossistema</a>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-14 space-y-12">
        <section className="grid lg:grid-cols-[1.35fr_.65fr] gap-6 items-stretch">
          <div className="rounded-3xl border border-[#263B59] bg-[#0D1728] p-8">
            <div className="flex items-center gap-2 text-[#FF7A00] text-xs font-mono tracking-[0.18em]">
              <Sparkles className="w-4 h-4" />
              MACHINE-TO-MACHINE MARKETPLACE
            </div>
            <h2 className="text-4xl md:text-5xl font-black mt-5 leading-tight">
              Um agente chega com uma demanda.
              <br />
              O GXEON vende a capacidade.
            </h2>
            <p className="mt-5 max-w-2xl text-slate-300 leading-7">
              Descoberta pública por MCP, compra pré-paga por Stripe e execução protegida
              por chave de máquina. O menor pack custa R$ 0,99 e já financia uma validação JSON.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="/credits"
                className="rounded-xl bg-[#FF7A00] px-5 py-3 text-sm font-black text-black"
              >
                Comprar capacidade
              </a>
              <a
                href="/mcp"
                className="rounded-xl border border-[#2A4667] px-5 py-3 text-sm font-semibold text-cyan-300"
              >
                Conectar agente
              </a>
            </div>
          </div>

          <aside className="rounded-3xl border border-[#1D4E5C] bg-[#0B1924] p-7">
            <Bot className="w-7 h-7 text-[#00D4FF]" />
            <h3 className="font-bold text-xl mt-4">Public Market MCP</h3>
            <p className="text-sm text-slate-400 mt-3 leading-6">
              Sem autenticação e somente leitura para descoberta de serviços, packs e fluxo de compra.
            </p>
            <code className="block break-all mt-5 rounded-xl bg-[#07101C] border border-[#1B364A] p-4 text-xs text-cyan-300">
              {MARKET_MCP}
            </code>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={copyMcp}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copiado' : 'Copiar endpoint'}
              </button>
              <a
                href={OFFICIAL_MCP_REGISTRY}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300"
              >
                <ShieldCheck className="w-4 h-4" />
                Official MCP Registry
              </a>
            </div>
            <p className="mt-4 text-xs text-emerald-300/80">
              Publicação oficial ativa: io.github.xpex-systems-ai/gxeon-agent-marketplace · v1.0.0
            </p>
          </aside>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-mono text-[#00D4FF] tracking-[0.18em]">LIVE CATALOG</div>
              <h2 className="text-3xl font-bold mt-2">Capacidades disponíveis</h2>
            </div>
            <span className="text-xs text-slate-500">
              {loading ? 'Carregando…' : activeServices.length + ' ativas'}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {activeServices.map((service) => (
              <article
                key={service.serviceId}
                className="rounded-2xl border border-[#223550] bg-[#0C1626] p-6"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-emerald-400">AVAILABLE</div>
                    <h3 className="text-xl font-bold mt-2">{service.name}</h3>
                  </div>
                  <Boxes className="w-6 h-6 text-[#FF7A00]" />
                </div>
                <p className="text-sm text-slate-400 mt-3 leading-6">
                  {service.description || service.serviceId}
                </p>
                <div className="mt-5 text-sm text-slate-300">
                  <span className="font-mono text-cyan-300">
                    {service.unitPriceCredits ?? service.minimumChargeCredits ?? '—'} créditos
                  </span>
                  {service.unit ? ' / ' + service.unit : ''}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-mono text-[#FF7A00] tracking-[0.18em]">PREPAID CAPACITY</div>
              <h2 className="text-3xl font-bold mt-2">Packs para agentes</h2>
            </div>
            <a href="/credits" className="text-sm text-cyan-300 inline-flex items-center gap-2">
              Abrir loja <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packs.map((pack) => (
              <article
                key={pack.id}
                className="rounded-2xl border border-[#25364E] bg-[#0C1626] p-5"
              >
                <div className="flex justify-between items-center gap-3">
                  <h3 className="font-bold">{pack.name}</h3>
                  <Coins className="w-5 h-5 text-[#FF7A00]" />
                </div>
                <div className="text-3xl font-black mt-4">{brl(pack.priceCents)}</div>
                <p className="text-sm text-slate-400 mt-2">{pack.credits} créditos</p>
                <a
                  href="/credits"
                  className="mt-5 inline-flex text-sm font-semibold text-cyan-300"
                >
                  Comprar pack
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-6">
          <div className="flex gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <h2 className="font-bold">Money Truth</h2>
              <p className="text-sm text-slate-400 mt-2 leading-6">
                Descoberta de catálogo e criação de checkout não são receita. Créditos só entram
                no saldo depois que o GXEON recebe confirmação de liquidação do provedor de pagamento.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AgentMarketplace;
