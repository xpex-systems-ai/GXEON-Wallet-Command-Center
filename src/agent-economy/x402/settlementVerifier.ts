import { recoverTypedDataAddress, getAddress } from 'viem';
import {
  X402PaymentProof,
  X402SettlementVerification,
  X402PaymentPayload,
  Eip3009Authorization,
} from './types.js';
import { getNetwork } from './networks.js';
import { getAgentEconomyStore } from '../store.js';
import { FORBIDDEN_EXAMPLE_ADDRESS } from './treasuryVerifier.js';

// ERC20 Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// EIP-712 Domain for Base USDC (EIP-3009)
const EIP712_USDC_BASE_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453,
  verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
};

const EIP712_TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export async function verifyX402Settlement(
  paymentData: X402PaymentPayload | X402PaymentProof,
  requiredAmountAtomic: string,
  _serviceId?: string
): Promise<X402SettlementVerification> {
  const store = getAgentEconomyStore();

  // Determine if canonical PaymentPayload or legacy/upfront proof
  const isCanonicalPayload = 'accepted' in paymentData && 'payload' in paymentData;

  const networkId = isCanonicalPayload ? paymentData.accepted.network : (paymentData as X402PaymentProof).network;
  const network = getNetwork(networkId);

  if (!network || !network.operational) {
    await store.recordSecurityEvent('invalidPaymentsBlocked');
    return {
      verified: false,
      settlementId: '',
      network: networkId,
      txHash: '',
      payer: '',
      recipient: '',
      amountAtomic: '0',
      amountUsdc: 0,
      asset: '',
      timestamp: new Date().toISOString(),
      error: `Network ${networkId} is unsupported, unverified, or disabled`,
    };
  }

  // Security gate: Treasury must NOT be the example address
  if (network.treasuryPayTo.toLowerCase() === FORBIDDEN_EXAMPLE_ADDRESS) {
    await store.recordSecurityEvent('circuitBreakerEvents');
    return {
      verified: false,
      settlementId: '',
      network: networkId,
      txHash: '',
      payer: '',
      recipient: network.treasuryPayTo,
      amountAtomic: '0',
      amountUsdc: 0,
      asset: network.usdcAsset,
      timestamp: new Date().toISOString(),
      error: 'SECURITY VIOLATION: Treasury address is the prohibited x402 example address',
    };
  }

  // -------------------------------------------------------------
  // FLOW A: Canonical EIP-3009 Authorization Flow (Exact Scheme)
  // -------------------------------------------------------------
  if (isCanonicalPayload) {
    const payload = (paymentData as X402PaymentPayload).payload;
    if (payload.authorization && payload.signature) {
      const auth = payload.authorization as Eip3009Authorization;
      const sig = payload.signature;

      // 1. Replay check on authorization nonce
      const cleanNonce = auth.nonce.toLowerCase();
      const existingSettlement = await store.getX402Settlement(cleanNonce);
      if (existingSettlement) {
        await store.recordSecurityEvent('replaysBlocked');
        return {
          verified: false,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: auth.to,
          amountAtomic: auth.value,
          amountUsdc: Number(auth.value) / 1_000_000,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'EIP-3009 authorization nonce has already been consumed (replay blocked)',
        };
      }

      // 2. Validate time boundaries
      const nowSec = Math.floor(Date.now() / 1000);
      if (auth.validBefore <= nowSec) {
        return {
          verified: false,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: auth.to,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'EIP-3009 authorization has expired (validBefore in past)',
        };
      }

      if (auth.validAfter > nowSec) {
        return {
          verified: false,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: auth.to,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'EIP-3009 authorization is not yet active (validAfter in future)',
        };
      }

      // 3. Verify recipient is verified GXEON Treasury
      if (getAddress(auth.to).toLowerCase() !== getAddress(network.treasuryPayTo).toLowerCase()) {
        return {
          verified: false,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: auth.to,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: `Authorization recipient (${auth.to}) does not match verified treasury (${network.treasuryPayTo})`,
        };
      }

      // 4. Verify amount >= required
      if (BigInt(auth.value) < BigInt(requiredAmountAtomic)) {
        return {
          verified: false,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: auth.to,
          amountAtomic: auth.value,
          amountUsdc: Number(auth.value) / 1_000_000,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: `Authorization value (${auth.value}) is less than required (${requiredAmountAtomic})`,
        };
      }

      // 5. Test mock signature bypass if enabled for vitest
      if (process.env.GXEON_X402_ALLOW_TEST_PROOFS === 'true' && sig.startsWith('0xtest_sig')) {
        return {
          verified: true,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: network.treasuryPayTo,
          amountAtomic: auth.value,
          amountUsdc: Number(auth.value) / 1_000_000,
          asset: network.usdcAsset,
          blockNumber: 12345678,
          timestamp: new Date().toISOString(),
          paymentFlow: 'authorization',
          authorization: auth,
        };
      }

      // 6. Recover signer via EIP-712 typed data
      try {
        const recoveredSigner = await recoverTypedDataAddress({
          domain: EIP712_USDC_BASE_DOMAIN,
          types: EIP712_TRANSFER_TYPES,
          primaryType: 'TransferWithAuthorization',
          message: {
            from: getAddress(auth.from),
            to: getAddress(auth.to),
            value: BigInt(auth.value),
            validAfter: BigInt(auth.validAfter),
            validBefore: BigInt(auth.validBefore),
            nonce: auth.nonce as `0x${string}`,
          },
          signature: sig as `0x${string}`,
        });

        if (getAddress(recoveredSigner).toLowerCase() !== getAddress(auth.from).toLowerCase()) {
          return {
            verified: false,
            settlementId: cleanNonce,
            network: networkId,
            txHash: cleanNonce,
            payer: auth.from,
            recipient: auth.to,
            amountAtomic: '0',
            amountUsdc: 0,
            asset: network.usdcAsset,
            timestamp: new Date().toISOString(),
            error: `EIP-3009 signature mismatch: recovered ${recoveredSigner}, expected ${auth.from}`,
          };
        }

        return {
          verified: true,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: network.treasuryPayTo,
          amountAtomic: auth.value,
          amountUsdc: Number(auth.value) / 1_000_000,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          paymentFlow: 'authorization',
          authorization: auth,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          verified: false,
          settlementId: cleanNonce,
          network: networkId,
          txHash: cleanNonce,
          payer: auth.from,
          recipient: auth.to,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: `EIP-3009 signature verification failed: ${msg}`,
        };
      }
    }
  }

  // -------------------------------------------------------------
  // FLOW B: Upfront On-Chain Settlement Verification (txHash)
  // -------------------------------------------------------------
  const rawTxHash = isCanonicalPayload
    ? (paymentData as X402PaymentPayload).payload.txHash
    : (paymentData as X402PaymentProof).txHash;

  if (!rawTxHash || typeof rawTxHash !== 'string' || rawTxHash.length < 10) {
    await store.recordSecurityEvent('invalidPaymentsBlocked');
    return {
      verified: false,
      settlementId: '',
      network: networkId,
      txHash: rawTxHash || '',
      payer: '',
      recipient: '',
      amountAtomic: '0',
      amountUsdc: 0,
      asset: '',
      timestamp: new Date().toISOString(),
      error: 'Invalid or missing transaction hash proof or EIP-3009 authorization',
    };
  }

  // Replay check on txHash
  const cleanId = rawTxHash.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const existingSettlement = await store.getX402Settlement(rawTxHash);
  const existingJob = (await store.getJob(`job_x402_${cleanId}`)) || (await store.getJob(`x402_${cleanId}`));

  if (existingSettlement || existingJob) {
    await store.recordSecurityEvent('replaysBlocked');
    return {
      verified: false,
      settlementId: rawTxHash,
      network: networkId,
      txHash: rawTxHash,
      payer: '',
      recipient: network.treasuryPayTo,
      amountAtomic: '0',
      amountUsdc: 0,
      asset: network.usdcAsset,
      timestamp: new Date().toISOString(),
      error: 'Transaction hash has already been consumed (replay blocked)',
    };
  }

  // Test proof bypass for test suite if enabled
  if (process.env.GXEON_X402_ALLOW_TEST_PROOFS === 'true' && rawTxHash.startsWith('0xtest_')) {
    return {
      verified: true,
      settlementId: rawTxHash,
      network: networkId,
      txHash: rawTxHash,
      payer: '0xtest_buyer',
      recipient: network.treasuryPayTo,
      amountAtomic: requiredAmountAtomic,
      amountUsdc: Number(requiredAmountAtomic) / 1_000_000,
      asset: network.usdcAsset,
      blockNumber: 12345678,
      timestamp: new Date().toISOString(),
      paymentFlow: 'upfront',
    };
  }

  // Base EVM JSON-RPC On-Chain Receipt Check
  if (networkId === 'eip155:8453') {
    try {
      const response = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [rawTxHash],
        }),
      });

      if (!response.ok) {
        throw new Error(`Base RPC returned HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        result?: {
          status: string;
          blockNumber: string;
          from: string;
          to: string;
          logs: Array<{
            address: string;
            topics: string[];
            data: string;
          }>;
        };
      };

      const receipt = json.result;
      if (!receipt) {
        await store.recordSecurityEvent('invalidPaymentsBlocked');
        return {
          verified: false,
          settlementId: rawTxHash,
          network: networkId,
          txHash: rawTxHash,
          payer: '',
          recipient: network.treasuryPayTo,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'Transaction receipt not found on Base mainnet (pending or invalid hash)',
        };
      }

      if (receipt.status !== '0x1') {
        await store.recordSecurityEvent('invalidPaymentsBlocked');
        return {
          verified: false,
          settlementId: rawTxHash,
          network: networkId,
          txHash: rawTxHash,
          payer: receipt.from,
          recipient: network.treasuryPayTo,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'Transaction reverted on Base mainnet (status = 0x0)',
        };
      }

      // Match Transfer log to verified Treasury
      const treasuryClean = getAddress(network.treasuryPayTo).toLowerCase().replace('0x', '');
      const usdcClean = getAddress(network.usdcAsset).toLowerCase();

      let matchedAmountAtomic = BigInt(0);
      let payerAddress = receipt.from;

      for (const log of receipt.logs || []) {
        if (log.address.toLowerCase() === usdcClean && log.topics[0] === TRANSFER_TOPIC) {
          const toAddress = (log.topics[2] || '').toLowerCase().replace('0x', '').padStart(40, '0').slice(-40);
          if (toAddress === treasuryClean) {
            const rawVal = BigInt(log.data);
            matchedAmountAtomic += rawVal;
            if (log.topics[1]) {
              payerAddress = '0x' + (log.topics[1] || '').replace('0x', '').slice(-40);
            }
          }
        }
      }

      const requiredBigInt = BigInt(requiredAmountAtomic);
      if (matchedAmountAtomic < requiredBigInt) {
        await store.recordSecurityEvent('invalidPaymentsBlocked');
        return {
          verified: false,
          settlementId: rawTxHash,
          network: networkId,
          txHash: rawTxHash,
          payer: payerAddress,
          recipient: network.treasuryPayTo,
          amountAtomic: matchedAmountAtomic.toString(),
          amountUsdc: Number(matchedAmountAtomic) / 1_000_000,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: `Transferred amount (${matchedAmountAtomic}) is less than required (${requiredBigInt})`,
        };
      }

      const blockNumberParsed = parseInt(receipt.blockNumber, 16) || 0;

      return {
        verified: true,
        settlementId: rawTxHash,
        network: networkId,
        txHash: rawTxHash,
        payer: payerAddress,
        recipient: network.treasuryPayTo,
        amountAtomic: matchedAmountAtomic.toString(),
        amountUsdc: Number(matchedAmountAtomic) / 1_000_000,
        asset: network.usdcAsset,
        blockNumber: blockNumberParsed,
        confirmations: 1,
        timestamp: new Date().toISOString(),
        paymentFlow: 'upfront',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await store.recordSecurityEvent('circuitBreakerEvents');
      return {
        verified: false,
        settlementId: rawTxHash,
        network: networkId,
        txHash: rawTxHash,
        payer: '',
        recipient: network.treasuryPayTo,
        amountAtomic: '0',
        amountUsdc: 0,
        asset: network.usdcAsset,
        timestamp: new Date().toISOString(),
        error: `Base RPC verification failed: ${msg}`,
      };
    }
  }

  return {
    verified: false,
    settlementId: rawTxHash,
    network: networkId,
    txHash: rawTxHash,
    payer: '',
    recipient: network.treasuryPayTo,
    amountAtomic: '0',
    amountUsdc: 0,
    asset: network.usdcAsset,
    timestamp: new Date().toISOString(),
    error: `Unsupported network verification for ${networkId}`,
  };
}
