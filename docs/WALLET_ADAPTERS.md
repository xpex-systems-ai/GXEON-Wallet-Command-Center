# GXEON Wallet Adapters Specification

The GXEON Wallet Command Center implements an extensible, truth-first adapter layer in `src/wallets/`.

## 1. Truthful Adapter Status Matrix

| Adapter ID | Network | Operational Status | Declared Capabilities | Active Source |
| :--- | :--- | :--- | :--- | :--- |
| `rustchain` | RustChain (RTC) | `PARTIAL` | `WATCH_ONLY` (Available)<br>`READ_BALANCE` (Unavailable)<br>`READ_TRANSACTIONS` (Unavailable) | RPC not configured; Watch-Only address tracking |
| `evm-metamask` | EVM (Eth, Base, Polygon, Arb) | `ACTIVE` | `CONNECT` (Available)<br>`READ_BALANCE` (Available)<br>`READ_TRANSACTIONS` (Available)<br>`SIGN` (Available)<br>`WATCH_ONLY` (Available) | Browser Extension (EIP-1193) |
| `coinbase-wallet` | EVM | `PARTIAL` | `CONNECT` (Available)<br>`WATCH_ONLY` (Available) | Injected Extension detection |
| `solana` | Solana | `COMING_SOON` | `WATCH_ONLY` (Coming Soon) | Under specification |

---

## 2. RustChain RTC Adapter Details

- **Target Public Address:** `RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`
- **Mode:** `WATCH_ONLY`
- **Ownership Status:** `UNVERIFIED` (until local cryptographic signature proof).
- **Balance / History Query:** Since no official live public RPC endpoint is currently active, `getBalance()` returns `null` (rendered as `UNAVAILABLE`). Zero fake numbers are fabricated.

---

## 3. EVM Adapter Details

- **Protocol:** EIP-1193 (`window.ethereum`)
- **Key Safety:** Zero seed phrase requests.
- **Precision:** Wei-to-ether conversions use `BigInt` operations to preserve financial precision.
