import { taskmarketConnector, taskmarketWritesEnabled } from '../connectors/taskmarketConnector.js';
import { verifyTaskFunding } from './chainEvidence.js';
import { TaskmarketExecutionAdapter, assertNoSecretMaterial } from './executionAdapter.js';
import { previewAction, qualifyTask } from './qualification.js';
import { marketplaceRepository } from './repository.js';
import { readTaskmarketStatus } from './taskmarketRadar.js';
import type { TaskmarketAction } from './types.js';

const reads = ['integration_status', 'network_status', 'legal_status', 'identity_status', 'worker_stats', 'list_open'];
const scoped = ['get_task', 'qualify_task', 'action_preview', 'submit_preview'];
const writes = ['claim', 'pitch', 'bid', 'submit'];
export const TASKMARKET_MCP_TOOLS = [...reads, ...scoped, ...writes].map(name => ({
  name: `taskmarket_${name}`, description: writes.includes(name) ? 'Gated Taskmarket action: disabled by default; requires official local CLI and explicit signature approval.' : 'Read LIVE Taskmarket facts or prepare an action without signing, accepting terms, or spending.',
  annotations: { readOnlyHint: !writes.includes(name), destructiveHint: writes.includes(name), openWorldHint: true },
  inputSchema: { type: 'object', properties: {
    ...(!reads.includes(name) ? { taskId: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' } } : {}),
    ...(name === 'action_preview' ? { action: { type: 'string', enum: writes } } : {}),
  }, required: reads.includes(name) ? [] : name === 'action_preview' ? ['taskId', 'action'] : ['taskId'], additionalProperties: false },
}));

export async function callTaskmarketTool(name: string, args: Record<string, unknown>) {
  if (!TASKMARKET_MCP_TOOLS.some(t => t.name === name)) throw new Error('TASKMARKET_UNKNOWN_TOOL');
  assertNoSecretMaterial(args);
  const action = name.slice('taskmarket_'.length);
  if (writes.includes(action)) {
    if (!taskmarketWritesEnabled()) throw new Error('TASKMARKET_WRITES_DISABLED');
    throw new Error('HUMAN_APPROVAL_REQUIRED: wallet signatures and paid actions must use the official local CLI; no key or signature material is accepted by this app.');
  }
  const connector = taskmarketConnector;
  if (action === 'integration_status') return readTaskmarketStatus();
  if (action === 'network_status') return connector.getTaskmarketNetwork();
  if (action === 'legal_status') return connector.getTaskmarketLegalCurrent();
  if (action === 'identity_status' || action === 'worker_stats') return connector.getWorkerStatus(process.env.GXEON_TASKMARKET_WORKER_ADDRESS);
  if (action === 'list_open') {
    await connector.getTaskmarketNetwork(); await connector.getTaskmarketLegalCurrent();
    return connector.listOpenTasks();
  }
  const taskId = String(args.taskId || '');
  if (action === 'get_task') return connector.getTask(taskId);
  if (action === 'submit_preview') return new TaskmarketExecutionAdapter(connector, marketplaceRepository()).submitPreview(taskId);
  const task = await connector.getTask(taskId);
  const [network, legal, requester, identity, funding] = await Promise.all([
    connector.getTaskmarketNetwork(), connector.getTaskmarketLegalCurrent(), connector.getRequesterStats(task.requester),
    connector.getWorkerStatus(process.env.GXEON_TASKMARKET_WORKER_ADDRESS), verifyTaskFunding(task),
  ]);
  if (!network.verified) throw new Error('TASKMARKET_NETWORK_MISMATCH');
  let assessment = null;
  try { assessment = await marketplaceRepository().getAssessment(taskId); } catch { /* No stored assessment means no automatic qualification. */ }
  const opportunity = qualifyTask(task, { funding, legal, requester, identity, assessment });
  if (action === 'qualify_task') return opportunity;
  if (!writes.includes(String(args.action))) throw new Error('TASKMARKET_INVALID_ACTION');
  return previewAction(task, args.action as TaskmarketAction, opportunity, identity.walletAddress);
}
