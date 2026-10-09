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
  coinbase: { connectorVerifiedAt: string | null; runtimeConfigured: boolean; operatorAuthConfigured: boolean; historyConfigured?: boolean; mode: 'READ_ONLY' };
}

export interface CoinbaseRead {
  status: 'VERIFIED'; observedAt: string; scope: 'API_KEY_PORTFOLIO';
  accounts: Array<{ accountId: string; portfolioId: string | null; currency: string; available: string; hold: string; network: null }>;
  openOrders: number;
}

export interface CoinbaseTransaction {
  id: string; accountId: string; currency: string; amount: string;
  type: string; status: string; createdAt: string;
  network: string | null; networkStatus: string | null; txHash: string | null;
  receiptStatus: 'PROVIDER_COMPLETED' | 'NOT_CONFIRMED';
  revenueStatus: 'NOT_RECONCILED';
}
export interface CoinbaseHistory {
  status: 'VERIFIED'; observedAt: string; source: 'COINBASE_TRACK_API';
  scope: 'CONFIGURED_ACCOUNTS'; accountIds: string[];
  transactions: CoinbaseTransaction[];
  reconciliation: 'AUTHENTICATED_LEDGER_LINK_REQUIRED';
}
export function isCoinbaseReceipt(transaction: Pick<CoinbaseTransaction, 'type' | 'status' | 'amount'>): boolean {
  // A buy, trade, internal transfer or pending credit is not a received payment.
  return transaction.type === 'receive' && transaction.status === 'completed' &&
    /^\d+(\.\d+)?$/.test(transaction.amount) && /[1-9]/.test(transaction.amount);
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
      !(coinbase.historyConfigured === undefined || typeof coinbase.historyConfigured === 'boolean') ||
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
        return account && identifier(account.accountId) && (account.portfolioId === null || identifier(account.portfolioId)) && account.network === null && typeof account.currency === 'string' && /^[A-Z0-9]{2,12}$/.test(account.currency) &&
          typeof account.available === 'string' && /^\d+(\.\d+)?$/.test(account.available) &&
          typeof account.hold === 'string' && /^\d+(\.\d+)?$/.test(account.hold);
      })) {
    throw new Error('Resposta Coinbase inválida. Nenhum saldo foi confirmado.');
  }
  return value as CoinbaseRead;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function optionalText(value: unknown): boolean {
  return value === null || (typeof value === 'string' && /^[A-Za-z0-9_: -]{1,128}$/.test(value));
}
export function parseCoinbaseHistory(value: unknown): CoinbaseHistory {
  const data = object(value);
  const seen = new Set<string>();
  if (!data || data.status !== 'VERIFIED' || data.source !== 'COINBASE_TRACK_API' ||
      data.scope !== 'CONFIGURED_ACCOUNTS' || !timestamp(data.observedAt) ||
      data.reconciliation !== 'AUTHENTICATED_LEDGER_LINK_REQUIRED' ||
      !Array.isArray(data.accountIds) || !data.accountIds.length || data.accountIds.length > 10 ||
      !data.accountIds.every(identifier) || new Set(data.accountIds).size !== data.accountIds.length ||
      !Array.isArray(data.transactions) || data.transactions.length > 2000 ||
      !data.transactions.every(value => {
        const row = object(value);
        if (!row || !identifier(row.id) || !identifier(row.accountId) || !(data.accountIds as string[]).includes(row.accountId) ||
            typeof row.currency !== 'string' || !/^[A-Z0-9]{2,12}$/.test(row.currency) ||
            typeof row.amount !== 'string' || !/^-?\d+(\.\d+)?$/.test(row.amount) ||
            !identifier(row.type) || !identifier(row.status) || !timestamp(row.createdAt) ||
            !optionalText(row.network) || !optionalText(row.networkStatus) || !optionalText(row.txHash) ||
            row.revenueStatus !== 'NOT_RECONCILED' ||
            row.receiptStatus !== (isCoinbaseReceipt(row as unknown as CoinbaseTransaction) ? 'PROVIDER_COMPLETED' : 'NOT_CONFIRMED')) return false;
        const key = `${row.accountId}:${row.id}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      })) throw new Error('Histórico Coinbase inválido. Nenhum recebimento foi confirmado.');
  return value as CoinbaseHistory;
}
