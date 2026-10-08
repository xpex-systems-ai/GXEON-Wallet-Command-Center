# GXEON Official Base Wallet — read-only onboarding

- Wallet address: `0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428` (user-provided public address).
- Network: Base mainnet, chain ID 8453.
- USDC: Circle native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals.
- GET `/api/base-wallet` reads ETH and native USDC from Base RPC with viem.
- Optional `BASE_READONLY_RPC_URL` for a more reliable private RPC provider; never embed credentials in source.
- Error status UNAVAILABLE must not be rendered as a zero balance.
- Do not confuse this self-custody address with the Coinbase exchange portfolio connector, Stripe, RTC, or settled bounty revenue.
- No seed phrase, private key, wallet import, transfers, claims, token approvals, or signing.
- Wallet ownership has not been cryptographically proven. If privileged features are ever needed, use SIWE / EIP-4361 with nonce and domain validation and human approval.
- Production gate: CI typecheck, HTTP endpoint GET/405/503, Base RPC balance reconciliation against BaseScan, Vercel deployment verification, and human review.
