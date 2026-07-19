# Release Readiness Evidence Checklist

This repo does not default to publishing packages, but it still needs a concrete
release-readiness checklist. Use this before any tag, package handoff, direct
consumer install, or final claim that the SDK, CLI, and MCP surfaces are safe to
use.

## Readiness rule

A release is not ready because the code looks finished. It is ready only when
evidence exists for each required surface and command receipts record the
commands that produced that evidence.

## Required evidence

For a preflight view of what still needs proof, run:

```bash
make release-readiness
```

This preflight is static and no-network. It does not run Git, npm, Docker,
Fern, tests, builds, or Clockify API calls, and it is not release proof. It
validates the release-readiness contract and prints only the contract-pass
result; it does not print a blocker report or blocker arrays.

To inspect the active risk-routing report and its blocker array, run:

```bash
make risk-status-report
```

That no-network report prints the final-readiness status, blocker count, and
`readinessBlockingRiskIds`. It is orientation only, not proof; use it to decide
which receipt or risk-register item to close next.

For the active 1.0 sequence, `docs/risk-register.json` names six required open
final-readiness blockers. While any remains open, the risk report must remain
`blocked`; no release-ready conclusion may be emitted from this checklist,
static contract, source marker, or documentation marker. Close a blocker only
through its exact closure gate and recorded command receipt.

| Area | Evidence | Gate or file |
|---|---|---|
| Source of truth | GOCLMCP OpenAPI drift gates and local SDK generation path are green. | `make perfect-full` |
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
| Live proof | Live cleanup ran in a sacrificial sandbox; failed live proof must be rerun before acceptance. | `make perfect-live` |

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
3. Attach the generated tarball path and command receipts.
4. Include `docs/support-runbook.md` for escalation and redaction rules.

## Readiness closure

Capture evidence for each required surface, then confirm readiness by:

1. Command receipts exist and are filled from real command output.
2. Performance budgets are calibrated from measured receipts and the receipt
   says `Budget status: tightened`.
3. Live proof is completed in a sacrificial sandbox; failed live proof must be
   rerun before acceptance.
4. `make perfect-full` passes on a clean tree.

## Operator checklist

```md
Release or handoff name:
Commit or tree state:
SDK evidence:
CLI evidence:
MCP evidence:
OpenAPI/local-generator evidence:
Packed-consumer evidence:
Docs evidence:
Security evidence:
Performance evidence:
Live proof status:
Final proof receipt path:
Publish/tag approval: none | explicit maintainer approval
Known residual risks:
```
