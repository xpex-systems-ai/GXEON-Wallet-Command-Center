# GXEON AgentFi OS — Private Security Manifest

## Classification
**PRIVATE / OWNER-ONLY CONTROL PLANE.** The application is not a public financial dashboard.

## Non-negotiable invariants
1. **Default deny.** Production AgentFi surfaces require authenticated identity. Missing identity configuration locks the surface instead of falling back to public/local mode.
2. **No private keys in cloud or browser.** Seeds, recovery phrases and signing credentials remain outside the web control plane.
3. **Evidence First.** Opportunity, submission, acceptance, pending payout and confirmed settlement are distinct states.
4. **The executor does not approve its own delivery.** Execution and verification are separate trust roles.
5. **Financial movement is fail-closed.** Signing, swaps, bridges, transfers, withdrawals and spending require an explicit approval gate and verified destination/route evidence.
6. **Least privilege.** Agents receive the minimum capability and scope required for a task.
7. **Immutable audit intent.** Security-relevant actions must emit attributable evidence suitable for independent review.
8. **No synthetic money truth.** Unavailable balances, quotes or confirmations remain unavailable; they are never invented or silently coerced to zero.

## Target architecture
Internet → edge protections → Firebase Identity → owner authorization → AgentFi UI/API → policy engine → bounded agents → evidence ledger → independent verifier.

The signing plane is isolated from the web control plane. Secrets belong in managed secret storage, never source code, client bundles, logs or prompts.

## Production hardening gates
Before production promotion:
- disable self-registration; provision the owner account administratively;
- enforce an owner UID allowlist server-side, not only in React;
- require phishing-resistant MFA/passkey for privileged access;
- apply Firestore deny-by-default rules scoped to the owner;
- protect every sensitive API route server-side with verified Firebase ID tokens and authorization claims;
- rate-limit and audit authentication and privileged endpoints;
- add restrictive CSP, HSTS, frame protections and secure response headers;
- dependency/SAST/secret scanning must pass with no unresolved critical findings;
- branch protection and required CI checks must prevent unreviewed production promotion;
- rotate/revoke credentials through managed secrets and maintain an incident-response path;
- keep financial signing/asset movement outside autonomous agent authority.

## Agent trust tiers
**T0 Observe:** read public/watch-only evidence.
**T1 Analyze:** qualify tasks and prepare plans.
**T2 Execute bounded:** code/test/create artifacts in approved sandboxes.
**T3 Propose privileged:** prepare financial or production mutations but cannot execute them.
**T4 Human-authorized action:** explicit approval is required for signing, transfer, withdrawal, spend or destructive production change.

## Security claim policy
No implementation is described as “unhackable,” “Pentagon-grade,” or equivalent. Security claims require measurable controls, tests and evidence.
