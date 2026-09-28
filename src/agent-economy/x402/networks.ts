/**
 * GXEON Native x402 Network & Treasury Configuration
 * Supported payment rails: Base Mainnet (EVM) and Solana Mainnet-Beta.
 */

export interface X402NetworkDef {
  networkId: string;
  name: string;
  usdcAsset: string;
  decimals: number;
  treasuryPayTo: string;
  rpcUrl: string;
}

export const X402_NETWORKS: Record<string, X402NetworkDef> = {
  'eip155:8453': {
    networkId: 'eip155:8453',
    name: 'Base Mainnet',
    usdcAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    treasuryPayTo:
      process.env.GXEON_X402_BASE_PAYTO || '0x209693bc6afc0c5328ba36faf03c514ef312287c',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  },
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
    networkId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    name: 'Solana Mainnet',
    usdcAsset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    treasuryPayTo:
      process.env.GXEON_X402_SOLANA_PAYTO || '2Yt1wWXY1R498sDh3UMXpcnwT3qUWyZxLqkGQy51yLCp',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  },
};

export function getNetwork(networkId: string): X402NetworkDef | null {
  return X402_NETWORKS[networkId] || null;
}
