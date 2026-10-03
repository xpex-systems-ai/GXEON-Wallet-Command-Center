import { describe, expect, it } from 'vitest';
import { executeCsvAuditWorker } from '../../src/agent-economy/workers/csvAuditWorker.js';
import { getService } from '../../src/agent-economy/services/registry.js';
import { MemoryAgentEconomyStore } from '../../src/agent-economy/store.js';
import { validateExecutionWithQaAgent } from '../../src/agent-economy/qaAgent.js';
import type { Job } from '../../src/agent-economy/types.js';

describe('GXEON CSV Audit', () => {
  it('audits a clean quoted CSV in the zero-network worker', () => {
    const output = executeCsvAuditWorker({
      csv: 'name,city\n"Ana","Brasília"\n"João","Goiânia"',
    });

    expect(output.qualityPass).toBe(true);
    expect(output.results[0].rowCount).toBe(3);
    expect(output.results[0].dataRowCount).toBe(2);
    expect(output.results[0].columnCount).toBe(2);
    expect(output.results[0].emptyCells).toBe(0);
  });

  it('reports data-quality problems without failing execution', () => {
    const output = executeCsvAuditWorker({
      csv: 'id,name,name\n1,Ana,Ana\n1,Ana,Ana\n2,,Bia\n3,Caio',
    });

    expect(output.qualityPass).toBe(false);
    expect(output.results[0].duplicateHeaders).toContain('name');
    expect(output.results[0].duplicateRows).toEqual([{ line: 3, firstLine: 2 }]);
    expect(output.results[0].emptyCells).toBe(1);
    expect(output.results[0].unevenRows).toEqual([{ line: 5, columns: 2, expected: 3 }]);
  });

  it('is registered at 2 credits and has an online built-in worker', async () => {
    const service = getService('gxeon_csv_audit_v1');
    expect(service?.unitPriceCredits).toBe(2);
    expect(service?.executionPolicy).toBe('ZERO_NETWORK_SANDBOX');

    const store = new MemoryAgentEconomyStore();
    const workers = await store.listWorkers();
    expect(workers.some((worker) => worker.capabilities.includes('gxeon_csv_audit_v1'))).toBe(true);
  });

  it('passes QA when the audit worker returns the required result shape', () => {
    const service = getService('gxeon_csv_audit_v1')!;
    const input = { csv: 'a,b\n1,2' };
    const output = executeCsvAuditWorker(input);
    const job = {
      jobId: 'job_csv_test',
      accountId: 'acct_test',
      serviceId: service.serviceId,
      quoteId: 'quote_test',
      state: 'VALIDATING',
      financialState: 'CREDITS_RESERVED',
      input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Job;

    expect(validateExecutionWithQaAgent(job, service, output, 1).passed).toBe(true);
  });
});
