import { getAgentBountiesReadOnlyFeed } from '../src/agent-economy/connectors/agentBountiesReadOnly.js';
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({error:'METHOD_NOT_ALLOWED'}); return; }
  const result = await getAgentBountiesReadOnlyFeed();
  res.status(result.status === 'UNAVAILABLE' ? 503 : 200).json(result);
}
