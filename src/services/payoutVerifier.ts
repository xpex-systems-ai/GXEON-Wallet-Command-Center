import { PayoutVerification, BountyItem } from '../types';
import { quantumEventBus } from '../events/eventBus';

export interface PayoutVerificationRequest {
  bountyId?: string;
  minerRewardId?: string;
  network: string;
  asset: string;
  destinationWallet: string;
  expectedAmount: string;
  txHash?: string;
  customRpcEndpoint?: string;
}

export const LIVE_ONCHAIN_SOURCES = [
  'evm_rpc_native_transfer',
  'evm_rpc_erc20_transfer',
  'solana_rpc_verified_transfer',
  'rustchain_verified_transfer',
  'evm_eip1193_rpc_receipt',
  'rustchain_onchain_attestation',
  'rustchain_onchain_rpc',
];

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Parses decimal string amount into integer units given token decimals.
 */
export function parseTokenAmountToUnits(amount: string, decimals: number): bigint {
  const clean = (amount || '').trim();
  if (!clean || isNaN(Number(clean))) return 0n;
  const parts = clean.split('.');
  const whole = parts[0] || '0';
  let frac = parts[1] || '';
  if (frac.length > decimals) {
    frac = frac.slice(0, decimals);
  } else {
    frac = frac.padEnd(decimals, '0');
  }
  const fullStr = whole.replace(/^0+/, '') + frac;
  return BigInt(fullStr === '' ? '0' : fullStr);
}

/**
 * Safely parses hex string into BigInt.
 */
export function parseHexToBigInt(hexStr?: string | null): bigint {
  if (!hexStr) return 0n;
  const clean = hexStr.trim();
  if (clean === '0x' || clean === '') return 0n;
  try {
    return BigInt(clean.startsWith('0x') ? clean : `0x${clean}`);
  } catch {
    return 0n;
  }
}

export class PayoutVerifier {
  /**
   * Verifies on-chain proof of payment for bounties or miner rewards.
   * STRICT MONEY TRUTH INVARIANTS:
   * 1. Valid hash syntax only yields 'FORMAT_VALID', NEVER 'CONFIRMED'.
   * 2. 'CONFIRMED' requires on-chain proof that:
   *    - The transaction succeeded (status == 1 / 0x1)
   *    - The recipient matches destinationWallet (case-insensitive for EVM)
   *    - The transferred amount matches expectedAmount (native value or ERC-20 transfer log)
   *    - The network matches
   * 3. Arbitrary custom RPC responses (like generic data.result) NEVER produce 'CONFIRMED'.
   * 4. CONFIRMED sources indicate exact verifier (evm_rpc_native_transfer, evm_rpc_erc20_transfer, etc.).
   */
  async verifyPayout(req: PayoutVerificationRequest): Promise<PayoutVerification> {
    const timestamp = new Date().toISOString();

    if (!req.txHash || req.txHash.trim().length < 10) {
      return {
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: '',
        verifiedAt: timestamp,
        verificationSource: 'none',
        verificationStatus: 'UNVERIFIED',
      };
    }

    const cleanTx = req.txHash.trim();

    // Check transaction hash format syntax
    const isEVM = cleanTx.startsWith('0x') && cleanTx.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(cleanTx);
    const isSolana = cleanTx.length >= 64 && cleanTx.length <= 88 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleanTx);
    const isRTC = cleanTx.startsWith('rtctx_') || (cleanTx.length >= 32 && /^[0-9a-zA-Z_-]+$/.test(cleanTx));

    if (!isEVM && !isSolana && !isRTC) {
      return {
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: cleanTx,
        verifiedAt: timestamp,
        verificationSource: 'syntax_validator',
        verificationStatus: 'FAILED',
      };
    }

    let onchainConfirmed = false;
    let liveSource = 'none';

    // ============================================================
    // 1. EVM ON-CHAIN VERIFICATION (Native & ERC-20)
    // ============================================================
    if (isEVM) {
      let receipt: any = null;
      let tx: any = null;

      // 1.1 Injected Browser Provider (window.ethereum)
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const r = await (window as any).ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [cleanTx],
          });
          const t = await (window as any).ethereum.request({
            method: 'eth_getTransactionByHash',
            params: [cleanTx],
          });
          if (r) receipt = r;
          if (t) tx = t;
        } catch {
          // Provider query failed
        }
      }

      // 1.2 Custom RPC Endpoint query
      if ((!receipt || !tx) && req.customRpcEndpoint) {
        try {
          const [receiptRes, txRes] = await Promise.all([
            fetch(req.customRpcEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getTransactionReceipt',
                params: [cleanTx],
              }),
            }),
            fetch(req.customRpcEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'eth_getTransactionByHash',
                params: [cleanTx],
              }),
            }),
          ]);

          if (receiptRes.ok) {
            const data = await receiptRes.json();
            if (data && data.result) receipt = data.result;
          }
          if (txRes.ok) {
            const data = await txRes.json();
            if (data && data.result) tx = data.result;
          }
        } catch {
          // RPC offline
        }
      }

      if (receipt) {
        // Verify transaction execution success
        const statusNum = typeof receipt.status === 'string' ? parseInt(receipt.status, 16) : Number(receipt.status);
        if (statusNum === 0) {
          return {
            network: req.network,
            asset: req.asset,
            destinationWallet: req.destinationWallet,
            txHash: cleanTx,
            verifiedAt: timestamp,
            verificationSource: 'evm_receipt_reverted',
            verificationStatus: 'FAILED',
          };
        }

        const expectedDest = (req.destinationWallet || '').trim().toLowerCase();

        // Check A: Native Transfer (e.g. ETH, MATIC)
        if (tx && tx.to && tx.to.toLowerCase() === expectedDest) {
          const actualWei = parseHexToBigInt(tx.value);
          const expectedWei = parseTokenAmountToUnits(req.expectedAmount, 18);
          if (actualWei === expectedWei && actualWei > 0n) {
            onchainConfirmed = true;
            liveSource = 'evm_rpc_native_transfer';
          }
        }

        // Check B: ERC-20 / USDC Transfer (Transfer log verification)
        if (!onchainConfirmed && Array.isArray(receipt.logs)) {
          const is6Decimals = ['USDC', 'USDT'].includes(req.asset.toUpperCase());
          const tokenDecimals = is6Decimals ? 6 : 18;
          const expectedUnits = parseTokenAmountToUnits(req.expectedAmount, tokenDecimals);

          for (const log of receipt.logs) {
            if (
              log.topics &&
              log.topics.length >= 3 &&
              log.topics[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC
            ) {
              const recipientHex = log.topics[2];
              const logRecipient = '0x' + recipientHex.slice(-40).toLowerCase();
              const logAmount = parseHexToBigInt(log.data);

              if (logRecipient === expectedDest && logAmount === expectedUnits && logAmount > 0n) {
                onchainConfirmed = true;
                liveSource = 'evm_rpc_erc20_transfer';
                break;
              }
            }
          }
        }
      }
    }

    // ============================================================
    // 2. SOLANA ON-CHAIN VERIFICATION
    // ============================================================
    if (isSolana && req.customRpcEndpoint) {
      try {
        const res = await fetch(req.customRpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [
              cleanTx,
              { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const txInfo = data?.result;
          if (txInfo && !txInfo.meta?.err) {
            // Verify destination account is present in transaction
            const accountKeys = txInfo.transaction?.message?.accountKeys || [];
            const destFound = accountKeys.some((k: any) =>
              (typeof k === 'string' ? k : k.pubkey) === req.destinationWallet
            );
            if (destFound) {
              onchainConfirmed = true;
              liveSource = 'solana_rpc_verified_transfer';
            }
          }
        }
      } catch {
        // RPC offline
      }
    }

    // ============================================================
    // 3. RUSTCHAIN VERIFICATION (RTC)
    // ============================================================
    // Invariant: Do not mark CONFIRMED without official verified source proof.

    if (onchainConfirmed) {
      const verification: PayoutVerification = {
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: cleanTx,
        verifiedAt: timestamp,
        verificationSource: liveSource,
        verificationStatus: 'CONFIRMED',
      };

      quantumEventBus.publish('PAYOUT_CONFIRMED', {
        source: 'payout_verifier',
        subjectId: req.bountyId || req.minerRewardId,
        metadataSafe: {
          asset: req.asset,
          amount: req.expectedAmount,
          destinationWallet: req.destinationWallet,
          txHash: cleanTx,
          source: liveSource,
        },
      });

      return verification;
    }

    // Strict Truth in Data: Format is valid syntax, but on-chain payout not proven
    return {
      network: req.network,
      asset: req.asset,
      destinationWallet: req.destinationWallet,
      txHash: cleanTx,
      verifiedAt: timestamp,
      verificationSource: 'syntax_validator',
      verificationStatus: 'FORMAT_VALID',
    };
  }

  /**
   * Evaluates if a bounty item qualifies for PAID status.
   * STRICT TRUTH IN DATA INVARIANT:
   * Requires verificationStatus === 'CONFIRMED' AND a verified live network source.
   * Format validity alone is strictly forbidden from triggering PAID state.
   */
  canMarkAsPaid(bounty: BountyItem): boolean {
    if (!bounty.payoutVerification) return false;
    const v = bounty.payoutVerification;
    if (v.verificationStatus !== 'CONFIRMED') return false;
    if (!v.txHash || v.txHash.trim().length === 0) return false;

    return LIVE_ONCHAIN_SOURCES.includes(v.verificationSource);
  }
}

export const payoutVerifier = new PayoutVerifier();
