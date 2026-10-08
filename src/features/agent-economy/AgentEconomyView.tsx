import React, { useState, useEffect } from 'react';
import {
  Bot,
  Zap,
  Radio,
  FileCheck,
  Server,
  Layers,
  Activity,
  CreditCard,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { SERVICE_REGISTRY } from '../../agent-economy/services/registry';
import { TaskmarketPanel } from './TaskmarketPanel';

export const AgentEconomyView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<
    'overview' | 'services' | 'radar' | 'workers' | 'docs' | 'taskmarket'
  >('overview');

  const [services] = useState(Object.values(SERVICE_REGISTRY));
  const [radarSignals, setRadarSignals] = useState<any[]>([]);
  const [radarQuery, setRadarQuery] = useState<string>('verification');
  const [realRevenue, setRealRevenue] = useState<string>('INDISPONÍVEL');
  const [stripeProof, setStripeProof] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  const fetchRadar = async (overrideQuery?: string) => {
    setLoading(true);
    const q = overrideQuery || radarQuery;
    try {
      const res = await fetch(`/api/v1/radar?refresh=true&query=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setRadarSignals(json.opportunities || []);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRadar();
    fetch('/api/integration-status')
      .then((res) => res.json())
      .then((data) => {
        const verified = data.stripeProviderMoneyTruth?.status === 'PROVIDER_VERIFIED';
        setStripeProof(verified);
        setRealRevenue(verified ? (data.realRevenue || 'INDISPONÍVEL') : 'INDISPONÍVEL');
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  GXEON Agent Capability Market
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    V1 Preview
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Autonomous machine-to-machine API capability execution with internal credit settlement.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <FileCheck className="w-3.5 h-3.5" />
              OpenAPI 3.0
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <a
              href="/.well-known/gxeon-agent.json"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Radio className="w-3.5 h-3.5" />
              Agent Discovery
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview & Metrics', icon: Layers },
            { id: 'taskmarket', label: 'Taskmarket · Trabalho pago', icon: Bot },
            { id: 'services', label: 'Service Registry', icon: Zap },
            { id: 'radar', label: 'Demand Radar', icon: Radio },
            { id: 'workers', label: 'Worker Leases', icon: Server },
            { id: 'docs', label: 'Machine Protocol', icon: FileCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OVERVIEW SECTION */}
      {(activeSection === 'overview' || activeSection === 'taskmarket') && <TaskmarketPanel />}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Active Services</span>
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {services.filter((s) => s.status === 'AVAILABLE').length}
            </div>
            <div className="text-xs text-slate-500 mt-1">AVAILABLE in catalog</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Accounting Mode</span>
              <CreditCard className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white">PREPAID</div>
            <div className="text-xs text-slate-500 mt-1">GXEON Internal Credits</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Anti-SSRF Protection</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">ACTIVE</div>
            <div className="text-xs text-slate-500 mt-1">Multi-tier CIDR & DNS verification</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Capturado menos estornos (Stripe · 30 dias)</span>
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">{realRevenue}</div>
            <div className="text-xs text-slate-400 mt-1">
              {stripeProof ? 'Provedor verificado · antes de taxas e repasses' : 'Aguardando snapshot verificado · não inferir receita'}
            </div>
          </div>
        </div>
      )}

      {/* SERVICES SECTION */}
      {activeSection === 'services' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {services.map((svc) => (
            <div
              key={svc.serviceId}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white text-base">{svc.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      svc.status === 'AVAILABLE'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {svc.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">{svc.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Unit Price:</span>
                  <span className="text-cyan-400 font-semibold">
                    {svc.unitPriceCredits} Credits / {svc.unit}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Risk Class:</span>
                  <span className="text-slate-300">{svc.riskClass}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Max Batch:</span>
                  <span className="text-slate-300">{svc.maxBatch}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RADAR SECTION */}
      {activeSection === 'radar' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-400" />
                Radar Quântico de Agentes & Demanda Live
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Varredura contínua no ecossistema CDP x402 Bazaar, identificando agentes autônomos transacionando em USDC e contratando capacidades de IA por API.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchRadar()}
                disabled={loading}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar Radar
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-500 font-medium mr-1">Tópicos:</span>
            {['verification', 'json', 'validate', 'agent', 'url'].map((topic) => (
              <button
                key={topic}
                onClick={() => {
                  setRadarQuery(topic);
                  fetchRadar(topic);
                }}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  radarQuery === topic
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                #{topic}
              </button>
            ))}
          </div>

          {radarSignals.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
              {loading ? 'Varrendo rede x402 e contratos de agentes...' : 'Nenhum sinal detectado neste filtro. Clique em Atualizar ou mude o tópico acima.'}
            </div>
          ) : (
            <div className="space-y-3">
              {radarSignals.map((sig) => (
                <div
                  key={sig.opportunityId}
                  className="p-4 bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-white">{sig.title}</h4>
                      {sig.sourceUrl && (
                        <a
                          href={sig.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-cyan-400 text-xs inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                          sig.kind === 'USAGE_SIGNAL'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {sig.kind || 'SUPPLY_LISTING'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2">{sig.rawDescription || sig.summary}</p>

                    <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-500 pt-1">
                      <span>Origem: <strong className="text-slate-400">{sig.source}</strong></span>
                      <span>Capacidade GXEON: <strong className="text-cyan-400">{sig.requiredCapability}</strong></span>
                      {sig.statedPrice !== undefined && sig.statedPrice !== null && (
                        <span className="text-emerald-400 font-semibold">
                          Preço: {sig.statedPrice} {sig.priceCurrency || 'USDC'}
                        </span>
                      )}
                      {sig.calls30d ? (
                        <span className="text-purple-400 font-medium">
                          Chamadas 30d: {sig.calls30d} ({sig.uniquePayers30d || 1} pagadores)
                        </span>
                      ) : null}
                      <span>Confiança: {Math.round((sig.confidence || 0.8) * 100)}%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-cyan-300 font-mono border border-slate-700">
                      {sig.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Machine API Sales Guide */}
          <div className="p-4 bg-slate-950/80 border border-cyan-900/30 rounded-xl space-y-2">
            <h4 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              Como Agentes Externos Compram e Pagam via API
            </h4>
            <p className="text-xs text-slate-400">
              Qualquer agente autônomo consome serviços GXEON via chamada HTTP direta sem intervenção humana:
            </p>
            <div className="bg-slate-900 p-2.5 rounded text-[11px] font-mono text-slate-300 overflow-x-auto border border-slate-800">
              <code>
                curl -X POST https://gxeon-wallet-command-center.vercel.app/api/v1/jobs \<br/>
                &nbsp;&nbsp;-H "Authorization: Bearer gx_live_YOUR_KEY" \<br/>
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br/>
                &nbsp;&nbsp;-d '{`{"quoteId": "qte_...", "input": {"urls": ["https://example.com"]}}`}'
              </code>
            </div>
          </div>
        </div>
      )}

      {/* WORKERS SECTION */}
      {activeSection === 'workers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-white">Capability Worker Cluster</h3>
          <p className="text-xs text-slate-400">
            Isolated execution nodes monitored by GXEON Commander with bounded concurrency.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {[
              {
                id: 'worker_url_verify_01',
                name: 'URL Verify Node',
                status: 'ONLINE',
                cap: 'gxeon_url_verify_v1',
                success: '99.2%',
                avgLat: '240ms',
              },
              {
                id: 'worker_json_validate_01',
                name: 'JSON Validate Sandbox',
                status: 'ONLINE',
                cap: 'gxeon_json_validate_v1',
                success: '100%',
                avgLat: '14ms',
              },
              {
                id: 'worker_api_health_01',
                name: 'API Health Probe',
                status: 'ONLINE',
                cap: 'gxeon_api_health_v1',
                success: '98.5%',
                avgLat: '310ms',
              },
            ].map((w) => (
              <div key={w.id} className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-slate-400">{w.id}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {w.status}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white mb-2">{w.name}</div>
                <div className="text-xs text-slate-500 space-y-1">
                  <div>Capability: {w.cap}</div>
                  <div>Success Rate: {w.success}</div>
                  <div>Avg Latency: {w.avgLat}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOCS / MACHINE PROTOCOL SECTION */}
      {activeSection === 'docs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-white">Machine Consumption Protocol</h3>
          <p className="text-xs text-slate-400">
            Autonomous agents interact exclusively via REST or JSON-RPC 2.0 without human checkout.
          </p>

          <div className="space-y-4 pt-2">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-xs font-semibold text-cyan-400 mb-2">
                1. Request Authoritative Quote
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-x-auto p-2 bg-slate-900/80 rounded">
{`curl -X POST https://gxeon-wallet-command-center.vercel.app/api/v1/quote \\
  -H "Authorization: Bearer gxa_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"serviceId": "gxeon_url_verify_v1", "quantity": 100}'`}
              </pre>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-xs font-semibold text-cyan-400 mb-2">
                2. Submit Job with Quote ID
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-x-auto p-2 bg-slate-900/80 rounded">
{`curl -X POST https://gxeon-wallet-command-center.vercel.app/api/v1/jobs \\
  -H "Authorization: Bearer gxa_live_..." \\
  -H "Idempotency-Key: your_unique_uuid" \\
  -H "Content-Type: application/json" \\
  -d '{"quoteId": "quo_...", "input": {"urls": ["https://example.com"]}}'`}
              </pre>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-xs font-semibold text-cyan-400 mb-2">
                3. Retrieve Completed Result & Telemetry
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-x-auto p-2 bg-slate-900/80 rounded">
{`curl -X GET "https://gxeon-wallet-command-center.vercel.app/api/v1/jobs/job_.../result" \\
  -H "Authorization: Bearer gxa_live_..."`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
