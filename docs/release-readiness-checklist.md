# Release Readiness Evidence Checklist

This repo does not default to publishing packages, but it still needs a concrete
release-readiness checklist. Use this before any tag, package handoff, direct
consumer install, or final claim that the SDK, CLI, and MCP surfaces are safe to
use.

## Readiness rule

A release is not ready because the code looks finished. It is ready only when
evidence exists for each required surface and the final proof receipt records the
commands that produced that evidence.

## Required evidence

For a preflight view of what still needs proof, run:

```bash
make final-proof-preflight
```

This preflight is static and no-network. It does not run Git, npm, Docker,
Fern, tests, builds, or Clockify API calls, and it is not release proof. It
prints the active-goal status report plus the release-readiness report: current
final-proof blockers, the draft/check/final command split, required proof
commands, and file-state signals such as final receipt presence, performance
calibration, and temporary context removal. Internally it includes
`make enterprise-goal-status`; use the combined `make final-proof-preflight`
target unless you specifically need just the active-goal status report.
For automation, the JSON reports expose compact blocker arrays:
`finalBlockingSignalIds` and `finalBlockingRiskIds` in the active-goal report,
plus `blockingSignalIds` and `blockingRiskIds` in the release-readiness report.
Those arrays are orientation only, not proof; use them to decide which receipt
or risk-register item to close next.

| Area | Evidence | Gate or file |
|---|---|---|
| Source of truth | GOCLMCP OpenAPI drift gates and Fern generation path are green. | `make perfect-full` |
| Generated boundary | No hand edits landed in `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**`. | `make generated-edit-check` |
| SDK package | Type-check, tests, build, dual-build smoke, and dry-run pack pass. | `make wrapper-gates` |
| CLI package | Type-check, tests, build, and dry-run pack pass. | `make cli-gates` |
| MCP package | Type-check, tests, build, and dry-run pack pass. | `make mcp-gates` |
| Packed consumer | Fresh temp consumers can install and run packed SDK, CLI, and MCP tarballs. | `make pack-smoke` |
| Public contracts | Package, runtime, env, public API, compatibility, receipts, examples, support, and axioms contracts pass. | `make axioms-contract`, `make perfect-fast` |
| Docs | README tables, docs index, troubleshooting, workflow cookbook, support runbook, and user docs are current. | `make readme-tables-drift`, `make docs-index-drift`, `make user-docs` |
| Changelogs | Public package scopes touched by the change have `[Unreleased]` entries. | `make changelog-drift` |
| Breaking-change review | Public SDK, CLI, MCP, OpenAPI, package, and install breakage has replacement-first migration evidence. | `make breaking-change-review` |
| Security posture | Secret hygiene, threat model, support bundle, supply chain, and live-safety contracts pass. | `make secret-hygiene`, `make security-threat-model`, `make support-bundle`, `make supply-chain`, `make live-safety` |
| Performance | Built artifacts are under tightened budgets calibrated from measured receipts. | `make performance-budgets`, `make performance-receipt` |
| Live proof | Live cleanup ran in a sacrificial sandbox; failed live proof must be rerun, and deferral is draft-only and must be replaced before final acceptance. | `make perfect-live`, `make final-proof-draft` |
| Final receipt | The final proof receipt is filled from real command output, not copied from the template, checked after temporary context removal, and final acceptance passes. | `make final-proof-receipt-check`, `make final-proof-final` |

## Publish decision boundary

Do not run `npm publish` from a laptop. Do not create or push a release tag until
all readiness evidence is present and a maintainer explicitly approves a publish
or tag workflow. The presence of `publishConfig.provenance` and
`prepublishOnly` gates is safety equipment, not permission to publish.

## Release workflow maintainer decision planner

Use `node scripts/plan.mjs release-decision --decision all` before any tag,
GitHub release, npm publication, or release-workflow change. The planner is a
static no-network decision packet. `make release-readiness` shape-checks the
generated decision plan so it preserves no publish permission, no CI/CD change
permission, the local-tarball default-safe path, and maintainer approval
requirements for tag, npm, and release-workflow changes. It does not run Git,
npm, Docker, Fern, tests, builds, Clockify API calls, `npm publish`, or CI/CD
changes.

Before treating any release decision as safe, generate and review the support
bundle readiness context:

```bash
node scripts/plan.mjs workflow --workflow first-run-support
node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json
```

The workflow plan is no-network and not proof; it keeps setup/support ambiguity
on the diagnostic path before any release, tag, npm publication, or workflow
change. Preserve `safeCommandHints`, `readinessContext`,
`finalBlockingSignalIds`, `blockingSignalIds`, `riskRoutingSummary`, and
`orderedProofChainCoverage` in handoff notes or the support packet when those
fields explain why a release, tag, npm publication, or workflow change is
blocked.

Supported decisions:

- `local-tarball-handoff` keeps npm publication off and is the default safe
  path when a consumer needs an installable artifact.
- `tag-github-release-only` requires explicit maintainer approval and proof that
  tag automation will not publish npm packages unexpectedly.
- `npm-via-ci` requires explicit maintainer approval, reviewed workflow posture,
  provenance, support, rollback, and post-publish smoke-install evidence.
- `retire-legacy-workflow` requires explicit maintainer approval and a dedicated
  CI/CD change that closes `legacy-release-workflow-needs-maintainer-decision`.

## Handoff decision boundary

If a future maintainer wants a package artifact without npm publication, prefer a
packed-consumer smoke path:

1. Run `make perfect-full`.
2. Run `make pack-smoke` if it was not already included in the proof path.
3. Attach the generated tarball path and final proof receipt.
4. Include `docs/support-runbook.md` for escalation and redaction rules.

## Final proof closure

The temporary context file stays through evidence capture and receipt drafting.
Remove `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` only after:

1. `docs/final-proof-receipt.md` exists and is filled from command output.
2. Performance budgets are calibrated from measured receipts and the final
   receipt says `Budget status: tightened`.
3. Live proof is completed in a sacrificial sandbox; failed live proof must be
   rerun, and deferred live proof is a draft blocker, not final readiness.
4. The receipt records the temporary-context removal, then
   `make final-proof-final` passes after the temporary context file is gone.

## Operator checklist

```md
Release or handoff name:
Commit or tree state:
SDK evidence:
CLI evidence:
MCP evidence:
OpenAPI/Fern evidence:
Packed-consumer evidence:
Docs evidence:
Security evidence:
Performance evidence:
Live proof status:
Final proof receipt path:
Publish/tag approval: none | explicit maintainer approval
Known residual risks:
```
