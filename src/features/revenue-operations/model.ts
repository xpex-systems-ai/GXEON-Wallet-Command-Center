export const UNKNOWN = 'NÃO VERIFICADO';
export const RADAR_MAX_AGE_MS = 15 * 60_000;
export const BASE_BOUNTY_FEED = 'https://www.basebounty.app/api/v1/bounties?status=open';

export type OpportunityState = 'UNDER_REVIEW' | 'BLOCKED_BY_COST' | 'EXPIRED';
export interface RevenueOpportunity {
  key: string; provider: string; externalId: string; title: string; url: string;
  reward: number | null; currency: string; network: string | null;
  deadline: string | null; observedAt: string | null; stale: boolean;
  funding: 'RADAR_ONCHAIN_EVIDENCE' | 'PROVIDER_REPORTED' | 'UNKNOWN';
  fundingTx: string | null; fundingCheckedAt: string | null;
  sourceHash: string | null; claimStatus: string; state: OpportunityState;
  initialCostRequired: true | null; eligibilityVerified: null;
}
export interface RevenueSource {
  id: string; name: string; url: string;
  status: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
  observedAt: string | null; count: number | null;
}
export interface RevenueSnapshot {
  mode: 'READ_ONLY'; observedAt: string; sources: RevenueSource[];
  opportunities: RevenueOpportunity[];
  ledger: 'AUTHENTICATED_RECONCILIATION_REQUIRED';
  agenticTrade: 'ACCOUNT_AND_PUBLICATION_NOT_VERIFIED';
}
export interface CatalogService { serviceId: string; name: string; unitPriceCredits: number; status: string }

export const SERVICE_PROPOSALS = [
  { id: 'usdc-proof', name: 'GXEON USDC Proof Validator', price: '0,01', purpose: 'Verificar token, rede, destinatário e confirmação de uma transação pública.', reuse: 'Verificador de pagamentos existente; adaptação comercial pendente.', serviceId: null },
  { id: 'api-audit', name: 'XPeX API Health Auditor', price: '0,02', purpose: 'Auditar disponibilidade, latência e resposta de APIs públicas autorizadas.', reuse: 'Reutilizar gxeon_api_health_v1; gateway e preço comercial pendentes.', serviceId: 'gxeon_api_health_v1' },
  { id: 'bounty-intelligence', name: 'GXEON Bounty Intelligence', price: '0,05', purpose: 'Analisar escopo, financiamento, custos e condições de aceite de uma tarefa.', reuse: 'Reutilizar o radar existente; endpoint comercial pendente.', serviceId: null },
] as const;

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function iso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
export function staleAt(value: string | null, now: number): boolean {
  return !value || Date.parse(value) > now + 60_000 || now - Date.parse(value) > RADAR_MAX_AGE_MS;
}
function text(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}
const providerHosts: Record<string, string[]> = {
  taskmarket: ['taskmarket.dev'], mergepay: ['github.com'], rustchain: ['github.com'],
  algora: ['github.com', 'algora.io'], bounty: ['trybounty.ai'],
};
export function safeSourceUrl(value: unknown, provider: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      providerHosts[provider]?.includes(u.hostname) ? u.href : null;
  } catch { return null; }
}
function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000_000_000 ? value : null;
}
function hash(value: unknown): string | null {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value) ? value : null;
}
export function normalizeUnifiedRadar(value: unknown, now = Date.now()): { source: RevenueSource; opportunities: RevenueOpportunity[] } {
  const data = record(value);
  const observedAt = iso(data?.fetchedAt);
  const source: RevenueSource = { id: 'unified', name: 'Radar GXEON existente', url: '/api/v1/radar', status: 'UNAVAILABLE', observedAt, count: null };
  if (!data || !Array.isArray(data.opportunities) || data.opportunities.length > 500 || !observedAt) return { source, opportunities: [] };
  const stale = staleAt(observedAt, now);
  const unique = new Map<string, RevenueOpportunity>();
  for (const raw of data.opportunities) {
    const row = record(raw);
    const provider = text(row?.provider, 40); const externalId = text(row?.externalId, 200);
    const title = text(row?.title, 500); const url = provider ? safeSourceUrl(row?.url, provider) : null;
    if (provider && !providerHosts[provider]) continue;
    if (!row || !provider || !externalId || !title || !url) return { source, opportunities: [] };
    const evidence = record(row.evidence); const escrow = record(evidence?.escrow);
    const fundingTx = hash(escrow?.transactionHash); const checkedAt = iso(escrow?.checkedAt);
    const funding = row.fundingStatus === 'ONCHAIN_VERIFIED' && escrow?.verified === true && fundingTx && checkedAt
      ? 'RADAR_ONCHAIN_EVIDENCE' : row.fundingStatus === 'PROVIDER_REPORTED' ? 'PROVIDER_REPORTED' : 'UNKNOWN';
    const deadline = iso(row.deadline);
    const costRequired = evidence?.initialCostRequired === true || evidence?.claimBondRequired === true ? true : null;
    const opportunity: RevenueOpportunity = {
      key: `${provider}:${externalId}`, provider, externalId, title, url,
      reward: amount(row.reward), currency: typeof row.currency === 'string' && /^[A-Z0-9]{2,12}$/.test(row.currency) ? row.currency : 'UNKNOWN',
      network: text(evidence?.network, 40), deadline, observedAt, stale, funding,
      fundingTx, fundingCheckedAt: checkedAt, sourceHash: typeof evidence?.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(evidence.sourceHash) ? evidence.sourceHash : null,
      claimStatus: ['AVAILABLE', 'CLAIMED_OR_CONFLICT'].includes(String(row.claimStatus)) ? String(row.claimStatus) : 'UNKNOWN',
      state: deadline && Date.parse(deadline) <= now ? 'EXPIRED' : costRequired ? 'BLOCKED_BY_COST' : 'UNDER_REVIEW',
      initialCostRequired: costRequired, eligibilityVerified: null,
    };
    // Conflicting duplicates fail closed rather than silently selecting a reward/evidence.
    const prior = unique.get(opportunity.key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(opportunity)) {
      return { source, opportunities: [] };
    }
    unique.set(opportunity.key, opportunity);
  }
  source.status = stale ? 'STALE' : 'AVAILABLE'; source.count = unique.size;
  return { source, opportunities: [...unique.values()] };
}
export function normalizeBaseBounty(value: unknown, now = Date.now()): { source: RevenueSource; opportunities: RevenueOpportunity[] } {
  const data = record(value); const observedAt = iso(data?.readAt);
  const source: RevenueSource = { id: 'basebounty', name: 'BaseBounty · leitura pública', url: BASE_BOUNTY_FEED, status: 'UNAVAILABLE', observedAt, count: null };
  if (!data || data.chainId !== 8453 || data.testnet !== false || !observedAt || !Array.isArray(data.bounties) || data.bounties.length > 500 || data.count !== data.bounties.length) return { source, opportunities: [] };
  const stale = staleAt(observedAt, now); const unique = new Map<string, RevenueOpportunity>();
  for (const raw of data.bounties) {
    const row = record(raw); const id = row?.jobId ?? row?.id;
    if (!row || !((typeof id === 'string' && /^\d{1,30}$/.test(id)) || (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0))) return { source, opportunities: [] };
    const key = `basebounty:${id}`;
    const opportunity: RevenueOpportunity = { key, provider: 'basebounty', externalId: String(id), title: text(row.title, 500) ?? `BaseBounty #${id}`, url: 'https://www.basebounty.app/', reward: null, currency: 'USDC', network: 'Base · 8453', deadline: iso(row.deadline), observedAt, stale,
      funding: 'UNKNOWN', fundingTx: null, fundingCheckedAt: null, sourceHash: null, claimStatus: 'UNKNOWN', state: 'BLOCKED_BY_COST', initialCostRequired: true, eligibilityVerified: null };
    // Schema of nonempty records requires qualification; never infer funding from adapter address.
    if (unique.has(key)) return { source, opportunities: [] };
    unique.set(key, opportunity);
  }
  source.status = stale ? 'STALE' : 'AVAILABLE'; source.count = unique.size;
  return { source, opportunities: [...unique.values()] };
}
export function reviewPack(row: RevenueOpportunity) {
  return { kind: 'CONTRACT_REVIEW_DRAFT', status: 'UNSENT', opportunityId: row.key, sourceUrl: row.url, observedAt: row.observedAt,
    advertisedReward: row.reward, currency: row.currency, network: row.network, fundingTx: row.fundingTx,
    fundingRevalidationRequired: true, eligibilityVerified: null, initialCostRequired: row.initialCostRequired,
    humanApprovalRequired: true, claimed: false, accepted: false, settled: false, revenue: null,
    requiredEvidence: ['canonical_scope', 'funding', 'zero_upfront_cost', 'eligibility', 'human_approval', 'implementation_and_tests', 'independent_acceptance', 'settlement', 'ledger_reconciliation'] };
}
export function parseSnapshot(value: unknown): RevenueSnapshot {
  const d = record(value);
  if (!d || d.mode !== 'READ_ONLY' || !iso(d.observedAt) || d.ledger !== 'AUTHENTICATED_RECONCILIATION_REQUIRED' || d.agenticTrade !== 'ACCOUNT_AND_PUBLICATION_NOT_VERIFIED' || !Array.isArray(d.sources) || d.sources.length !== 2 || !Array.isArray(d.opportunities) || d.opportunities.length > 1000) throw new Error('Resposta do bloco operacional inválida.');
  const ids = new Set<string>(); const keys = new Set<string>();
  if (!d.sources.every(raw => { const s = record(raw); if (!s || !['unified', 'basebounty'].includes(String(s.id)) || ids.has(String(s.id)) || !['AVAILABLE', 'STALE', 'UNAVAILABLE'].includes(String(s.status)) || !(s.observedAt === null || iso(s.observedAt)) || !(s.count === null || (Number.isSafeInteger(s.count) && Number(s.count) >= 0))) return false; ids.add(String(s.id)); return true; })) throw new Error('Estado das fontes inválido.');
  if (!d.opportunities.every(raw => {
    const r = record(raw); if (!r || typeof r.key !== 'string' || keys.has(r.key) || typeof r.title !== 'string' || typeof r.provider !== 'string' || typeof r.externalId !== 'string' || r.key !== `${r.provider}:${r.externalId}` || typeof r.stale !== 'boolean' || !(r.reward === null || amount(r.reward) !== null) || !['UNDER_REVIEW', 'BLOCKED_BY_COST', 'EXPIRED'].includes(String(r.state)) || !['RADAR_ONCHAIN_EVIDENCE', 'PROVIDER_REPORTED', 'UNKNOWN'].includes(String(r.funding)) || !(r.initialCostRequired === null || r.initialCostRequired === true) || r.eligibilityVerified !== null || !(r.deadline === null || iso(r.deadline)) || !(r.observedAt === null || iso(r.observedAt)) || !(r.fundingTx === null || hash(r.fundingTx)) || !(r.fundingCheckedAt === null || iso(r.fundingCheckedAt))) return false;
    if (typeof r.currency !== 'string' || !/^[A-Z0-9]{2,12}$/.test(r.currency) || !(r.network === null || (typeof r.network === 'string' && r.network.length <= 40)) || !(r.sourceHash === null || (typeof r.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(r.sourceHash))) || !['AVAILABLE', 'CLAIMED_OR_CONFLICT', 'UNKNOWN'].includes(String(r.claimStatus))) return false;
    if (r.funding === 'RADAR_ONCHAIN_EVIDENCE' && (!r.fundingTx || !r.fundingCheckedAt)) return false;
    if (r.provider === 'basebounty' ? r.url !== 'https://www.basebounty.app/' || r.state !== 'BLOCKED_BY_COST' || r.initialCostRequired !== true : !safeSourceUrl(r.url, r.provider)) return false;
    keys.add(r.key); return true;
  })) throw new Error('Evidências de oportunidades inválidas.');
  return value as RevenueSnapshot;
}
export function parseCatalog(value: unknown): CatalogService[] {
  const data = record(value); const ids = new Set<string>();
  if (!data || !Array.isArray(data.services) || data.services.length > 100 || !data.services.every(raw => {
    const s = record(raw); if (!s || typeof s.serviceId !== 'string' || !/^gxeon_[a-z0-9_]+$/.test(s.serviceId) || ids.has(s.serviceId) || typeof s.name !== 'string' || !Number.isFinite(s.unitPriceCredits) || Number(s.unitPriceCredits) < 0 || typeof s.status !== 'string') return false;
    ids.add(s.serviceId); return true;
  })) throw new Error('Catálogo de serviços indisponível.');
  return data.services as CatalogService[];
}
