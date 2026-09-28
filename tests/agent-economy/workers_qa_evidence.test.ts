import { describe, it, expect, beforeEach } from 'vitest';
import { executeJsonValidateWorker } from '../../src/agent-economy/workers/jsonValidateWorker.js';
import { validateExecutionWithQaAgent } from '../../src/agent-economy/qaAgent.js';
import { createAndStoreEvidence } from '../../src/agent-economy/evidenceAgent.js';
import {
  getAgentEconomyStore,
  resetAgentEconomyStoreForTesting,
} from '../../src/agent-economy/store.js';
import { getService } from '../../src/agent-economy/services/registry.js';
import { Job } from '../../src/agent-economy/types.js';

describe('GXEON Capability Workers, QA & Evidence Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
  });

  describe('JSON Validate Worker (gxeon_json_validate_v1)', () => {
    it('validates syntax and schema conformance with zero network footprint', () => {
      // 1. Valid JSON payload matching schema
      const res1 = executeJsonValidateWorker({
        payload: JSON.stringify({ name: 'GXEON', version: 1, active: true }),
        schema: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string' },
            version: { type: 'number' },
          },
        },
      });
      expect(res1.valid).toBe(true);
      expect(res1.errors.length).toBe(0);
      expect(res1.details.parsedType).toBe('object');

      // 2. Syntax error
      const res2 = executeJsonValidateWorker({
        payload: '{ name: invalid_json }',
      });
      expect(res2.valid).toBe(false);
      expect(res2.errors[0]).toContain('Invalid JSON syntax');

      // 3. Schema missing required field
      const res3 = executeJsonValidateWorker({
        payload: { name: 'Test' },
        schema: {
          type: 'object',
          required: ['missingField'],
        },
      });
      expect(res3.valid).toBe(false);
      expect(res3.errors[0]).toContain("Missing required field: 'missingField'");
    });
  });

  describe('QA Agent (GXEON_QA_AGENT)', () => {
    it('approves complete, compliant outputs and rejects incomplete/insecure results', () => {
      const service = getService('gxeon_url_verify_v1')!;
      const job: Job = {
        jobId: 'job_qa_test',
        accountId: 'acc_qa',
        serviceId: 'gxeon_url_verify_v1',
        quoteId: 'quo_qa',
        state: 'VALIDATING',
        financialState: 'CREDITS_RESERVED',
        input: { urls: ['https://example.com', 'https://example.org'] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Compliant output (2 inputs -> 2 outputs)
      const validOutput = {
        results: [
          { url: 'https://example.com', finalUrl: 'https://example.com', reachable: true },
          { url: 'https://example.org', finalUrl: 'https://example.org', reachable: true },
        ],
        summary: { total: 2, healthy: 2, failed: 0 },
      };
      const qaOk = validateExecutionWithQaAgent(job, service, validOutput, 250);
      expect(qaOk.passed).toBe(true);
      expect(qaOk.errors.length).toBe(0);

      // 2. Incomplete output (missing 1 URL)
      const incompleteOutput = {
        results: [{ url: 'https://example.com', finalUrl: 'https://example.com' }],
      };
      const qaIncomplete = validateExecutionWithQaAgent(job, service, incompleteOutput, 250);
      expect(qaIncomplete.passed).toBe(false);
      expect(qaIncomplete.errors.some((e) => e.includes('does not match output count'))).toBe(true);

      // 3. Prohibited IP leakage
      const leakedOutput = {
        results: [
          { url: 'https://example.com', finalUrl: 'http://169.254.169.254/latest' },
          { url: 'https://example.org', finalUrl: 'https://example.org' },
        ],
      };
      const qaLeaked = validateExecutionWithQaAgent(job, service, leakedOutput, 250);
      expect(qaLeaked.passed).toBe(false);
      expect(qaLeaked.errors.some((e) => e.includes('Contacted prohibited address'))).toBe(true);
    });
  });

  describe('Evidence Agent (GXEON_EVIDENCE_AGENT)', () => {
    it('creates immutable cryptographic evidence records with input/output hashes', async () => {
      const store = getAgentEconomyStore();
      const input = { urls: ['https://example.com'] };
      const output = { results: [{ url: 'https://example.com', reachable: true }] };

      const evidence = await createAndStoreEvidence({
        jobId: 'job_ev_01',
        workerId: 'worker_url_01',
        serviceVersion: '1.0.0',
        input,
        result: output,
        executionStartedAt: new Date().toISOString(),
        executionCompletedAt: new Date().toISOString(),
        qaStatus: 'PASSED',
        billingSettlementId: 'stl_12345',
      });

      expect(evidence.evidenceId.startsWith('evi_')).toBe(true);
      expect(evidence.inputHash).toBeDefined();
      expect(evidence.resultHash).toBeDefined();
      expect(evidence.qaStatus).toBe('PASSED');

      const retrieved = await store.getEvidence('job_ev_01');
      expect(retrieved?.evidenceId).toBe(evidence.evidenceId);
      expect(retrieved?.inputHash).toBe(evidence.inputHash);
    });
  });
});
