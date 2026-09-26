# GXEON Wallet Adapters Specification

The GXEON Wallet Command Center implements an extensible adapter layer in `src/wallets/`.

## 1. Capability System

Every adapter implements `WalletAdapter` and explicitly declares supported capabilities from the enum:

- `READ_BALANCE`: Querying public balance from blockchain node/explorer.
- `READ_TRANSACTIONS`: Querying transaction history from explorer.
- `CONNECT`: Establishing a handshake with a browser extension provider (e.g. MetaMask).
- `SIGN`: Requesting cryptographic proof of address ownership.
- `SEND`: Broadcasting on-chain transfers (*Disabled in V1*).
- `WATCH_ONLY`: Monitoring public address activity without signing keys.

---

## 2. Adapter Catalog

| Adapter ID | Network | Status | Capabilities |
| :--- | :--- | :--- | :--- |
| `rustchain` | RustChain (RTC) | `ACTIVE` | `READ_BALANCE`, `READ_TRANSACTIONS`, `WATCH_ONLY` |
| `evm-metamask` | EVM (Eth, Base, Polygon, Arb) | `ACTIVE` | `CONNECT`, `READ_BALANCE`, `READ_TRANSACTIONS`, `SIGN`, `WATCH_ONLY` |
| `coinbase-wallet` | EVM | `READY` | `CONNECT`, `READ_BALANCE`, `READ_TRANSACTIONS`, `WATCH_ONLY` |
| `solana` | Solana | `COMING_SOON` | `WATCH_ONLY` |

---

## 3. RustChain Adapter Details

- **Identifier:** `rustchain`
- **Initial Target Address:** `RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`
- **Operational Mode:** `WATCH_ONLY`
- **Verification Rule:** `ownership_verified: false` until signed proof is executed via local plane.

---

## 4. EVM / MetaMask Adapter Details

- **Identifier:** `evm-metamask`
- **Standard:** EIP-1193 (`window.ethereum`)
- **Flow:** User clicks Connect → MetaMask popup requests authorization → Public address and chain ID returned → Zero seed phrases requested.
