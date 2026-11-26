import { afterEach, describe, expect, it, vi } from 'vitest';
import servicesHandler from '../../api/v1/services.js';
import offersHandler from '../../api/v1/offers.js';
import { getPaymentPayload } from '../../src/agent-economy/x402/settlementVerifier.js';

const originalPayTo = process.env.GXEON_X402_BASE_PAYTO;
const originalVerified = process.env.GXEON_TREASURY_VERIFIED;

function response() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    headers,
    body: undefined as any,
    setHeader(name: string, value: string) { headers[name] = value; },
    end(value?: string) { this.body = value ? JSON.parse(value) : undefined; },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalPayTo === undefined) delete process.env.GXEON_X402_BASE_PAYTO;
  else process.env.GXEON_X402_BASE_PAYTO = originalPayTo;
  if (originalVerified === undefined) delete process.env.GXEON_TREASURY_VERIFIED;
  else process.env.GXEON_TREASURY_VERIFIED = originalVerified;
});

describe('x402 money-truth gate', () => {
  it('does not advertise the official example address as an active x402 rail', async () => {
    process.env.GXEON_X402_BASE_PAYTO =
      '0x209693bc6afc0c5328ba36faf03c514ef312287c';
    process.env.GXEON_TREASURY_VERIFIED = 'true';

    const res = response();
    await servicesHandler(
      { method: 'GET', url: '/v1/payment-methods' },
      res
    );

    expect(res.statusCode).toBe(200);
    const x402 = res.body.paymentMethods.find(
      (item: any) => item.rail === 'x402'
    );
    expect(x402).toMatchObject({
      enabled: false,
      status: 'CONFIGURATION_REQUIRED',
      supportedNetworks: [],
      gateways: {},
    });
    expect(x402.blocker).toContain('official specification example address');
  });

  it('keeps prepaid Stripe live while excluding x402 from active billing rails', async () => {
    process.env.GXEON_X402_BASE_PAYTO =
      '0x209693bc6afc0c5328ba36faf03c514ef312287c';
    process.env.GXEON_TREASURY_VERIFIED = 'true';

    const res = response();
    await servicesHandler(
      { method: 'GET', url: '/v1/pricing' },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.billingRails).toContain('prepaid_credits');
    expect(res.body.billingRails).toContain('stripe_live');
    expect(res.body.billingRails).not.toContain('x402');
  });

  it('marks x402 canonical offers paused until treasury activation', async () => {
    const res = response();
    await offersHandler({ method: 'GET', url: '/v1/offers' }, res);

    expect(res.statusCode).toBe(200);
    const x402Offers = res.body.canonicalOffers.filter(
      (offer: any) => offer.paymentRail === 'x402'
    );
    expect(x402Offers).toHaveLength(1);
    expect(x402Offers[0].serviceId).toBe('gxeon_json_validate_v1');
    expect(x402Offers.every((offer: any) => offer.status === 'PAUSED')).toBe(true);
    expect(x402Offers.every((offer: any) => offer.blocker)).toBe(true);
  });
});

describe('x402 signed payment requirements', () => {
  const resource = 'https://example.com/x402/json-validate';
  const treasury = '0x' + '11'.repeat(20);
  const requirements = {
    scheme: 'exact',
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: '10000',
    payTo: treasury,
    maxTimeoutSeconds: 60,
  } as const;

  it('does not bind a publicly visible transaction hash to a paid request', () => {
    const header = JSON.stringify({ network: 'eip155:8453', txHash: '0x' + '33'.repeat(32) });
    expect(getPaymentPayload(header, requirements, resource)).toBeNull();
  });

  it('rejects a receiving wallet acting as its own payer', () => {
    const header = JSON.stringify({
      x402Version: 2, resource: { url: resource }, accepted: requirements,
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: treasury, to: treasury, value: '10000', validAfter: '0',
          validBefore: '1800000000', nonce: '0x' + '44'.repeat(32),
        },
      },
    });
    expect(getPaymentPayload(header, requirements, resource)).toBeNull();
  });
});
