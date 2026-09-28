import crypto from 'node:crypto';
import { EvidenceRecord } from './types.js';
import { getAgentEconomyStore } from './store.js';

export function hashObject(obj: unknown): string {
  const normalized = JSON.stringify(obj ?? null);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export interface CreateEvidenceParams {
  jobId: string;
  workerId: string;
  serviceVersion: string;
  input: unknown;
  result: unknown;
  executionStartedAt: string;
  executionCompletedAt: string;
  qaStatus: 'PASSED' | 'FAILED';
  billingSettlementId: string;
}

export async function createAndStoreEvidence(
  params: CreateEvidenceParams
): Promise<EvidenceRecord> {
  const evidenceId = `evi_${crypto.randomBytes(12).toString('hex')}`;
  const inputHash = hashObject(params.input);
  const resultHash = hashObject(params.result);

  const record: EvidenceRecord = {
    evidenceId,
    jobId: params.jobId,
    workerId: params.workerId,
    serviceVersion: params.serviceVersion,
    inputHash,
    resultHash,
    executionStartedAt: params.executionStartedAt,
    executionCompletedAt: params.executionCompletedAt,
    qaStatus: params.qaStatus,
    billingSettlementId: params.billingSettlementId,
  };

  const store = getAgentEconomyStore();
  await store.saveEvidence(record);

  return record;
}
