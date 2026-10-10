# GXEON RustChain Contribution & Payout Intelligence

This module implements the deliverable proposed for RustChain Micro-Grant #402 as a **read-only evidence system**.

## Purpose

It prevents the most common accounting error in bounty hunting: treating a listed reward, claim, maintainer acceptance, or queued transfer as money already received.

Lifecycle:

`OPPORTUNITY → SUBMITTED → ACCEPTED → PENDING → CONFIRMED`

Only `CONFIRMED` is counted as confirmed RTC, and that state requires ledger evidence with a transaction hash.

## Trust model

- GitHub reads are restricted to `Scottcjn/rustchain-bounties`.
- Maintainer authority is restricted to `Scottcjn` and `sophiaeagent-beep`.
- GitHub comments can prove submission, acceptance or pending payout evidence, but cannot by themselves prove settlement.
- Ledger evidence is required for `CONFIRMED`.
- No wallet creation, private keys, signatures, transfers, claims, issue comments or other writes exist in this module.
- Optional `GITHUB_TOKEN` is read-only from the module's perspective and is never logged.

## Public connector

`fetchIssueEvidence(issue, claimant, wallet)` reads the public issue and its comments and extracts only maintainer-authority evidence. It performs GET requests only.

## Deterministic reconciliation

`reconcileContribution()` derives one lifecycle state per contribution. `summarizeContributions()` puts each record into exactly one bucket, preventing double counting.

## Tests / fixtures

`src/rustchain-intelligence/reconcile.test.ts` covers:
- unsupported submissions remain submitted;
- unauthorized payout statements are ignored;
- acceptance is not settlement;
- pending requires maintainer evidence plus pending id + tx;
- confirmed requires ledger confirmation + tx;
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
