import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Hex } from 'viem';
import { getAgentEconomyStore, resetAgentEconomyStoreForTesting } from '../../src/agent-economy/store.js';
import { handleX402CapabilityExecution } from '../../src/agent-economy/x402/middleware.js';
import { describeX402Service } from '../../src/agent-economy/x402/discovery.js';

const mocks = vi.hoisted(() => ({
  getChainId: vi.fn(),
  getBlockNumber: vi.fn(),
  getLogs: vi.fn(),
  getTransactionReceipt: vi.fn(),
  getBlock: vi.fn(),
  facilitator: vi.fn(),
}));

vi.mock('viem', async (importOriginal) => ({
  ...await importOriginal<typeof import('viem')>(),
  createPublicClient: () => mocks,
}));
vi.mock('../../src/agent-economy/x402/readiness.js', () => ({
  X402_BASE_NETWORK: 'eip155:8453',
  getX402Readiness: async () => ({ enabled: true, payTo: '0x' + '22'.repeat(20) }),
}));
vi.mock('../../src/agent-economy/x402/payaiClient.js', () => ({
  callPayAIFacilitator: mocks.facilitator,
}));

const payTo = ('0x' + '22'.repeat(20)) as Hex;
const payer = ('0x' + '33'.repeat(20)) as Hex;
const nonce = ('0x' + '44'.repeat(32)) as Hex;
const txHash = ('0x' + '55'.repeat(32)) as Hex;
const blockHash = ('0x' + '66'.repeat(32)) as Hex;
const authorizationEvent = parseAbiItem('event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)');
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const origin = 'https://example.com';

beforeEach(() => {
  vi.resetAllMocks();
  resetAgentEconomyStoreForTesting();
  mocks.getChainId.mockResolvedValue(8453);
  mocks.getBlockNumber.mockResolvedValue(41n);
  mocks.getLogs.mockResolvedValue([]);
  mocks.getBlock.mockImplementation(async ({ blockTag }) =>
    blockTag === 'finalized' ? { number: 41n } : { hash: blockHash });
  mocks.facilitator.mockImplementation(async (operation: 'verify' | 'settle') => {
    if (operation === 'verify') return { isValid: true, payer };
    throw new Error('Response lost after broadcast');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('x402 recovery after delayed Base finality', () => {
  it.each([
    { serviceId: 'gxeon_json_validate_v1', path: '/x402/json-validate', amount: '10000' },
    { serviceId: 'gxeon_csv_audit_v1', path: '/x402/csv-audit', amount: '10000' },
    { serviceId: 'gxeon_csv_import_check_v1', path: '/x402/csv-import-check', amount: '1000000' },
    { serviceId: 'gxeon_json_contract_batch_v1', path: '/x402/json-contract-batch', amount: '100000' },
  ])('returns the original result and receipt once for $serviceId', async ({ serviceId, path, amount }) => {
    const store = getAgentEconomyStore();
    const resourceUrl = origin + path;
    const discovery = describeX402Service(serviceId, resourceUrl)!;
    const expected = discovery.extensions.bazaar.info;
    const request = { serviceId, resourceUrl, input: expected.input.body };
    const unpaid = await handleX402CapabilityExecution({ ...request, headers: {} });
    expect(unpaid.statusCode).toBe(402);
    const challenge = JSON.parse(Buffer.from(unpaid.headers['PAYMENT-REQUIRED'], 'base64').toString());
    expect(challenge).toEqual(unpaid.body);
    expect(challenge.extensions).toEqual(discovery.extensions);
    expect(challenge.accepts[0]).toMatchObject({ amount, payTo, network: 'eip155:8453' });

    const now = Math.floor(Date.now() / 1000);
    const signature = Buffer.from(JSON.stringify({
      x402Version: 2,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      extensions: { fakeBuyerExtension: {} },
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: payer, to: payTo, value: amount, nonce,
          validAfter: String(now - 1), validBefore: String(now + 60),
        },
      },
    })).toString('base64');
    const headers = { 'PAYMENT-SIGNATURE': signature };
    if (serviceId === 'gxeon_csv_import_check_v1') {
      const malformed = await handleX402CapabilityExecution({
        ...request,
        input: { ...expected.input.body, files: ['lead_id,email\n1,ab"cd"'] },
        headers,
      });
      expect(malformed.statusCode).toBe(400);
      expect(mocks.facilitator).not.toHaveBeenCalled();
    }
    const retry = () => handleX402CapabilityExecution({ ...request, headers });
    const pending = await retry();
    expect(pending.statusCode).toBe(503);
    expect(pending.headers['Retry-After']).toBe('30');
    expect(pending.body).toMatchObject({
      error: 'SETTLEMENT_PENDING',
      retry: { method: 'POST', reuseRequestBody: true, reusePaymentSignature: true },
    });
    expect(await store.listMachineRevenue()).toHaveLength(0);
    expect(mocks.facilitator.mock.calls.map(([operation]) => operation)).toEqual(['verify', 'settle']);
    expect(mocks.facilitator.mock.calls[1][1].extensions).toEqual(discovery.extensions);

    const txLog = {
      blockHash, blockNumber: 42n, transactionHash: txHash, transactionIndex: 0,
      address: challenge.accepts[0].asset, removed: false,
    };
    const authorizationLog = {
      ...txLog, logIndex: 0, data: '0x',
      topics: encodeEventTopics({
        abi: [authorizationEvent], eventName: 'AuthorizationUsed', args: { authorizer: payer, nonce },
      }),
    };
    const transferLog = {
      ...txLog, logIndex: 1, data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(amount)]),
      topics: encodeEventTopics({ abi: [transferEvent], eventName: 'Transfer', args: { from: payer, to: payTo } }),
    };
    mocks.getBlockNumber.mockResolvedValue(42n);
    mocks.getLogs.mockResolvedValue([authorizationLog]);
    mocks.getTransactionReceipt.mockResolvedValue({
      status: 'success', transactionHash: txHash, blockNumber: 42n, blockHash,
      logs: [authorizationLog, transferLog],
    });

    vi.spyOn(Date, 'now').mockReturnValue((now + 120) * 1000);
    expect((await retry()).body).toMatchObject({ error: 'SETTLEMENT_PENDING' });
    expect(await store.listMachineRevenue()).toHaveLength(0);

    mocks.getBlock.mockRejectedValueOnce(new Error('Base RPC timed out'));
    expect((await retry()).body).toMatchObject({ error: 'SETTLEMENT_PENDING' });
    mocks.getBlock.mockImplementation(async ({ blockTag }) =>
      blockTag === 'finalized' ? { number: 42n } : { hash: blockHash });

    const [delivered, concurrentRetry] = await Promise.all([retry(), retry()]);
    expect(delivered.statusCode).toBe(200);
    expect(concurrentRetry).toEqual(delivered);
    expect(delivered.body).toMatchObject({
      ...expected.output.example,
      receipt: { txHash, serviceId, amountAtomic: amount },
    });
    const received = JSON.parse(Buffer.from(delivered.headers['PAYMENT-RESPONSE'], 'base64').toString());
    expect(received).toMatchObject({
      transaction: txHash, serviceId, receiptId: delivered.headers['X-402-Receipt'], success: true,
    });

    mocks.getChainId.mockRejectedValue(new Error('Base RPC offline'));
    expect(await retry()).toEqual(delivered);
    const differentRequest = await handleX402CapabilityExecution({
      ...request, input: { ...request.input, changed: true }, headers,
    });
    expect(differentRequest.statusCode).toBe(409);
    expect(mocks.facilitator.mock.calls.map(([operation]) => operation)).toEqual(['verify', 'settle']);
    const revenue = await store.listMachineRevenue();
    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({
      txHash, serviceId, receiptId: delivered.headers['X-402-Receipt'], status: 'SETTLED',
    });
  });
});
