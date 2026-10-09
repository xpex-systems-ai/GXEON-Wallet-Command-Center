export const COMMUNITY_COMMAND_URL = 'https://xpex-systems-command-staging-web-production.up.railway.app/communities';

// Public participation evidence only. Private partnerships, delivery proofs and
// the tenant ledger remain in the authenticated Community Command service.
export const communities = [
  { id: 'circadian', name: 'Circadian Agent Collective', category: 'Colaboração de agentes', status: 'Apresentação publicada', evidence: 'PUBLIC', checkedAt: '2026-10-09T00:43:00Z', url: 'https://github.com/Circadian-agent/agent-collective', evidenceUrl: 'https://github.com/Circadian-agent/agent-collective/issues/1#issuecomment-6067297859', description: 'Apresentação institucional publicada por @xpex-systems-ai.' },
  { id: 'agent-community', name: 'Agent Community', category: 'Comunidade e eventos', status: 'Cadastro informado', evidence: 'OPERATOR', checkedAt: null, url: 'https://agentcommunity.org', evidenceUrl: 'https://agentcommunity.org/members', description: 'Cadastro informado pelo operador. Vínculo organizacional e namespace aguardam confirmação independente.' },
  { id: 'the-collectives', name: 'The Collectives', category: 'Discussões públicas', status: 'Apresentação publicada', evidence: 'PUBLIC', checkedAt: '2026-10-09T01:04:00Z', url: 'https://www.thecollectives.dev/rooms', evidenceUrl: 'https://thecollectives.dev/api/search?q=GXEON-AI', description: 'Apresentação GXEON-AI publicada e conferida na API pública.' },
  { id: 'basedagents', name: 'BasedAgents', category: 'Marketplace de tarefas', status: 'Perfil registrado', evidence: 'PUBLIC', checkedAt: '2026-10-09T00:34:03Z', url: 'https://basedagents.ai', evidenceUrl: 'https://api.basedagents.ai/v1/agents/ag_A3fM1pJbVUBuB1bjwQYJv3DBJ26pCWDuqY5xC8aBdC5A', description: 'Perfil público GXEON-AI existente. Cadastro não comprova tarefa financiada ou pagamento.' },
  { id: 'gigs', name: 'Gigs.sh', category: 'Diretório de plataformas', status: 'Referência de diretório', evidence: 'DIRECTORY', checkedAt: null, url: 'https://gigs.sh', evidenceUrl: 'https://github.com/gigs-sh/gigs-sh', description: 'Diretório acompanhado. Publicação da plataforma depende do processo de contribuição.' },
] as const;

export interface EcosystemStatus {
  observedAt: string;
  communityCommand: { status: 'AVAILABLE' | 'UNAVAILABLE'; environment: 'staging'; url: string; dataSync: 'AUTHENTICATED_SESSION_REQUIRED' };
  coinbase: { connectorVerifiedAt: string | null; runtimeConfigured: boolean; operatorAuthConfigured: boolean; mode: 'READ_ONLY' };
}

export interface CoinbaseRead {
  status: 'VERIFIED'; observedAt: string; scope: 'API_KEY_PORTFOLIO';
  accounts: Array<{ currency: string; available: string; hold: string }>;
  openOrders: number;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

// Firebase Hosting may still return the legacy Stripe-only status response.
// Validate before updating React state so an unsupported backend cannot crash
// the main dashboard or be interpreted as a successful Coinbase read.
export function parseEcosystemStatus(value: unknown): EcosystemStatus {
  const data = object(value);
  const coinbase = object(data?.coinbase);
  const community = object(data?.communityCommand);
  if (!data || !coinbase || !community || !timestamp(data.observedAt) ||
      !['AVAILABLE', 'UNAVAILABLE'].includes(String(community.status)) ||
      community.environment !== 'staging' || community.url !== COMMUNITY_COMMAND_URL ||
      community.dataSync !== 'AUTHENTICATED_SESSION_REQUIRED' || coinbase.mode !== 'READ_ONLY' ||
      typeof coinbase.runtimeConfigured !== 'boolean' || typeof coinbase.operatorAuthConfigured !== 'boolean' ||
      !(coinbase.connectorVerifiedAt === null || timestamp(coinbase.connectorVerifiedAt))) {
    throw new Error('Status das integrações indisponível neste ambiente.');
  }
  return value as EcosystemStatus;
}

export function parseCoinbaseRead(value: unknown): CoinbaseRead {
  const data = object(value);
  if (!data || data.status !== 'VERIFIED' || data.scope !== 'API_KEY_PORTFOLIO' ||
      !timestamp(data.observedAt) || !Number.isSafeInteger(data.openOrders) || Number(data.openOrders) < 0 ||
      !Array.isArray(data.accounts) || data.accounts.length > 2000 ||
      !data.accounts.every(value => {
        const account = object(value);
        return account && typeof account.currency === 'string' && /^[A-Z0-9]{2,12}$/.test(account.currency) &&
          typeof account.available === 'string' && /^\d+(\.\d+)?$/.test(account.available) &&
          typeof account.hold === 'string' && /^\d+(\.\d+)?$/.test(account.hold);
      })) {
    throw new Error('Resposta Coinbase inválida. Nenhum saldo foi confirmado.');
  }
  return value as CoinbaseRead;
}
