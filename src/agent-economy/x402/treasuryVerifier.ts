import crypto from 'node:crypto';
import { recoverMessageAddress, getAddress } from 'viem';
import { getAgentEconomyStore } from '../store.js';

export const FORBIDDEN_EXAMPLE_ADDRESS = '0x209693bc6afc0c5328ba36faf03c514ef312287c'.toLowerCase();

export interface TreasuryVerificationRecord {
  treasury_address: string;
  challenge: string;
  challenge_hash: string;
  signature: string;
  recovered_address: string;
  verified_at: string;
}

export function generateTreasuryChallenge(targetAddress: string): {
  challenge: string;
  nonce: string;
  timestamp: string;
  challengeHash: string;
  targetAddress: string;
} {
  const cleanAddress = targetAddress.trim().toLowerCase();
  if (cleanAddress === FORBIDDEN_EXAMPLE_ADDRESS) {
    throw new Error(
      'SECURITY VIOLATION: Address 0x209693bc6afc0c5328ba36faf03c514ef312287c is an official x402 example address and is strictly forbidden as production treasury.'
    );
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = new Date().toISOString();
  const challenge = `GXEON-TREASURY:${nonce}:${timestamp}`;
  const challengeHash = crypto.createHash('sha256').update(challenge).digest('hex');

  return {
    challenge,
    nonce,
    timestamp,
    challengeHash,
    targetAddress: cleanAddress,
  };
}

export async function verifyTreasurySignature(params: {
  address: string;
  challenge: string;
  signature: string;
}): Promise<{
  verified: boolean;
  recoveredAddress?: string;
  error?: string;
  record?: TreasuryVerificationRecord;
}> {
  const { address, challenge, signature } = params;
  const cleanAddress = address.trim().toLowerCase();

  if (cleanAddress === FORBIDDEN_EXAMPLE_ADDRESS) {
    return {
      verified: false,
      error: 'SECURITY VIOLATION: Address 0x209693bc6afc0c5328ba36faf03c514ef312287c is forbidden.',
    };
  }

  if (!challenge.startsWith('GXEON-TREASURY:')) {
    return {
      verified: false,
      error: 'Invalid challenge prefix. Expected GXEON-TREASURY:<nonce>:<timestamp>',
    };
  }

  try {
    const recoveredAddress = await recoverMessageAddress({
      message: challenge,
      signature: signature as `0x${string}`,
    });

    const isMatch = getAddress(recoveredAddress).toLowerCase() === getAddress(cleanAddress).toLowerCase();
    if (!isMatch) {
      return {
        verified: false,
        recoveredAddress,
        error: `Signature verification mismatch: recovered ${recoveredAddress}, expected ${cleanAddress}`,
      };
    }

    const challengeHash = crypto.createHash('sha256').update(challenge).digest('hex');
    const record: TreasuryVerificationRecord = {
      treasury_address: getAddress(cleanAddress),
      challenge,
      challenge_hash: challengeHash,
      signature,
      recovered_address: getAddress(recoveredAddress),
      verified_at: new Date().toISOString(),
    };

    // Persist proof in durable store
    const store = getAgentEconomyStore();
    await store.saveTreasuryVerification(record);

    return {
      verified: true,
      recoveredAddress,
      record,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verified: false,
      error: `Signature recovery failed: ${msg}`,
    };
  }
}
