import { X402PaymentProof, X402SettlementVerification } from './types.js';
import { getNetwork } from './networks.js';
import { getAgentEconomyStore } from '../store.js';

// ERC20 Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function verifyX402Settlement(
  proof: X402PaymentProof,
  requiredAmountAtomic: string,
  _serviceId?: string
): Promise<X402SettlementVerification> {
  const network = getNetwork(proof.network);
  if (!network) {
    return {
      verified: false,
      settlementId: '',
      network: proof.network,
      txHash: proof.txHash,
      payer: proof.payerAddress || '',
      recipient: '',
      amountAtomic: '0',
      amountUsdc: 0,
      asset: proof.asset || '',
      timestamp: new Date().toISOString(),
      error: `Unsupported network ${proof.network}`,
    };
  }

  if (!proof.txHash || typeof proof.txHash !== 'string' || proof.txHash.length < 10) {
    return {
      verified: false,
      settlementId: '',
      network: proof.network,
      txHash: proof.txHash,
      payer: proof.payerAddress || '',
      recipient: '',
      amountAtomic: '0',
      amountUsdc: 0,
      asset: proof.asset || '',
      timestamp: new Date().toISOString(),
      error: 'Invalid or missing transaction hash proof',
    };
  }

  // 1. Replay Protection: Check if settlementId (txHash) has already been consumed
  const store = getAgentEconomyStore();
  const cleanId = proof.txHash.replace(/[^a-zA-Z0-9_]/g, '_');
  const existingJob = (await store.getJob(`job_x402_${cleanId}`)) || (await store.getJob(`x402_${cleanId}`));
  if (existingJob) {
    return {
      verified: false,
      settlementId: proof.txHash,
      network: proof.network,
      txHash: proof.txHash,
      payer: proof.payerAddress || '',
      recipient: network.treasuryPayTo,
      amountAtomic: '0',
      amountUsdc: 0,
      asset: network.usdcAsset,
      timestamp: new Date().toISOString(),
      error: 'Transaction hash has already been consumed (replay blocked)',
    };
  }

  // 2. Test / Mock proof bypass for test suite if explicitly enabled
  if (process.env.GXEON_X402_ALLOW_TEST_PROOFS === 'true' && proof.txHash.startsWith('0xtest_')) {
    return {
      verified: true,
      settlementId: proof.txHash,
      network: proof.network,
      txHash: proof.txHash,
      payer: proof.payerAddress || '0xtest_buyer',
      recipient: network.treasuryPayTo,
      amountAtomic: requiredAmountAtomic,
      amountUsdc: Number(requiredAmountAtomic) / 1_000_000,
      asset: network.usdcAsset,
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Live On-Chain Verification for Base (EVM)
  if (proof.network === 'eip155:8453') {
    try {
      const response = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [proof.txHash],
        }),
      });

      if (!response.ok) {
        throw new Error(`RPC returned HTTP ${response.status}`);
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
        return {
          verified: false,
          settlementId: proof.txHash,
          network: proof.network,
          txHash: proof.txHash,
          payer: proof.payerAddress || '',
          recipient: network.treasuryPayTo,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'Transaction receipt not found on Base mainnet (pending or invalid hash)',
        };
      }

      if (receipt.status !== '0x1') {
        return {
          verified: false,
          settlementId: proof.txHash,
          network: proof.network,
          txHash: proof.txHash,
          payer: receipt.from,
          recipient: network.treasuryPayTo,
          amountAtomic: '0',
          amountUsdc: 0,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: 'Transaction reverted on-chain (status = 0x0)',
        };
      }

      // Find USDC Transfer log to GXEON Treasury
      const treasuryAddressClean = network.treasuryPayTo.toLowerCase().replace('0x', '');
      const usdcAddressClean = network.usdcAsset.toLowerCase();

      let matchedAmountAtomic = BigInt(0);
      let payerAddress = receipt.from;

      for (const log of receipt.logs || []) {
        if (log.address.toLowerCase() === usdcAddressClean && log.topics[0] === TRANSFER_TOPIC) {
          const toAddress = (log.topics[2] || '').toLowerCase().replace('0x', '').padStart(40, '0').slice(-40);
          if (toAddress === treasuryAddressClean) {
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
        return {
          verified: false,
          settlementId: proof.txHash,
          network: proof.network,
          txHash: proof.txHash,
          payer: payerAddress,
          recipient: network.treasuryPayTo,
          amountAtomic: matchedAmountAtomic.toString(),
          amountUsdc: Number(matchedAmountAtomic) / 1_000_000,
          asset: network.usdcAsset,
          timestamp: new Date().toISOString(),
          error: `Transferred amount (${matchedAmountAtomic}) is less than required (${requiredBigInt})`,
        };
      }

      return {
        verified: true,
        settlementId: proof.txHash,
        network: proof.network,
        txHash: proof.txHash,
        payer: payerAddress,
        recipient: network.treasuryPayTo,
        amountAtomic: matchedAmountAtomic.toString(),
        amountUsdc: Number(matchedAmountAtomic) / 1_000_000,
        asset: network.usdcAsset,
        blockNumber: parseInt(receipt.blockNumber, 16),
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        verified: false,
        settlementId: proof.txHash,
        network: proof.network,
        txHash: proof.txHash,
        payer: proof.payerAddress || '',
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
    settlementId: proof.txHash,
    network: proof.network,
    txHash: proof.txHash,
    payer: proof.payerAddress || '',
    recipient: network.treasuryPayTo,
    amountAtomic: '0',
    amountUsdc: 0,
    asset: network.usdcAsset,
    timestamp: new Date().toISOString(),
    error: `On-chain verification for ${proof.network} is not configured`,
  };
}
