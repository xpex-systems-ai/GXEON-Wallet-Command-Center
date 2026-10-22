# GXEON — Grant #402 / RTC Evidence & Independent Review Packet

**As of:** 2026-10-15 UTC (read-only reconciliation)
**Applicant:** `@xpex-systems-ai`
**Project PR:** https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center/pull/47
**Grant reference:** https://github.com/Scottcjn/rustchain-bounties/issues/402

## Source of truth

Every number below was read from the official RustChain public wallet endpoints, NOT from the PR description, screenshots, a reward advertisement, or an internal fiat conversion.

- Native address: `RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`
  - Balance: https://rustchain.org/wallet/balance?miner_id=RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269
  - History: https://rustchain.org/wallet/history?miner_id=RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269&limit=100
- Hosted handle wallet: `xpex-systems-ai`
  - Balance: https://rustchain.org/wallet/balance?miner_id=xpex-systems-ai
  - History: https://rustchain.org/wallet/history?miner_id=xpex-systems-ai&limit=100

## Reconciliation snapshot (two DISTINCT wallets)

### Native RTC wallet — 67.677852 RTC

| Entry | RTC | On-chain evidence | Nature |
|---|---:|---|---|
| Grant #402 upfront, builder (50% of announced 100 RTC) | 50 | `c5743a7b7302ae11a4455289881bef43` | confirmed incoming RTC |
| Bounty #16601 Type B | 15 | `18410b28fb7c0c127392693c21a75553` | confirmed incoming RTC |
| Bounty #100 discovery | 2 | `b4310cbe5f5f4422a7cbfcf2719f473f` | confirmed incoming RTC |
| Epoch 291 reward | 0.177852 | native ledger entry (no tx hash) | recorded RTC |
| Welcome bonus | 0.5 | native ledger entry (no tx hash) | recorded RTC |
| **Native balance** | **67.677852** | balance API | confirmed |

### Hosted GitHub handle wallet — 5.0 RTC

| Entry | RTC | On-chain evidence |
|---|---:|---|
| Bounty #12442 | 3 | `2d7592e4ad55c60de8a2568c31636fed` |
| Bounty #13949 | 2 | `0d8cafff0b84815143329eb07e9efb0e` |
| **Hosted balance** | **5** | hosted wallet balance API |

**Combined confirmed credits across two ledgers: 72.677852 RTC.** This is NOT the balance of one wallet. Hosted credits are not represented as already migrated; only maintainer-mediated transfer can change that.

## Grant #402 — outstanding milestone

- The RustChain native ledger verifies **50 RTC grant upfront** at the identified wallet and transaction.
- The originally announced grant total is **100 RTC**; the other **50 RTC are a CONDITIONAL MILESTONE**, not a confirmed receivable, paid amount, or guaranteed award.
- The GitHub project implementation is tracked in PR #47. The PR was observed **OPEN** and **without formal review submissions** in the connected GitHub account on 2026-10-15.
- The external upstream grant issue currently returned HTTP 404 to the available public and GitHub connector fetches; we could not independently verify a new reviewer decision, sign-off, deadline, or pending payout.
- Do not report the remaining 50 RTC as paid until the authorized RustChain reviewer confirms acceptance and the official wallet history reflects the new transfer.

## Implementation under review

PR #47 includes a GitHub issue/comment connector, an authority-aware contribution lifecycle (OPPORTUNITY / SUBMITTED / ACCEPTED / PENDING / CONFIRMED), test fixtures and Markdown reporting.

**Independent reviewer checklist (not self-certification):**
1. Verify source identities and grant approval against the upstream maintainer thread or direct maintainer response.
2. Run `npm test -- --run src/rustchain-intelligence/reconcile.test.ts`, `npm run build` and any project CI gates.
3. Recheck the patched `reconcileContributionWithOfficialWallet()` proof boundary in PR #47. It requests the authoritative wallet history and checks wallet ID, transfer direction/status, transaction hash, award identity, claimant and credited amount. **The patch is awaiting independent CI/reviewer certification; it must not be self-approved.**
4. Check wallet ID, amount, tx hash, confirmation status and award identity match exactly, without double counting confirmed/hosted balances.
5. Require maintainer/human reviewer acceptance of grant deliverables before treating the second tranche as a payout due.

## Financial truth & safety

- RTC is an experimental ecosystem work credit. Current official RustChain project documentation says there is **no supported cash off-ramp or RTC→USDC bridge**, so RTC balances must not be presented as realizable BRL/USD revenue.
- No funds were moved, no private keys accessed, no wallet authority changed, no funds spent to generate artificial settlements.
- Distinguish: native confirmed RTC / hosted confirmed RTC / conditional remaining grant / independently settled USDC.

## Next authorized external action

Ask the RustChain grant maintainers to review the PR #47 deliverable, identify specific acceptance requirements, and clarify the conditional 50 RTC milestone. Separately ask for status of the previously confirmed hosted 5 RTC migration to the native address. A request for status does not itself establish payment eligibility.


## Review addendum — 2026-10-22 (operator follow-up)

This addendum supersedes the **historical wallet location** and **review-pending** descriptions above; the original 2026-10-15 snapshot remains preserved as an audit trail.

- **Maintainer correspondence:** On 2026-10-20, an email reply from `sophia.eagent@gmail.com`, signed Elya (Elyan Labs), confirmed the remaining **50 RTC are conditional on acceptance** of PR #47. Requested scope: read-only connector, contribution/payout intelligence, public endpoint execution, passing tests, and a short reproducible demonstration. This email is a review requirement, **not acceptance**.
- **Hosted migration notification:** A second email on 2026-10-20 reported a 5 RTC hosted-to-native transfer, hash `d5526f4718eda656478ac655bf136f47`, with expected confirmation around 2026-10-21 18:06 UTC. This is an **internal migration**, not a new bounty or grant award. Recheck both official wallet endpoints before reporting current balances; the email alone does not independently establish final ledger settlement.
- **Review status check (2026-10-22):** GitHub's review listing for PR #47 returned **zero formal reviews**. No merge or grant acceptance is inferred from this observation.
- **Technical verification limitation:** Code inspection found exact-identity, ledger-status and tx-hash verification and duplicate-hash suppression in the PR patch. **Tests/build were not executed by this addendum**; a reviewer must run the commands below and attach actual output. A source-code inspection is not a passing CI run.
- **Bounty #1575:** The 2026-10-20 email said the maintainer intends to file a contributor registration when their GitHub organization is accessible, at the stated 3 RTC rate. No public registry entry, acceptance or payout is established here; do not duplicate the registration.

### Reproduction commands for independent reviewer

```bash
npm ci
npm test -- --run src/rustchain-intelligence/reconcile.test.ts
npm run build
```

### Remaining gates before requesting payout

1. Run and capture test/build output on the current PR head, recording the full commit SHA.
2. Demonstrate an official public wallet GET and the distinct outcomes for an actual confirmed transfer versus an unsupported/pending claim; redact credentials and do not sign or transfer funds.
3. Ask an authorized RustChain maintainer to review the deliverable and explicitly accept or request changes. Only an official new confirmed ledger entry may be described as payment of the remaining 50 RTC.
4. Keep historical hosted and native balances separate and avoid double-counting the 5 RTC migration.

No claim, financial transaction, signature, or maintainer approval was made by adding this documentation.
