import { useState } from 'react';
import {
  Terminal,
  Cpu,
  Layers,
  Copy,
  Check,
  Coins,
  ArrowRight
} from 'lucide-react';

export function McpDocs() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const claudeConfigSnippet = `{
  "mcpServers": {
    "gxeon": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp"
      ],
      "env": {
        "GXEON_API_KEY": "<YOUR_KEY>"
      }
    }
  }
}`;

  const directCurlSnippet = `curl -X POST https://gxeon-wallet-command-center.vercel.app/api/v1/mcp \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_quote",
      "arguments": {
        "serviceId": "gxeon_url_verify_v1",
        "quantity": 10
      }
    }
  }'`;

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
              MCP Documentation
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/" className="text-slate-400 hover:text-white transition">Painel</a>
            <a href="/fix" className="text-slate-400 hover:text-white transition">Quick Fix</a>
            <a href="/credits" className="text-slate-400 hover:text-white transition">Créditos</a>
            <a
              href="/credits"
              className="bg-[#FF7A00] hover:bg-[#FF8A1A] text-black font-semibold text-xs px-3.5 py-1.5 rounded transition shadow-lg shadow-[#FF7A00]/20"
            >
              Comprar Créditos
            </a>
          </nav>
        </div>
      </header>

      {/* Main Section */}
      <main className="py-16 md:py-20 px-4 max-w-5xl mx-auto flex-1">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-mono mb-4 uppercase tracking-wider">
            <Terminal className="w-3.5 h-3.5" /> Model Context Protocol (MCP)
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            GXEON MCP Server
          </h1>
          <p className="text-slate-300 text-base md:text-lg">
            Conecte agentes como Claude, Cursor, LangChain ou CrewAI às ferramentas de auditoria e verificação do GXEON com liquidação automática de créditos.
          </p>
        </div>

        {/* Protocol Flow */}
        <section className="mb-16 bg-[#0B1220] border border-slate-800 p-6 md:p-8 rounded-2xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#FF7A00]" /> Fluxo Operacional Autônomo
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-slate-500 font-mono text-[10px] mb-1">PASSO 1</div>
              <div className="font-semibold text-white">tools/list</div>
              <div className="text-[11px] text-slate-400 mt-1">Descoberta de capacidades</div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-slate-500 font-mono text-[10px] mb-1">PASSO 2</div>
              <div className="font-semibold text-white">get_quote</div>
              <div className="text-[11px] text-slate-400 mt-1">Cotação criptográfica</div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-slate-500 font-mono text-[10px] mb-1">PASSO 3</div>
              <div className="font-semibold text-white">submit_job</div>
              <div className="text-[11px] text-slate-400 mt-1">Reserva atômica de saldo</div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-slate-500 font-mono text-[10px] mb-1">PASSO 4</div>
              <div className="font-semibold text-white">get_result</div>
              <div className="text-[11px] text-slate-400 mt-1">Resultado + Evidência</div>
            </div>
          </div>
        </section>

        {/* Tool Catalog */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" /> Ferramentas Expostas
          </h2>
          <div className="space-y-4">
            <div className="bg-[#0B1220] border border-slate-800 p-5 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold text-[#FF7A00]">gxeon_url_verify_v1</span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">5 créditos / unidade</span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Verifica URLs públicas com proteção Anti-SSRF, socket pinning estrito, medição de latência, códigos HTTP e validação TLS.
              </p>
              <div className="text-[11px] font-mono text-slate-500 bg-slate-950 p-2 rounded">
                Input: &#123; "urls": ["https://exemplo.com"] &#125;
              </div>
            </div>

            <div className="bg-[#0B1220] border border-slate-800 p-5 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold text-[#FF7A00]">gxeon_json_validate_v1</span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">2 créditos / validação</span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Valida dados estruturados contra schemas JSON Draft 7/2020-12, apontando divergências e JSON Pointers exatos.
              </p>
              <div className="text-[11px] font-mono text-slate-500 bg-slate-950 p-2 rounded">
                Input: &#123; "schema": &#123; ... &#125;, "data": &#123; ... &#125; &#125;
              </div>
            </div>

            <div className="bg-[#0B1220] border border-slate-800 p-5 rounded-xl opacity-75">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-semibold text-slate-400">gxeon_api_health_v1</span>
                <span className="text-xs bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-mono">Em breve</span>
              </div>
              <p className="text-xs text-slate-400">
                Observabilidade pontual de endpoints REST, headers de segurança e tempos de resposta de borda.
              </p>
            </div>
          </div>
        </section>

        {/* Configuration Examples */}
        <section className="mb-16 space-y-8">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                1. Configuração no Claude Desktop (claude_desktop_config.json)
              </h3>
              <button
                onClick={() => copyToClipboard(claudeConfigSnippet, 1)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedIndex === 1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIndex === 1 ? 'Copiado!' : 'Copiar JSON'}
              </button>
            </div>
            <pre className="bg-[#0B1220] border border-slate-800 p-4 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
              {claudeConfigSnippet}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                2. Chamada Direta via cURL (JSON-RPC 2.0)
              </h3>
              <button
                onClick={() => copyToClipboard(directCurlSnippet, 2)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedIndex === 2 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIndex === 2 ? 'Copiado!' : 'Copiar cURL'}
              </button>
            </div>
            <pre className="bg-[#0B1220] border border-slate-800 p-4 rounded-xl text-xs font-mono text-blue-300 overflow-x-auto leading-relaxed">
              {directCurlSnippet}
            </pre>
          </div>
        </section>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-slate-900 via-[#0B1220] to-slate-900 border border-slate-800 p-8 rounded-2xl text-center">
          <h3 className="text-xl font-bold text-white mb-2">Pronto para integrar ao seu agente?</h3>
          <p className="text-xs text-slate-300 mb-6 max-w-lg mx-auto">
            Adquira créditos pré-pagos a partir de R$ 20,00 e receba imediatamente sua chave de acesso à API.
          </p>
          <a
            href="/credits"
            className="inline-flex items-center gap-2 bg-[#FF7A00] hover:bg-[#FF8A1A] text-black font-bold text-sm px-6 py-3 rounded-xl transition shadow-lg shadow-[#FF7A00]/20"
          >
            <Coins className="w-4 h-4" /> Comprar Pacote de Créditos <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        GXEON Systems AI &copy; 2026. Todos os direitos reservados.
      </footer>
    </div>
  );
}
