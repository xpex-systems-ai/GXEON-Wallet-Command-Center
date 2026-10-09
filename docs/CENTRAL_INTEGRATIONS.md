# Central ecosystem integrations

The Wallet Command Center owns the central integration cards and public community
directory. `/?tab=integrations` opens the complete directory; `/ecosystem` exposes
the same public participation evidence. Evidence timestamps are historical checks,
not a claim of continuously verified membership.

The Railway Community Command remains the authenticated system of record for
tenant partnerships, opportunities, independently reviewed deliveries and ledger.
The central card probes its public health endpoint and opens its `/communities`
workflow. This is navigation and availability integration. **Private records are
not yet federated into the Wallet app**; the card explicitly reports that separate
authenticated-session boundary. Never copy private tenant records into the public
catalog or bypass its owner/reviewer governance.

## Coinbase account card

This card monitors the custodial Coinbase account, separately from the existing
self-custodial Coinbase Wallet browser adapter.

- `GET /api/integration-status?view=ecosystem` returns non-financial configuration
  flags, Railway health and the timestamp of a successful external connector read.
  It does not expose portfolio/account identifiers, balances, orders or secrets.
- `GET /api/integration-status?view=coinbase` requires a valid Firebase ID token
  whose UID matches `GXEON_OPERATOR_UID`. Local mode and native UI mode grant no
  authority. Responses use `private, no-store` and are never persisted in browser
  storage. Signing-plane operations are absent.
- The private read makes only GET requests to Coinbase accounts and OPEN orders.
  Both collections must be fully paginated before displaying verified data.
  Values remain decimal strings and assets are never summed across currencies.
  A missing USDC account does not become a fabricated zero USDC balance.
- Reads are scoped to the API key's permissioned portfolio. This is not a complete
  multi-portfolio valuation. The existing ChatGPT connector is a separate OAuth
  connection; its credentials are not exported or reused as server credentials.
- The legacy public money-truth endpoint no longer exposes Coinbase balance
  snapshots from environment variables.

To activate runtime reads, configure the existing owner's Firebase client settings
(`VITE_FIREBASE_*`), server `FIREBASE_PROJECT_ID`, verified existing owner UID and
server-only `COINBASE_READ_API_KEY_NAME` / `COINBASE_READ_API_KEY_SECRET` in Vercel.
Create an ES256 Coinbase key restricted to **View** and the intended portfolio.
Do not put the key in a VITE variable, the repository, a report or ChatGPT messages.
No new owner identity is created by this change.

`GXEON_COINBASE_CONNECTOR_VERIFIED_AT` records only the time of a successful GXEON
connector check. It is historical evidence and never activates runtime reads.
Without credentials and operator auth the card remains explicitly pending.

Official specifications:
- [Coinbase API key JWT authentication](https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication)
- [Accounts and portfolio scope](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/accounts/list-accounts)
- [Orders pagination](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-orders)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
