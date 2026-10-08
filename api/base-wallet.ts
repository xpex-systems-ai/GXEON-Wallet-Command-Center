import { createPublicClient, formatEther, formatUnits, http, isAddress } from 'viem';
import { base } from 'viem/chains';

// Public address only. No private keys, signing, or wallet custody.
export const GXEON_BASE_WALLET = '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428' as const;
const NATIVE_USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const rpc = process.env.BASE_READONLY_RPC_URL || 'https://mainnet.base.org';
const client = createPublicClient({ chain: base, transport: http(rpc, { timeout: 8000, retryCount: 1 }) });
const erc20 = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!isAddress(GXEON_BASE_WALLET)) return res.status(500).json({ error: 'INVALID_WALLET_CONFIG' });
  const observedAt = new Date().toISOString();
  try {
    const [eth, usdc, blockNumber] = await Promise.all([
      client.getBalance({ address: GXEON_BASE_WALLET }),
      client.readContract({ address: NATIVE_USDC_BASE, abi: erc20, functionName: 'balanceOf', args: [GXEON_BASE_WALLET] }),
      client.getBlockNumber(),
    ]);
    return res.status(200).json({
      status: 'CONFIRMED_ONCHAIN', observedAt, chainId: 8453, network: 'base-mainnet',
      address: GXEON_BASE_WALLET, custody: 'SELF_CUSTODY_READ_ONLY',
      balances: { eth: formatEther(eth), usdc: formatUnits(usdc, 6) },
      contracts: { usdc: NATIVE_USDC_BASE }, blockNumber: blockNumber.toString(),
      explorer: 'https://basescan.org/address/' + GXEON_BASE_WALLET,
      note: 'On-chain holdings are not earned revenue; payouts require separate verification.',
    });
  } catch {
    return res.status(503).json({
      status: 'UNAVAILABLE', observedAt, chainId: 8453, address: GXEON_BASE_WALLET,
      balances: null, error: 'BASE_RPC_UNAVAILABLE',
    });
  }
}
