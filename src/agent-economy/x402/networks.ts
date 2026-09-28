/**
 * GXEON Native x402 Network & Treasury Configuration
 * Production Network: Base Mainnet (EVM, CAIP-2: eip155:8453)
 * Fail-Closed Treasury Ownership Gate
 */

import { TreasuryStatus } from './types.js';
import { FORBIDDEN_EXAMPLE_ADDRESS } from './treasuryVerifier.js';

export interface X402NetworkDef {
  networkId: string;
  name: string;
  usdcAsset: string;
  decimals: number;
  treasuryPayTo: string;
  rpcUrl: string;
  operational: boolean;
}

export function getTreasuryStatus(): {
  status: TreasuryStatus;
  treasuryPayTo: string;
  error?: string;
} {
  const payTo = process.env.GXEON_X402_BASE_PAYTO?.trim() || '';
  const isVerified = process.env.GXEON_TREASURY_VERIFIED === 'true';

  if (!payTo || !payTo.startsWith('0x') || payTo.length !== 42) {
    return {
      status: 'TREASURY_UNVERIFIED',
      treasuryPayTo: '',
      error: 'Treasury address GXEON_X402_BASE_PAYTO is not configured or malformed',
    };
  }

  if (payTo.toLowerCase() === FORBIDDEN_EXAMPLE_ADDRESS) {
    return {
      status: 'TREASURY_UNVERIFIED',
      treasuryPayTo: '',
      error: 'CRITICAL SECURITY STOP-LOSS: Address 0x209693bc6afc0c5328ba36faf03c514ef312287c is an official specification example address and is strictly prohibited in GXEON production.',
    };
  }

  if (!isVerified) {
    return {
      status: 'TREASURY_UNVERIFIED',
      treasuryPayTo: payTo,
      error: 'Treasury address has not passed operational verification gate (GXEON_TREASURY_VERIFIED != true)',
    };
  }

  return {
    status: 'TREASURY_VERIFIED',
    treasuryPayTo: payTo,
  };
}

export function getX402Networks(): Record<string, X402NetworkDef> {
  const treasury = getTreasuryStatus();

  return {
    'eip155:8453': {
      networkId: 'eip155:8453',
      name: 'Base Mainnet',
      usdcAsset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      treasuryPayTo: treasury.treasuryPayTo,
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      operational: treasury.status === 'TREASURY_VERIFIED',
    },
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
      networkId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      name: 'Solana Mainnet',
      usdcAsset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      treasuryPayTo: process.env.GXEON_X402_SOLANA_PAYTO?.trim() || '',
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      operational: false, // Disabled until settlement verification exists
    },
  };
}

export function getNetwork(networkId: string): X402NetworkDef | null {
  const networks = getX402Networks();
  return networks[networkId] || null;
}
