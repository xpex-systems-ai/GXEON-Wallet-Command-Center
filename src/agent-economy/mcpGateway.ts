import { listAvailableServices } from './services/registry.js';
import { createQuote } from './quoteEngine.js';
import { getAccountBalance } from './ledger.js';
import { getAgentEconomyStore } from './store.js';
import { submitJobAdmission } from './admissionService.js';
import { executeJsonValidateWorker } from './workers/jsonValidateWorker.js';
import { executeUrlVerifyWorker } from './workers/urlVerifyWorker.js';

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

const MCP_TOOLS = [
  {
    name: 'list_services',
    description: 'List all active GXEON capability services, pricing models, and input schemas',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_quote',
    description: 'Obtain a signed price quote for requested service units before execution',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'ID of the capability service' },
        quantity: { type: 'integer', minimum: 1, description: 'Number of units' },
      },
      required: ['serviceId', 'quantity'],
    },
  },
  {
    name: 'submit_job',
    description: 'Submit a job to be executed against an active quote, reserving credits and running validation',
    inputSchema: {
      type: 'object',
      properties: {
        quoteId: { type: 'string', description: 'The accepted quoteId' },
        input: { type: 'object', description: 'Input payload matching service inputSchema' },
        idempotencyKey: { type: 'string', description: 'Optional unique idempotency key' },
      },
      required: ['quoteId', 'input'],
    },
  },
  {
    name: 'get_job',
    description: 'Check status and lifecycle state of a submitted job',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'get_result',
    description: 'Retrieve structured results, summary, and cryptographic QA evidence for a completed job',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'get_balance',
    description: 'Retrieve current credit balance, reserved credits, and available funds for the account',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'gxeon_json_validate_v1',
    description: 'Validate and lint JSON payloads. Price: 0.01 USDC or 2 credits per payload.',
    serviceId: 'gxeon_json_validate_v1',
    priceUsdc: 0.01,
    network: 'eip155:8453',
    paymentProtocol: 'x402',
    endpoint: '/x402/json-validate',
    outputSchema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        parsed: { type: 'object' },
        error: { type: 'string' },
      },
    },
    metadata: {
      serviceId: 'gxeon_json_validate_v1',
      version: '1.0.0',
      priceUsdc: 0.01,
      network: 'eip155:8453',
      paymentProtocol: 'x402',
      endpoint: '/x402/json-validate',
      pricing: { credits: 2, usdc: 0.01, atomic: '10000' },
      paymentRails: ['prepaid_credits', 'x402'],
      executionLimits: { timeoutMs: 5000 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        rawJson: { type: 'string', description: 'Raw JSON string to validate' },
      },
      required: ['rawJson'],
    },
  },
  {
    name: 'gxeon_url_verify_v1',
    description: 'Perform URL health checks, status verification, and TLS validation. Price: 0.025 USDC or 5 credits per URL.',
    serviceId: 'gxeon_url_verify_v1',
    priceUsdc: 0.025,
    network: 'eip155:8453',
    paymentProtocol: 'x402',
    endpoint: '/x402/url-verify',
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'object' },
        results: { type: 'array' },
      },
    },
    metadata: {
      serviceId: 'gxeon_url_verify_v1',
      version: '1.0.0',
      priceUsdc: 0.025,
      network: 'eip155:8453',
      paymentProtocol: 'x402',
      endpoint: '/x402/url-verify',
      pricing: { credits: 5, usdc: 0.025, atomic: '25000' },
      paymentRails: ['prepaid_credits', 'x402'],
      executionLimits: { timeoutMs: 10000, maxUrls: 50 },
    },
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of URLs to verify',
        },
      },
      required: ['urls'],
    },
  },
];

export async function handleMcpRpc(
  req: JsonRpcRequest,
  accountId: string
): Promise<JsonRpcResponse> {
  const { id, method, params = {} } = req;
  const store = getAgentEconomyStore();

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2026-07-28',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'gxeon-capability-market',
              version: '1.0.0',
            },
          },
        };
      }

      case 'tools/list':
      case 'gxeon.list_services': {
        const services = listAvailableServices();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
            services,
          },
        };
      }

      case 'tools/call': {
        const toolName = (params.name as string) || '';
        const args = (params.arguments || {}) as Record<string, unknown>;

        if (toolName === 'list_services') {
          const services = listAvailableServices();
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(services, null, 2) }],
              isError: false,
            },
          };
        }

        if (toolName === 'get_quote') {
          const { serviceId, quantity } = args as { serviceId: string; quantity: number };
          const quoteRes = await createQuote({
            accountId,
            serviceId,
            quantity: Number(quantity),
          });
          if (!quoteRes.success || !quoteRes.quote) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(quoteRes, null, 2) }],
                isError: true,
              },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(quoteRes.quote, null, 2) }],
              isError: false,
            },
          };
        }

        if (toolName === 'submit_job') {
          const { quoteId, input, idempotencyKey } = args as {
            quoteId: string;
            input: Record<string, unknown>;
            idempotencyKey?: string;
          };
          const admission = await submitJobAdmission({
            accountId,
            quoteId,
            input,
            idempotencyKey,
            waitForExecution: true,
          });
          if (!admission.success) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(admission.error, null, 2) }],
                isError: true,
              },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(admission.result || admission.job, null, 2),
                },
              ],
              isError: false,
            },
          };
        }

        if (toolName === 'get_job') {
          const { jobId } = args as { jobId: string };
          const job = await store.getJob(jobId);
          if (!job || job.accountId !== accountId) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: `Job ${jobId} not found or unauthorized` }],
                isError: true,
              },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(job, null, 2) }],
              isError: false,
            },
          };
        }

        if (toolName === 'get_result') {
          const { jobId } = args as { jobId: string };
          const job = await store.getJob(jobId);
          if (!job || job.accountId !== accountId) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: `Job ${jobId} not found or unauthorized` }],
                isError: true,
              },
            };
          }
          const result = await store.getJobResult(jobId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result || { jobId, state: job.state, message: 'Result not ready' }, null, 2),
                },
              ],
              isError: false,
            },
          };
        }

        if (toolName === 'get_balance') {
          const balance = await getAccountBalance(accountId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(balance, null, 2) }],
              isError: false,
            },
          };
        }

        if (toolName === 'gxeon_json_validate_v1') {
          const balance = await getAccountBalance(accountId);
          const availableCredits = balance?.availableCredits ?? 0;
          if (availableCredits < 2) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        error: 'INSUFFICIENT_CREDITS',
                        message: `Insufficient credits. Required: 2 credits. Available: ${availableCredits}`,
                        x402Alternative: {
                          endpoint: 'https://gxeon-wallet-command-center.vercel.app/x402/json-validate',
                          priceUsdc: 0.01,
                          network: 'eip155:8453',
                        },
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              },
            };
          }
          const raw = (args.rawJson || args.payload || '') as string;
          const execRes = executeJsonValidateWorker({ payload: raw });
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(execRes, null, 2) }],
              isError: !execRes.valid,
            },
          };
        }

        if (toolName === 'gxeon_url_verify_v1') {
          const urls = (args.urls as string[]) || [];
          const requiredCredits = Math.max(1, urls.length) * 5;
          const balance = await getAccountBalance(accountId);
          const availableCredits = balance?.availableCredits ?? 0;
          if (availableCredits < requiredCredits) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        error: 'INSUFFICIENT_CREDITS',
                        message: `Insufficient credits. Required: ${requiredCredits} credits. Available: ${availableCredits}`,
                        x402Alternative: {
                          endpoint: 'https://gxeon-wallet-command-center.vercel.app/x402/url-verify',
                          priceUsdc: 0.025 * Math.max(1, urls.length),
                          network: 'eip155:8453',
                        },
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              },
            };
          }
          const execRes = await executeUrlVerifyWorker({ urls });
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(execRes, null, 2) }],
              isError: false,
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
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
        const { quoteId, input, idempotencyKey } = params as {
          quoteId: string;
          input: Record<string, unknown>;
          idempotencyKey?: string;
        };

        const admission = await submitJobAdmission({
          accountId,
          quoteId,
          input,
          idempotencyKey,
          waitForExecution: false,
        });

        if (!admission.success) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: admission.statusCode === 402 ? -32000 : -32602,
              message: admission.error?.error.message || 'Job submission failed',
              data: admission.error,
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            jobId: admission.job!.jobId,
            state: admission.job!.state,
            totalCreditsReserved: admission.totalCreditsReserved,
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
