# Central ecosystem integrations

XPeX Systems Command is the central corporate platform. The GXEON Wallet Command
Center is its financial observation module, deployed separately on Vercel. It owns
the integration cards and public community
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

The card follows the GXEON black/gold identity, shows account/portfolio provenance
only inside an authorized session, keeps assets separate, and labels missing USDC,
network, history, sync or revenue as **NÃO VERIFICADO**. A brokerage balance does
not establish a Base address or network. The historical connector check does not
mean the backend is connected now.

## Track API history and receipt inspection

`GET /api/integration-status?view=coinbase-history` applies the same signed Firebase
owner gate and no-store policy before reading Coinbase. It requires explicit,
verified Track API account UUIDs in server-only
`COINBASE_READ_TRANSACTION_ACCOUNT_IDS` (comma-separated, max 10). Do not infer
Track account IDs from brokerage UUIDs or automatically reuse the ChatGPT portfolio.
Coinbase must authorize each configured account; a forbidden account fails the
whole read rather than appearing as an empty wallet.

Only the exact allowlisted `/v2/accounts/{account_id}/transactions` GET paths can
be JWT-signed. Pagination is bounded, generated locally on the fixed Coinbase
host and validated; provider next URLs are never followed with credentials.
Incomplete/malformed reads fail closed. Identical overlapping records are
deduplicated by account ID + provider transaction ID; conflicting duplicates fail.
Amounts remain decimal strings. The provider network/status/hash is nullable and
is never replaced with an assumed Base network.

`Ver transações` reads the full bounded scope; `Ver recebimentos` filters strictly
positive `receive` records with provider `completed` status. Trades, buys, internal
transfers, pending amounts and zero credits do not qualify. This is **provider
receipt evidence**, not independently verified Base settlement or agent revenue.
Every record remains `NOT_RECONCILED`. No history read writes to credit balances,
machine revenue or the tenant ledger. Refresh is idempotent and cannot create
duplicate financial entries because this surface has no financial write path.

The private Command ledger currently has a separate session/tenant boundary.
Before recognizing revenue, a later authorized integration must bind the existing
owner/tenant, approved delivery, provider record and independently verified chain
receipt (network, token contract, recipient, amount and settlement finality), and
apply a durable unique provider/account/transaction/event key. Existing x402
treasury records cannot be attributed to Coinbase without verified wallet mapping.
No such mapping or reconciliation is claimed by this release.

`Solicitar operação` prepares an unsent in-memory draft for human review. It does
not create a durable review ticket, approve an operation, sign or send funds, and
is cleared when the session/refresh changes. Financial operations remain outside
this module's authority.

To activate runtime reads, configure the existing owner's Firebase client settings
(`VITE_FIREBASE_*`), server `FIREBASE_PROJECT_ID`, verified existing owner UID and
server-only `COINBASE_READ_API_KEY_NAME` / `COINBASE_READ_API_KEY_SECRET` in Vercel.
Create an ES256 Coinbase key restricted to **View** and the intended portfolio.
Do not put the key in a VITE variable, the repository, a report or ChatGPT messages.
No new owner identity is created by this change.

`GXEON_COINBASE_CONNECTOR_VERIFIED_AT` records only the time of a successful GXEON
connector check. It is historical evidence and never activates runtime reads.
Without credentials and operator auth the card remains explicitly pending.

The new API views are served by Vercel. Firebase Hosting currently serves a
legacy Stripe-only response; the client validates both response contracts before
storing them and reports unavailable integrations there without crashing the
dashboard or accepting legacy fields as a Coinbase balance.

Official specifications:
- [Coinbase API key JWT authentication](https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication)
- [Accounts and portfolio scope](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/accounts/list-accounts)
- [Orders pagination](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/list-orders)
- [Track API transaction types, status, network and read scope](https://docs.cdp.coinbase.com/coinbase-business/track-apis/transactions)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
