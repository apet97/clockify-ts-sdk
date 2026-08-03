# Issue Intake Policy

Good issue intake is part of SDK quality. A bug report, feature request, PR, or
support escalation should give maintainers enough evidence to reproduce the
problem without asking for secrets, guessing the affected surface, or rerunning
unrelated proof gates.

## Intake surfaces

| Intake path | Purpose | Must collect |
|---|---|---|
| Bug report | User-visible failure in SDK, CLI, MCP, docs, package install, mock/replay, or generated contract behavior. | Required: affected surface, what happened, expected behavior, and a minimal reproducer. Optional context: package/version, runtime, entry point, receipts, support bundle, diagnostics, proof attempted, mock/live state, and workarounds. |
| Feature request | New helper, command, tool, workflow, docs path, generator improvement, or acceptance scenario. | Required: target surface, user job, current workaround, and proposed API or behavior. Optional context: acceptance evidence, breaking-change risk, and maintenance impact. |
| Pull request | Proposed repo change. | Changed surfaces, generated-path discipline, required gates, docs/changelog impact, live-proof status, support/risk updates, and residual risks. |
| Security report | Credential leak, auth, webhook, command injection, supply-chain, or disclosure-sensitive behavior. | Private advisory path only; public issues must redirect to `SECURITY.md`. |

## Bug report fields

The public bug form asks for four core fields:

- Affected surface: SDK, CLI, MCP, OpenAPI/generator, docs, mock/replay, or package install.
- What happened: a clear description of the failure.
- Expected behavior: what should have happened instead.
- Minimal reproducer: a self-contained command, code snippet, MCP call, or docs path.

Everything else is optional context. When available, add:

- Package version: `clockify-sdk-ts-115`, `@apet97/clockify-cli-115`, or `@apet97/clockify-mcp-115`.
- Runtime: Node/npm version, OS, module system, and whether local SDK codegen was involved.
- Entry point: SDK import or method, CLI command, MCP tool, OpenAPI operation ID, or docs path.
- Sanitized receipt: `requestId`, `status`, stable `code`, `retryable`, `recovery`, `changed`, `next`, and cleanup/leftover count when present.
- Generated support bundle: run
  `node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json`
  when local repo metadata matters, review it, and attach only if it contains no
  private additions. For readiness or release-adjacent issues, preserve the
  bundle's `readinessContext` summary fields such as `finalBlockingSignalIds`,
  `blockingSignalIds`, `riskRoutingSummary`, and `orderedProofChainCoverage`.
- Quickstart receipt and diagnostic surface: for first-run, setup, or support
  issues, start with
  `node scripts/plan.mjs workflow --workflow first-run-support`, say whether
  `make diagnostics` was used, and name which diagnostic surface produced
  evidence: `clockifyDiagnostics()`, `clk115 doctor --json`, or
  `clockify://mcp/doctor`. Include only safe `safeCommandHints`, never env
  values.
- Proof attempted: narrowest command or scenario, such as `make mock-contract`, `make acceptance-scenarios`, package tests, or live proof status.
- Data boundary: mock, docs-only, sacrificial sandbox, private gateway, or unknown. Never customer workspace proof.

The pre-submission checkbox groups are governed at option level, not only by
their group ID. The bug form requires the duplicate-search and no-secret/data
confirmations; its receipt, support-bundle, and quickstart confirmations stay
optional. The feature form requires all three proposal-quality confirmations.
Labels, required booleans, and the declared order are exact-contract values,
so a relabel, missing, duplicate, unexpected, reordered, or weakened option
fails `make issue-intake`.

## Feature request fields

Feature requests should explain the user job, not just the desired API. The
required core is the target surface, user job, current workaround, and proposed
API or behavior. Optional acceptance evidence, breaking-change risk, and
maintenance impact help maintainers route and evaluate the proposal when the
reporter has that context. Breaking or renaming public surfaces should point to
`docs/breaking-change-review-policy.md`.

## PR checklist quality

PRs should not rely on stale generated-file counts or old smoke assertions. The
review checklist should point to root gates and contracts, then allow package
maintainers to add exact output in the PR body or final proof receipt.
Supportability changes should include diagnostics or support-bundle impact so
reviewers know whether `clockifyDiagnostics()`, `clk115 doctor`,
`clockify://mcp/doctor`, `node scripts/plan.mjs workflow --workflow
first-run-support`, or `scripts/create-support-bundle.mjs` changed. If a
change can affect final readiness, support bundles, release handoff, or proof
routing, PRs should mention whether `readinessContext.finalBlockingSignalIds`,
`readinessContext.releaseReadiness.blockingSignalIds`,
`readinessContext.riskStatus.riskRoutingSummary`, or
`readinessContext.contractInventory.orderedProofChainCoverage` changed.

## Redaction and routing

- Do not request raw API keys, addon tokens, npm tokens, cookies, webhook shared
  secrets, customer emails, invoice lines, expense receipts, or production
  object payloads.
- Route Clockify API server behavior to Clockify support unless the local spec,
  generator, wrapper, CLI, or MCP contract is wrong.
- Route synced SDK shape issues to GOCLMCP or the local generator unless the public wrapper seam is
  the actual defect.
- Route security-sensitive issues to private disclosure through `SECURITY.md`.
## Proof gates

Before claiming intake quality readiness, run or cite:

- `make issue-intake`
- `make support-bundle`
- `node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json`
- `make docs-quality`
- `make acceptance-scenarios`
- `make risk-register`
- `make breaking-change-review`
