/** Single watch-only Base balance snapshot across Dashboard cards.
 * Reuses a short-lived promise/result to avoid redundant Base RPC calls on mount.
 * A cached reading is still an onchain snapshot for its original observedAt,
 * never current settlement or bounty earnings.
 */
export interface BaseWalletSnapshot {
  status: 'CONFIRMED_ONCHAIN' | 'UNAVAILABLE';
  observedAt: string;
  address: string;
  chainId: number;
  balances: { eth: string; usdc: string } | null;
  blockNumber?: string;
  explorer?: string;
}
const WALLET = '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428';
const REFRESH_AFTER_MS = 4000;
let inFlight: Promise<BaseWalletSnapshot> | null = null;
let last: { snapshot: BaseWalletSnapshot; fetchedAt: number } | null = null;
const unavailable = (): BaseWalletSnapshot => ({
  status: 'UNAVAILABLE', observedAt: new Date().toISOString(),
  address: WALLET, chainId: 8453, balances: null,
});
export function fetchSharedBaseWallet(): Promise<BaseWalletSnapshot> {
  if (inFlight) return inFlight;
  if (last && Date.now() - last.fetchedAt < REFRESH_AFTER_MS) {
    return Promise.resolve(last.snapshot);
  }
  inFlight = (async () => {
    try {
      const response = await fetch('/api/integration-status?view=base-wallet', { cache: 'no-store' });
      if (!response.ok) return unavailable();
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== 'object') return unavailable();
      const obj = raw as Partial<BaseWalletSnapshot>;
      if (obj.status !== 'CONFIRMED_ONCHAIN'
        || obj.chainId !== 8453
        || typeof obj.address !== 'string'
        || obj.address.toLowerCase() !== WALLET.toLowerCase()
        || typeof obj.balances?.eth !== 'string'
        || typeof obj.balances?.usdc !== 'string'
        || typeof obj.observedAt !== 'string') return unavailable();
      return obj as BaseWalletSnapshot;
    } catch {
      return unavailable();
    }
  })().then(snapshot => {
    last = { snapshot, fetchedAt: Date.now() };
    return snapshot;
  }).finally(() => { inFlight = null; });
  return inFlight;
}
