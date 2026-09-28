import crypto from 'node:crypto';
import {
  Job,
  JobResult,
} from './types.js';
import { getService } from './services/registry.js';
import { getAgentEconomyStore } from './store.js';
import { settleCredits, releaseCredits } from './ledger.js';
import { validateExecutionWithQaAgent } from './qaAgent.js';
import { createAndStoreEvidence } from './evidenceAgent.js';
import {
  executeUrlVerifyWorker,
  UrlVerifyInput,
} from './workers/urlVerifyWorker.js';
import {
  executeJsonValidateWorker,
  JsonValidateInput,
} from './workers/jsonValidateWorker.js';
import {
  executeApiHealthWorker,
  ApiHealthInput,
} from './workers/apiHealthWorker.js';

export interface ExecuteJobResult {
  job: Job;
  result?: JobResult;
  error?: string;
}

export class GxeonCommander {
  /**
   * Dispatches and orchestrates an accepted job across its lifecycle:
   * QUEUED -> RESOURCES_RESERVED -> EXECUTING -> VALIDATING -> COMPLETED / FAILED
   */
  async processJob(jobId: string): Promise<ExecuteJobResult> {
    const store = getAgentEconomyStore();
    const job = await store.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const service = getService(job.serviceId);
    if (!service) {
      job.state = 'FAILED';
      job.failedReason = `Unknown service ${job.serviceId}`;
      await store.saveJob(job);
      return { job, error: job.failedReason };
    }

    const quote = await store.getQuote(job.quoteId);
    if (!quote) {
      job.state = 'FAILED';
      job.failedReason = `Missing quote ${job.quoteId}`;
      await store.saveJob(job);
      return { job, error: job.failedReason };
    }

    // 1. Select and acquire durable exclusive lease on an ONLINE worker
    const workers = await store.listWorkers();
    const eligibleWorker = workers.find(
      (w) => w.status === 'ONLINE' && w.capabilities.includes(service.serviceId)
    );

    if (!eligibleWorker) {
      job.state = 'FAILED';
      job.failedReason = `No online workers available for service ${service.serviceId}`;
      await releaseCredits(job.accountId, quote.totalCredits, job.jobId, quote.quoteId);
      job.financialState = 'CREDITS_RELEASED';
      await store.saveJob(job);
      await store.updateOutboxStatus(`out_${job.jobId}`, 'FAILED');
      return { job, error: job.failedReason };
    }

    // Acquire exclusive lease with 60s timeout and fencing token
    const lease = await store.acquireWorkerLease(eligibleWorker.workerId, job.jobId, 60_000);
    if (!lease) {
      // Concurrency lock: another worker has already acquired this job
      return { job, error: 'Job is already exclusively leased by another active worker instance' };
    }

    try {
      job.workerId = eligibleWorker.workerId;
      job.state = 'RESOURCES_RESERVED';
      await store.saveJob(job);

      // Update worker load
      eligibleWorker.currentLoad++;
      await store.saveWorker(eligibleWorker);

      // 2. EXECUTING
      job.state = 'EXECUTING';
      const executionStartedAt = new Date().toISOString();
      job.startedAt = executionStartedAt;
      await store.saveJob(job);

      const startTime = Date.now();
      let rawOutput: unknown = null;
      let executionError: Error | null = null;

      try {
        if (service.serviceId === 'gxeon_url_verify_v1') {
          rawOutput = await executeUrlVerifyWorker(job.input as unknown as UrlVerifyInput);
        } else if (service.serviceId === 'gxeon_json_validate_v1') {
          rawOutput = executeJsonValidateWorker(job.input as unknown as JsonValidateInput);
        } else if (service.serviceId === 'gxeon_api_health_v1') {
          rawOutput = await executeApiHealthWorker(job.input as unknown as ApiHealthInput);
        } else {
          throw new Error(`Capability router: no execution runner for ${service.serviceId}`);
        }
      } catch (err: unknown) {
        executionError = err instanceof Error ? err : new Error(String(err));
      }

      const executionCompletedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      // Decrement worker load and update metrics
      eligibleWorker.currentLoad = Math.max(0, eligibleWorker.currentLoad - 1);
      eligibleWorker.averageLatencyMs = Math.round(
        (eligibleWorker.averageLatencyMs + durationMs) / 2
      );

      // 3. VALIDATING via QA Agent
      job.state = 'VALIDATING';
      await store.saveJob(job);

      if (executionError) {
        job.state = 'FAILED';
        job.failedReason = `Worker execution error: ${executionError.message}`;
        job.completedAt = executionCompletedAt;

        // System failure: release reserved credits
        await releaseCredits(job.accountId, quote.totalCredits, job.jobId, quote.quoteId);
        job.financialState = 'CREDITS_RELEASED';

        eligibleWorker.successRate = Math.max(0.1, eligibleWorker.successRate - 0.05);
        await store.saveWorker(eligibleWorker);
        await store.saveJob(job);
        await store.updateOutboxStatus(`out_${job.jobId}`, 'FAILED');

        return { job, error: job.failedReason };
      }

      const qaResult = validateExecutionWithQaAgent(job, service, rawOutput, durationMs);
      const qaStatus = qaResult.passed ? 'PASSED' : 'FAILED';

      if (!qaResult.passed) {
        job.state = 'FAILED';
        job.failedReason = `QA Validation Failed: ${qaResult.errors.join('; ')}`;
        job.completedAt = executionCompletedAt;

        await releaseCredits(job.accountId, quote.totalCredits, job.jobId, quote.quoteId);
        job.financialState = 'CREDITS_RELEASED';

        eligibleWorker.successRate = Math.max(0.1, eligibleWorker.successRate - 0.05);
        await store.saveWorker(eligibleWorker);
        await store.saveJob(job);
        await store.updateOutboxStatus(`out_${job.jobId}`, 'FAILED');

        return { job, error: job.failedReason };
      }

      // 4. Settle Credits and Append Evidence
      const settlementId = `stl_${crypto.randomBytes(8).toString('hex')}`;
      await settleCredits(job.accountId, quote.totalCredits, job.jobId, quote.quoteId);
      job.financialState = 'CREDITS_SETTLED';

      const evidence = await createAndStoreEvidence({
        jobId: job.jobId,
        workerId: eligibleWorker.workerId,
        serviceVersion: service.version,
        input: job.input,
        result: rawOutput,
        executionStartedAt,
        executionCompletedAt,
        qaStatus,
        billingSettlementId: settlementId,
      });

      job.evidenceRecordId = evidence.evidenceId;
      job.state = 'COMPLETED';
      job.completedAt = executionCompletedAt;
      await store.saveJob(job);

      // 5. Store Final Job Result
      const outObj = rawOutput as Record<string, unknown>;
      const summary = (outObj.summary as { total: number; healthy: number; failed: number }) || {
        total: 1,
        healthy: 1,
        failed: 0,
      };
      const resultsList = Array.isArray(outObj.results) ? outObj.results : [rawOutput];

      const finalResult: JobResult = {
        jobId: job.jobId,
        serviceId: service.serviceId,
        state: 'COMPLETED',
        summary,
        results: resultsList,
        completedAt: executionCompletedAt,
      };

      await store.saveJobResult(finalResult);
      await store.updateOutboxStatus(`out_${job.jobId}`, 'COMPLETED');

      eligibleWorker.successRate = Math.min(1.0, eligibleWorker.successRate + 0.01);
      await store.saveWorker(eligibleWorker);

      return { job, result: finalResult };
    } finally {
      await store.releaseWorkerLease(job.jobId, lease.fencingToken);
    }
  }
}

let commanderInstance: GxeonCommander | null = null;

export function getGxeonCommander(): GxeonCommander {
  if (!commanderInstance) {
    commanderInstance = new GxeonCommander();
  }
  return commanderInstance;
}
