# GXEON RustChain Contribution & Payout Intelligence

This module implements the deliverable proposed for RustChain Micro-Grant #402 as a **read-only evidence system**.

## Purpose

It prevents the most common accounting error in bounty hunting: treating a listed reward, claim, maintainer acceptance, or queued transfer as money already received.

Lifecycle:

`OPPORTUNITY → SUBMITTED → ACCEPTED → PENDING → CONFIRMED`

Only `CONFIRMED` is counted as confirmed RTC. A plain caller-supplied ledger object, a confirmed boolean, or a syntactically valid hash is **never** enough. `reconcileContributionWithOfficialWallet()` must independently read the public official RustChain wallet history and match miner ID, confirmed inbound status, transaction hash, credited RTC amount, bounty/grant issue number and claimant identifier.

## Trust model

- GitHub reads are restricted to `Scottcjn/rustchain-bounties`.
- Maintainer authority is restricted to `Scottcjn` and `sophiaeagent-beep`.
- GitHub comments can prove submission, acceptance or pending payout evidence, but cannot by themselves prove settlement.
- Ledger evidence must be fetched from the official HTTPS RustChain wallet history, not asserted by a caller. The synchronous pure reconciler deliberately refuses to promote supplied `source: 'ledger'` evidence.
- The asynchronous verifier fails closed on HTTP/format/identity errors; the local trusted receipt is not transferable by JSON or object cloning.
- Confirmed transaction hashes are deduplicated in aggregate totals to avoid counting the same payment twice.
- No wallet creation, private keys, signatures, transfers, claims, issue comments or other writes exist in this module.
- Optional `GITHUB_TOKEN` is read-only from the module's perspective and is never logged.

## Public connector

`fetchIssueEvidence(issue, claimant, wallet)` reads the public issue and its comments and extracts only maintainer-authority evidence. It performs GET requests only.

## Deterministic reconciliation

`reconcileContribution()` derives a lifecycle state and fails closed on unverified ledger evidence. `reconcileContributionWithOfficialWallet()` performs a read-only GET against the official `/wallet/history` endpoint and validates a single award; if confirmed, it returns an in-process verified record. `summarizeContributions()` counts a verified transaction hash at most once per wallet, keeping every record in a single lifecycle bucket.

## Tests / fixtures

`src/rustchain-intelligence/reconcile.test.ts` covers:
- unsupported submissions remain submitted;
- unauthorized payout statements are ignored;
- acceptance is not settlement;
- pending requires maintainer evidence plus pending id + tx;
- confirmed requires a matching transfer from the official RustChain history (not a caller flag);
- forged hashes, wrong wallet, award, claimant, amount, transfer direction and unsettled transfers fail closed;
- repeated confirmed records sharing one verified transaction do not double count;
- unavailable/malformed official history never yields a paid claim;
- a record is never counted in two lifecycle buckets.

Run:

```bash
npm test -- --run src/rustchain-intelligence/reconcile.test.ts
npm run build
```

## CLI/report surface

`renderContributionReport(summary)` produces a deterministic Markdown report suitable for the GXEON command center or CLI wrapper. It explicitly states the money-truth rule in the generated report.

## Grant #402 demo

The public XPeX history can be represented without overstating revenue. For example, a grant proposal remains `SUBMITTED` until authoritative evidence promotes it. A maintainer-approved transfer remains `PENDING` until independently confirmed on the ledger. This module intentionally does not hard-code live payout claims into fixtures.

RTC is an experimental ecosystem token; this module does not assign USD/BRL value or imply an off-ramp.
