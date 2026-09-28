import { listAvailableServices } from './services/registry.js';
import { createQuote } from './quoteEngine.js';
import { reserveCredits, getAccountBalance } from './ledger.js';
import { getGxeonCommander } from './commander.js';
import { getAgentEconomyStore } from './store.js';
import { Job } from './types.js';
import crypto from 'node:crypto';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export async function handleMcpRpc(
  req: JsonRpcRequest,
  accountId: string
): Promise<JsonRpcResponse> {
  const { id, method, params = {} } = req;
  const store = getAgentEconomyStore();

  try {
    switch (method) {
      case 'tools/list':
      case 'gxeon.list_services': {
        const services = listAvailableServices();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: services.map((s) => ({
              name: s.serviceId,
              description: s.description,
              inputSchema: s.inputSchema,
              unitPriceCredits: s.unitPriceCredits,
            })),
            services,
          },
        };
      }

      case 'gxeon.get_quote': {
        const { serviceId, quantity } = params as { serviceId: string; quantity: number };
        const quoteRes = await createQuote({
          accountId,
          serviceId,
          quantity: Number(quantity),
        });

        if (!quoteRes.success || !quoteRes.quote) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: quoteRes.message || 'Failed to create quote',
              data: { errorCode: quoteRes.errorCode },
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: quoteRes.quote,
        };
      }

      case 'gxeon.submit_job': {
        const { quoteId, input } = params as {
          quoteId: string;
          input: Record<string, unknown>;
        };

        const quote = await store.getQuote(quoteId);
        if (!quote || quote.accountId !== accountId) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Invalid quote or quote belongs to another account',
            },
          };
        }

        const reserveRes = await reserveCredits(
          accountId,
          quote.totalCredits,
          `pending_${Date.now()}`,
          quote.quoteId
        );

        if (!reserveRes.success) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32000,
              message: 'Insufficient credits',
              data: reserveRes.error,
            },
          };
        }

        const jobId = `job_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const now = new Date().toISOString();

        const job: Job = {
          jobId,
          accountId,
          serviceId: quote.serviceId,
          quoteId: quote.quoteId,
          state: 'QUEUED',
          financialState: 'CREDITS_RESERVED',
          input,
          createdAt: now,
          updatedAt: now,
        };

        await store.saveJob(job);

        // Execute in background
        const commander = getGxeonCommander();
        commander.processJob(jobId).catch((err) => {
          console.error(`[COMMANDER ERROR] Job ${jobId} failed:`, err);
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            jobId,
            state: 'QUEUED',
            totalCreditsReserved: quote.totalCredits,
          },
        };
      }

      case 'gxeon.get_job': {
        const { jobId } = params as { jobId: string };
        const job = await store.getJob(jobId);
        if (!job || job.accountId !== accountId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Job not found' },
          };
        }
        return { jsonrpc: '2.0', id, result: job };
      }

      case 'gxeon.get_result': {
        const { jobId } = params as { jobId: string };
        const job = await store.getJob(jobId);
        if (!job || job.accountId !== accountId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Job not found' },
          };
        }

        const result = await store.getJobResult(jobId);
        if (!result) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              jobId,
              state: job.state,
              message: 'Result not ready yet',
            },
          };
        }

        return { jsonrpc: '2.0', id, result };
      }

      case 'gxeon.get_balance': {
        const balance = await getAccountBalance(accountId);
        if (!balance) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Account balance not found' },
          };
        }
        return { jsonrpc: '2.0', id, result: balance };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal JSON-RPC error: ${msg}`,
      },
    };
  }
}
