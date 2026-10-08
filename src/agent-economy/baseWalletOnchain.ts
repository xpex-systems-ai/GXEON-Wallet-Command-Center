import { createPublicClient, formatEther, formatUnits, http, isAddress } from 'viem';
import { base } from 'viem/chains';

/**
 * GXEON's public, self-custody Base address. This module never holds keys or signs.
 * Wallet balances MUST NOT be counted as settled bounty or Stripe revenue.
 */
export const GXEON_BASE_WALLET = '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428' as const;
export const BASE_NATIVE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

const erc20 = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

export async function readOfficialBaseWallet() {
  const observedAt = new Date().toISOString();
  if (!isAddress(GXEON_BASE_WALLET)) {
    return { status: 'UNAVAILABLE' as const, observedAt, chainId: 8453,
      address: GXEON_BASE_WALLET, balances: null, error: 'INVALID_WALLET_CONFIG' };
  }
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_READONLY_RPC_URL || 'https://mainnet.base.org',
        { timeout: 8000, retryCount: 1 }),
    });
    const [eth, usdc, blockNumber] = await Promise.all([
      client.getBalance({ address: GXEON_BASE_WALLET }),
      client.readContract({
        address: BASE_NATIVE_USDC, abi: erc20,
        functionName: 'balanceOf', args: [GXEON_BASE_WALLET],
      }),
      client.getBlockNumber(),
    ]);
    return {
      status: 'CONFIRMED_ONCHAIN' as const, observedAt,
      chainId: 8453, network: 'base-mainnet', address: GXEON_BASE_WALLET,
      custody: 'SELF_CUSTODY_READ_ONLY',
      balances: { eth: formatEther(eth), usdc: formatUnits(usdc, 6) },
      contracts: { usdc: BASE_NATIVE_USDC },
      blockNumber: blockNumber.toString(),
      explorer: 'https://basescan.org/address/' + GXEON_BASE_WALLET,
      note: 'On-chain holdings are NOT settled bounty earnings or withdrawable revenue.',
    };
  } catch {
    return { status: 'UNAVAILABLE' as const, observedAt, chainId: 8453,
      address: GXEON_BASE_WALLET, balances: null, error: 'BASE_RPC_UNAVAILABLE' };
  }
}
