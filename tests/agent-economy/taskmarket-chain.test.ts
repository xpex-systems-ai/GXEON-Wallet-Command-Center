import { describe, it, expect, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type Hex } from 'viem';
import { TASKMARKET_CONTRACT, TASKMARKET_USDC } from '../../src/agent-economy/connectors/taskmarketConnector.js';
import { taskmarketAbi, verifyTaskFunding, verifyAwardSettlement, type ChainReader } from '../../src/agent-economy/taskmarket/chainEvidence.js';
import { TaskmarketSettlementWatcher } from '../../src/agent-economy/taskmarket/settlementWatcher.js';
import { TaskmarketConnector } from '../../src/agent-economy/connectors/taskmarketConnector.js';
import { FirestoreMarketplaceRepository } from '../../src/agent-economy/taskmarket/repository.js';
import { FirestoreRestClient } from '../../api/_firestoreRest.js';
import { taskFixture, taskId, txHash, worker, requester, MemoryMarketplaceRepository } from '../fixtures/taskmarket.js';

function createdLog() {
  return { address: TASKMARKET_CONTRACT,
    topics: encodeEventTopics({ abi: taskmarketAbi, eventName: 'TaskCreated', args: { taskId: taskId as Hex, requester: requester as Hex, mode: '0x00000001' } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'uint16' }], [10000000n, 4070908800n, false, 0]),
  };
}
function settlementLogs() {
  return [{ address: TASKMARKET_CONTRACT,
    topics: encodeEventTopics({ abi: taskmarketAbi, eventName: 'TaskCompleted', args: { taskId: taskId as Hex, requester: requester as Hex, worker: worker as Hex } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [9250000n, 750000n]),
  }, { address: TASKMARKET_USDC,
    topics: encodeEventTopics({ abi: taskmarketAbi, eventName: 'Transfer', args: { from: TASKMARKET_CONTRACT, to: worker as Hex } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [9250000n]),
  }];
}
function reader(logs = [createdLog()]) {
  return { getChainId: vi.fn(async () => 8453), getBlock: vi.fn(async () => ({ number: 100n })),
    getTransactionReceipt: vi.fn(async () => ({ status: 'success', blockNumber: 10n, logs })),
    readContract: vi.fn(async () => ({ id: taskId, requester, reward: 10000000n, expiryTime: 4070908800n, status: 0 })),
  };
}
const award = { workerAddress: worker, workerPayment: '9250000', grossAmount: '10000000', platformFee: '750000', settlementTxHash: txHash, settledAt: '2026-01-01T00:00:00Z' };
describe('Taskmarket escrow and settlement evidence', () => {
  it('checks finalized escrow plus current per-task contract state', async () => {
    const r = reader(); const result = await verifyTaskFunding(taskFixture(), r as unknown as ChainReader);
    expect(result.verified).toBe(true); expect(result.blockNumber).toBe('10');
    expect(r.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: TASKMARKET_CONTRACT, functionName: 'getTask' }));
  });
  it('rejects refunded/expired escrow, a changed amount, wrong task or chain', async () => {
    for (const change of [{ status: 6 }, { status: 1 }, { reward: 999n }, { id: `0x${'f'.repeat(64)}` }]) {
      const r = reader(); r.readContract.mockResolvedValue({ id: taskId, requester, reward: 10000000n, expiryTime: 4070908800n, status: 0, ...change });
      expect((await verifyTaskFunding(taskFixture(), r as unknown as ChainReader)).verified).toBe(false);
    }
    const r = reader(); r.getChainId.mockResolvedValue(1);
    expect((await verifyTaskFunding(taskFixture(), r as unknown as ChainReader)).reason).toBe('CHAIN_MISMATCH');
  });
  it('does not leak RPC credentials in errors', async () => {
    const r = reader(); r.getChainId.mockRejectedValue(new Error('https://rpc.invalid/?apiKey=sensitive'));
    const result = await verifyTaskFunding(taskFixture(), r as unknown as ChainReader);
    expect(JSON.stringify(result)).not.toContain('sensitive'); expect(result.reason).toBe('RPC_VERIFICATION_UNAVAILABLE');
  });
  it('requires worker, amount, correct USDC contract and TaskCompleted event', async () => {
    const t = taskFixture({ status: 'completed' });
    const r = reader(settlementLogs());
    expect((await verifyAwardSettlement(t, award, worker, r as unknown as ChainReader))?.amountBaseUnits).toBe('9250000');
    expect(await verifyAwardSettlement(t, award, requester, r as unknown as ChainReader)).toBeNull();
    expect(await verifyAwardSettlement(t, { ...award, workerPayment: '9250001' }, worker, r as unknown as ChainReader)).toBeNull();
    const wrongToken = settlementLogs(); wrongToken[1].address = worker;
    expect(await verifyAwardSettlement(t, award, worker, reader(wrongToken) as unknown as ChainReader)).toBeNull();
    const wrongSender = settlementLogs();
    wrongSender[1].topics = encodeEventTopics({ abi: taskmarketAbi, eventName: 'Transfer', args: { from: requester as Hex, to: worker as Hex } });
    expect(await verifyAwardSettlement(t, award, worker, reader(wrongSender) as unknown as ChainReader)).toBeNull();
    expect(await verifyAwardSettlement(t, award, worker, reader(settlementLogs().slice(1)) as unknown as ChainReader)).toBeNull();
  });
  it('rejects pending confirmations or reverted settlement receipts', async () => {
    const t = taskFixture({ status: 'completed' }); const r = reader(settlementLogs());
    r.getBlock.mockResolvedValue({ number: 9n });
    expect(await verifyAwardSettlement(t, award, worker, r as unknown as ChainReader)).toBeNull();
    r.getBlock.mockResolvedValue({ number: 100n }); r.getTransactionReceipt.mockResolvedValue({ status: 'reverted', blockNumber: 10n, logs: settlementLogs() });
    expect(await verifyAwardSettlement(t, award, worker, r as unknown as ChainReader)).toBeNull();
  });
  it('reconciles the same settlement twice without duplicate revenue', async () => {
    const t = taskFixture({ status: 'completed', awards: [award] });
    const r = reader(settlementLogs()); const repository = new MemoryMarketplaceRepository();
    await repository.createMission({ missionId: `taskmarket:${taskId}`, provider: 'taskmarket', taskId, sourceHash: 'hash', state: 'SUBMITTED', updatedAt: '2026-01-01T00:00:00Z' });
    const c = new TaskmarketConnector(); vi.spyOn(c, 'getTask').mockResolvedValue(t);
    const watcher = new TaskmarketSettlementWatcher(c, repository, (task, a, w) => verifyAwardSettlement(task, a, w, r as unknown as ChainReader));
    expect(await watcher.reconcile(worker)).toBe(1); expect(await watcher.reconcile(worker)).toBe(0);
    expect(repository.settlements.size).toBe(1); expect((await repository.getMission(taskId))?.state).toBe('PAID');
    const db = new FirestoreRestClient(); const commit = vi.spyOn(db, 'atomicCommit').mockResolvedValueOnce('COMMITTED').mockResolvedValueOnce('ALREADY_EXISTS');
    const firestore = new FirestoreMarketplaceRepository(db); const evidence = [...repository.settlements.values()][0];
    expect(await firestore.recordSettlement(evidence)).toBe(true); expect(await firestore.recordSettlement(evidence)).toBe(false);
    expect(commit.mock.calls[0][0]).toHaveLength(2);
    expect(commit.mock.calls[0][0].every(w => (w.currentDocument as { exists: boolean }).exists === false)).toBe(true);
  });
});
