import { afterEach, describe, expect, it } from 'vitest';
import servicesHandler from '../../api/v1/services.js';
import offersHandler from '../../api/v1/offers.js';

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
    expect(x402Offers).toHaveLength(2);
    expect(x402Offers.every((offer: any) => offer.status === 'PAUSED')).toBe(true);
    expect(x402Offers.every((offer: any) => offer.blocker)).toBe(true);
  });
});
