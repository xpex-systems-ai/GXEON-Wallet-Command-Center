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

/**
 * EXACT IMPLEMENTED AND CONFIRMED ON-CHAIN VERIFICATION SOURCES ONLY.
 * Legacy/unimplemented sources (evm_eip1193_rpc_receipt, rustchain_*) are strictly removed.
 */
export const LIVE_ONCHAIN_SOURCES = [
  'evm_rpc_native_transfer',
  'evm_rpc_erc20_transfer',
  'solana_rpc_verified_transfer',
];

export const EVM_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  base: 8453,
  polygon: 137,
  matic: 137,
  arbitrum: 42161,
  optimism: 10,
};

export const VERIFIED_TOKEN_REGISTRY: Record<string, Record<string, { address: string; decimals: number }>> = {
  ethereum: {
    USDC: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    USDT: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    DAI: { address: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18 },
  },
  base: {
    USDC: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
    USDT: { address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', decimals: 6 },
  },
  polygon: {
    USDC: { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
    USDT: { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 },
  },
  arbitrum: {
    USDC: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
    USDT: { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
  },
  optimism: {
    USDC: { address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6 },
    USDT: { address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6 },
  },
};

export const VERIFIED_SOLANA_MINTS: Record<string, { mint: string; decimals: number }> = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
};

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Internal registry of authentic, internally generated verification receipts.
 * Prevents caller-forged PayoutVerification objects from authorizing state changes.
 */
const VERIFIED_RECEIPTS_STORE = new Map<string, PayoutVerification>();

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
   * Clears internal receipts store (primarily for unit test isolation).
   */
  clearReceiptsStore(): void {
    VERIFIED_RECEIPTS_STORE.clear();
  }

  /**
   * Retrieves an authentic internally stored receipt by its verificationId.
   */
  getVerifiedReceipt(verificationId: string): PayoutVerification | undefined {
    return VERIFIED_RECEIPTS_STORE.get(verificationId);
  }

  /**
   * Validates if a given PayoutVerification was genuinely issued by PayoutVerifier.
   * Protects against forged caller-provided objects.
   */
  isValidVerifiedReceipt(v?: PayoutVerification): boolean {
    if (!v || !v.verificationId) return false;
    const stored = VERIFIED_RECEIPTS_STORE.get(v.verificationId);
    if (!stored) return false;

    return (
      stored.verificationStatus === 'CONFIRMED' &&
      stored.txHash === v.txHash &&
      stored.destinationWallet.toLowerCase() === v.destinationWallet.toLowerCase() &&
      stored.network.toLowerCase() === v.network.toLowerCase() &&
      stored.asset.toUpperCase() === v.asset.toUpperCase() &&
      LIVE_ONCHAIN_SOURCES.includes(stored.verificationSource) &&
      v.verificationStatus === 'CONFIRMED'
    );
  }

  /**
   * Verifies on-chain proof of payment for bounties or miner rewards.
   * STRICT MONEY TRUTH INVARIANTS:
   * 1. Valid hash syntax only yields 'FORMAT_VALID', NEVER 'CONFIRMED'.
   * 2. 'CONFIRMED' requires on-chain proof that:
   *    - The transaction succeeded (status == 1 / 0x1)
   *    - The chain ID matches req.network
   *    - The recipient matches destinationWallet (case-insensitive for EVM)
   *    - The transferred amount matches expectedAmount
   *    - For ERC-20, the contract is allowlisted and verified
   * 3. Solana requires confirmed signature AND balance delta matching expectedAmount.
   * 4. RustChain stays UNVERIFIED / FORMAT_VALID until official RPC verifier exists.
   * 5. Confirmed proofs are stamped with internal verificationId.
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
    const isSolana = cleanTx.length >= 64 && cleanTx.length <= 90 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleanTx);
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
      let chainId: number | null = null;

      // 1.1 Injected Browser Provider (window.ethereum)
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const [r, t, c] = await Promise.all([
            (window as any).ethereum.request({ method: 'eth_getTransactionReceipt', params: [cleanTx] }),
            (window as any).ethereum.request({ method: 'eth_getTransactionByHash', params: [cleanTx] }),
            (window as any).ethereum.request({ method: 'eth_chainId' }),
          ]);
          if (r) receipt = r;
          if (t) tx = t;
          if (c) {
            const parsedC = typeof c === 'string' ? parseInt(c, 16) : Number(c);
            if (!isNaN(parsedC)) chainId = parsedC;
          }
        } catch {
          // Provider query failed
        }
      }

      // 1.2 Custom RPC Endpoint query
      if ((!receipt || !tx) && req.customRpcEndpoint) {
        try {
          const [receiptRes, txRes, chainRes] = await Promise.all([
            fetch(req.customRpcEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [cleanTx] }),
            }),
            fetch(req.customRpcEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionByHash', params: [cleanTx] }),
            }),
            fetch(req.customRpcEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_chainId', params: [] }),
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
          if (chainRes.ok) {
            const data = await chainRes.json();
            if (data && data.result) {
              const resVal = data.result;
              const parsedC = typeof resVal === 'string' ? parseInt(resVal, 16) : Number(resVal);
              if (!isNaN(parsedC)) chainId = parsedC;
            }
          }
        } catch {
          // RPC offline
        }
      }

      if (receipt && receipt.status !== undefined && receipt.status !== null) {
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

        // Network Verification: Chain ID must match expected network if returned
        const expectedChainId = EVM_CHAIN_IDS[req.network.toLowerCase()];
        if (chainId !== null && !isNaN(chainId) && expectedChainId !== undefined && chainId !== expectedChainId) {
          return {
            network: req.network,
            asset: req.asset,
            destinationWallet: req.destinationWallet,
            txHash: cleanTx,
            verifiedAt: timestamp,
            verificationSource: 'evm_network_mismatch',
            verificationStatus: 'FAILED',
          };
        }

        const expectedDest = (req.destinationWallet || '').trim().toLowerCase();
        const assetNormalized = req.asset.toUpperCase();

        // Check A: Native Transfer (e.g. ETH, MATIC)
        if (assetNormalized === 'ETH' || assetNormalized === 'MATIC' || assetNormalized === 'NATIVE') {
          if (tx && tx.to && tx.to.toLowerCase() === expectedDest) {
            const actualWei = parseHexToBigInt(tx.value);
            const expectedWei = parseTokenAmountToUnits(req.expectedAmount, 18);
            if (actualWei === expectedWei && actualWei > 0n) {
              onchainConfirmed = true;
              liveSource = 'evm_rpc_native_transfer';
            }
          }
        }

        // Check B: ERC-20 / USDC Transfer (Transfer log + verified token contract)
        if (!onchainConfirmed && Array.isArray(receipt.logs)) {
          const networkTokens = VERIFIED_TOKEN_REGISTRY[req.network.toLowerCase()];
          const tokenConfig = networkTokens ? networkTokens[assetNormalized] : null;

          if (tokenConfig) {
            const expectedTokenAddress = tokenConfig.address.toLowerCase();
            const expectedUnits = parseTokenAmountToUnits(req.expectedAmount, tokenConfig.decimals);

            for (const log of receipt.logs) {
              const logAddress = (log.address || '').toLowerCase();
              if (
                logAddress === expectedTokenAddress &&
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
    }

    // ============================================================
    // 2. SOLANA ON-CHAIN VERIFICATION (Native SOL & SPL Tokens)
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
            const accountKeys = txInfo.transaction?.message?.accountKeys || [];
            const destIndex = accountKeys.findIndex((k: any) =>
              (typeof k === 'string' ? k : k.pubkey) === req.destinationWallet
            );

            if (destIndex !== -1) {
              const assetUpper = req.asset.toUpperCase();

              // 2.1 Native SOL Verification (Lamports balance delta)
              if (assetUpper === 'SOL' || assetUpper === 'NATIVE') {
                const preBalances = txInfo.meta?.preBalances || [];
                const postBalances = txInfo.meta?.postBalances || [];
                const pre = BigInt(preBalances[destIndex] || 0);
                const post = BigInt(postBalances[destIndex] || 0);
                const delta = post - pre;
                const expectedLamports = parseTokenAmountToUnits(req.expectedAmount, 9);

                if (delta === expectedLamports && delta > 0n) {
                  onchainConfirmed = true;
                  liveSource = 'solana_rpc_verified_transfer';
                }
              } else {
                // 2.2 SPL Token Verification (e.g. USDC on Solana)
                const splConfig = VERIFIED_SOLANA_MINTS[assetUpper];
                if (splConfig) {
                  const preTokenBalances = txInfo.meta?.preTokenBalances || [];
                  const postTokenBalances = txInfo.meta?.postTokenBalances || [];

                  const findBalance = (list: any[]) => {
                    const item = list.find(
                      (b: any) =>
                        (b.owner === req.destinationWallet || accountKeys[b.accountIndex]?.pubkey === req.destinationWallet) &&
                        b.mint === splConfig.mint
                    );
                    return item ? BigInt(item.uiTokenAmount?.amount || '0') : 0n;
                  };

                  const preToken = findBalance(preTokenBalances);
                  const postToken = findBalance(postTokenBalances);
                  const tokenDelta = postToken - preToken;
                  const expectedTokenUnits = parseTokenAmountToUnits(req.expectedAmount, splConfig.decimals);

                  if (tokenDelta === expectedTokenUnits && tokenDelta > 0n) {
                    onchainConfirmed = true;
                    liveSource = 'solana_rpc_verified_transfer';
                  }
                }
              }
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
    // Strict Invariant: RTC remains UNVERIFIED / FORMAT_VALID until official RPC verifier exists.

    if (onchainConfirmed) {
      const verificationId = `vproof_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const verification: PayoutVerification = {
        verificationId,
        proofVersion: 'v1.2',
        network: req.network,
        asset: req.asset,
        destinationWallet: req.destinationWallet,
        txHash: cleanTx,
        verifiedAt: timestamp,
        verificationSource: liveSource,
        verificationStatus: 'CONFIRMED',
      };

      // Store in authentic receipts registry
      VERIFIED_RECEIPTS_STORE.set(verificationId, verification);

      quantumEventBus.publish('PAYOUT_CONFIRMED', {
        source: 'payout_verifier',
        subjectId: req.bountyId || req.minerRewardId,
        metadataSafe: {
          verificationId,
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
   * Requires authentic internally stored verification with verificationStatus === 'CONFIRMED'
   * and a verified live network source.
   * Caller-forged objects are strictly rejected.
   */
  canMarkAsPaid(bounty: BountyItem): boolean {
    if (!bounty.payoutVerification) return false;
    return this.isValidVerifiedReceipt(bounty.payoutVerification);
  }
}

export const payoutVerifier = new PayoutVerifier();
