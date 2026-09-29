import { createPublicClient, decodeEventLog, http, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';
import { TASKMARKET_CONTRACT, TASKMARKET_USDC, usdc } from '../connectors/taskmarketConnector.js';
import type { FundingEvidence, TaskmarketAward, TaskmarketSettlement, TaskmarketTask } from './types.js';

// Canonical ITMPCore.sol at daydreamsai/taskmarket-contracts@3eaa4e79fa20c640efb88675b3c40cd490526b7a.
export const taskmarketAbi = parseAbi([
  'event TaskCreated(bytes32 indexed taskId, address indexed requester, uint256 reward, bytes4 indexed mode, uint256 expiryTime, bool stakeRequired, uint16 stakeBps)',
  'event TaskCompleted(bytes32 indexed taskId, address indexed requester, address indexed worker, uint256 workerPayment, uint256 platformFee)',
  'function getTask(bytes32 taskId) view returns ((bytes32 id, address requester, address worker, uint8 status, bytes4 mode, uint256 reward, uint256 expiryTime, uint256 stakeAmount, uint16 feeBps, bytes32 deliverable, uint8 rating, address hookContract, bool stakeRequired, uint16 stakeBps))',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
export function baseReader() {
  return createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', { timeout: 8000, retryCount: 0 }) });
}
export type ChainReader = ReturnType<typeof baseReader>;

export async function verifyTaskFunding(task: TaskmarketTask, reader: ChainReader = baseReader()): Promise<FundingEvidence> {
  const evidence: FundingEvidence = { verified: false, status: 'UNVERIFIED', transactionHash: task.escrowTxHash,
    blockNumber: null, checkedAt: new Date().toISOString(), reason: null };
  try {
    if (await reader.getChainId() !== 8453) throw new Error('CHAIN_MISMATCH');
    const [receipt, finalized, current] = await Promise.all([
      reader.getTransactionReceipt({ hash: task.escrowTxHash as Hex }),
      reader.getBlock({ blockTag: 'finalized' }),
      reader.readContract({ address: TASKMARKET_CONTRACT, abi: taskmarketAbi, functionName: 'getTask', args: [task.id as Hex] }),
    ]);
    if (receipt.status !== 'success' || receipt.blockNumber > finalized.number) throw new Error('ESCROW_NOT_FINAL');
    if (!eq(current.id, task.id) || !eq(current.requester, task.requester) || current.reward !== BigInt(task.reward) ||
      current.expiryTime <= BigInt(Math.floor(Date.now() / 1000)) || [4, 5, 6].includes(current.status) ||
      (task.status === 'open' && current.status !== 0)) throw new Error('ESCROW_STATE_MISMATCH');
    const created = receipt.logs.some(log => {
      if (!eq(log.address, TASKMARKET_CONTRACT)) return false;
      try {
        const e = decodeEventLog({ abi: taskmarketAbi, eventName: 'TaskCreated', data: log.data, topics: log.topics });
        return eq(e.args.taskId, task.id) && eq(e.args.requester, task.requester) && e.args.reward > 0n;
      } catch { return false; }
    });
    if (!created) throw new Error('TASK_CREATED_EVENT_MISSING');
    return { ...evidence, verified: true, status: 'ONCHAIN_VERIFIED', blockNumber: receipt.blockNumber.toString() };
  } catch (error) {
    // RPC URLs may carry API credentials. Never serialize an RPC exception or request.
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RPC_VERIFICATION_UNAVAILABLE';
    return { ...evidence, reason: code };
  }
}

export async function verifyAwardSettlement(task: TaskmarketTask, award: TaskmarketAward, worker: string, reader: ChainReader = baseReader()): Promise<TaskmarketSettlement | null> {
  if (task.status !== 'completed' || !eq(award.workerAddress, worker) || BigInt(award.workerPayment) <= 0n) return null;
  try {
    if (await reader.getChainId() !== 8453) return null;
    const [receipt, finalized] = await Promise.all([
      reader.getTransactionReceipt({ hash: award.settlementTxHash as Hex }), reader.getBlock({ blockTag: 'finalized' }),
    ]);
    if (receipt.status !== 'success' || receipt.blockNumber > finalized.number) return null;
    const completed = receipt.logs.some(log => {
      if (!eq(log.address, TASKMARKET_CONTRACT)) return false;
      try {
        const e = decodeEventLog({ abi: taskmarketAbi, eventName: 'TaskCompleted', data: log.data, topics: log.topics });
        return eq(e.args.taskId, task.id) && eq(e.args.requester, task.requester) && eq(e.args.worker, worker) &&
          e.args.workerPayment === BigInt(award.workerPayment) && e.args.platformFee === BigInt(award.platformFee);
      } catch { return false; }
    });
    const transferred = receipt.logs.some(log => {
      if (!eq(log.address, TASKMARKET_USDC)) return false;
      try {
        const e = decodeEventLog({ abi: taskmarketAbi, eventName: 'Transfer', data: log.data, topics: log.topics });
        return eq(e.args.from, TASKMARKET_CONTRACT) && eq(e.args.to, worker) && e.args.value === BigInt(award.workerPayment);
      } catch { return false; }
    });
    if (!completed || !transferred) return null;
    return { id: `taskmarket:${award.settlementTxHash.toLowerCase()}:${task.id.toLowerCase()}:${worker.toLowerCase()}`,
      provider: 'taskmarket', taskId: task.id, amountBaseUnits: award.workerPayment, amountUsdc: usdc(award.workerPayment),
      currency: 'USDC', network: 'eip155:8453', workerAddress: worker, transactionHash: award.settlementTxHash,
      blockNumber: receipt.blockNumber.toString(), settledAt: award.settledAt, status: 'PAID', verified: true };
  } catch { return null; }
}
