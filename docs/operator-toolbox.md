# Operator Toolbox

This toolbox lists helper commands that are safe to run before validation.
They are maps, reports, or redacted metadata bundles. They do not replace proof
gates, and they must not be cited as evidence that the SDK, CLI, MCP, OpenAPI,
or package artifacts are ready.

## Rule

No command in this toolbox runs Git, npm, Docker, Fern, tests, builds, or
Clockify API calls. If a helper ever needs one of those operations, move it out
of this toolbox and document the proof boundary in `docs/quality-gates.md`.

Every helper in this toolbox has an owner in `docs/contract-inventory.json`.
That keeps orientation scripts from becoming stray, unreviewed mini-products.

## Orientation commands

| Need | Command | Output |
|---|---|---|
| Check repo shape before setup | `node scripts/repo-doctor.mjs` | JSON repo-shape report for Node floor, package-local manifests, lockfiles, Fern pins, generated directories, and `../GOCLMCP` presence. |
| Choose SDK, CLI, MCP, mock, live, full, or support path | `node scripts/onboarding-plan.mjs --goal all` | Shape-checked Markdown or JSON onboarding plan with first reads, safe-start commands, proof gates, and stop conditions. |
| Run final proof preflight | `make final-proof-preflight` | Prints active-goal status and release-readiness reports without running proof gates. |
| See remaining final-proof blockers and command split | `make enterprise-goal-status` | Markdown final-goal status from local file-state signals, including draft receipt, receipt check, and final acceptance commands. |

For automation, the raw script is `node scripts/enterprise-goal-status.mjs --format json`.
Its final-proof evidence sequence is:

- Preflight: `make final-proof-preflight`
- Artifact audit: `make enterprise-audit`
- Fast gate: `make perfect-fast`
- Performance receipt: `make performance-receipt`
- Full gate: `make perfect-full`
- Live sandbox gate: `make perfect-live`
- Draft receipt: `LIVE=1 make final-proof-draft` or `DEFER_LIVE_REASON="..." make final-proof-draft`
- Receipt check: `make final-proof-receipt-check`
- Final acceptance: `make final-proof-final`

The JSON report also exposes `finalBlockingSignalIds` and
`finalBlockingRiskIds`, so a future operator can see which final-proof file
state or risk-register item is still blocking without reverse-engineering every
signal line.

## Product path commands

| Need | Command | Output |
|---|---|---|
| Diagnose first-run setup or support handoff | `node scripts/workflow-plan.mjs --workflow first-run-support` | Shape-checked no-network SDK, CLI, MCP diagnostics path with `readinessContext` and `safeCommandHints` boundaries. |
| Pick a common SDK/CLI/MCP workflow | `node scripts/workflow-plan.mjs --workflow all` | Shape-checked SDK, CLI, MCP paths plus workflow safety notes. |
| Pick an acceptance scenario proof path | `node scripts/acceptance-plan.mjs --scenario all` | Shape-checked scenario proof plan with evidence, escalation type, and cleanup expectations. |
| Pick an examples path | `node scripts/examples-plan.mjs --example all` | Shape-checked SDK, CLI, MCP examples with safety boundaries and proof hints. |

## Governance and release commands

| Need | Command | Output |
|---|---|---|
| Map a changed path to required gates | `node scripts/change-impact-plan.mjs --path docs/workflow-cookbook.md` | Shape-checked change scopes with required targets, docs, and changelog posture. |
| Choose a maintenance path | `node scripts/maintenance-plan.mjs --cadence all` | Shape-checked weekly, monthly, dependency, generator, drift, release, and rollback plans with proof targets and stop conditions. |
| Inspect contract ownership | `node scripts/contract-inventory-report.mjs` | Contract entries, checker ownership, generated report/helper ownership, toolbox helper ownership, structural invariants, Inventory shape status for safe repo-relative paths and typed lists, perfect-gate coverage, audit IDs, and missing-file signals. |
| Inspect risk status | `node scripts/risk-status-report.mjs --status all` | Open/provisional risks, closure gates, generated risk-status report shape, and final-proof file-state signals. |
| Inspect release-readiness state | `node scripts/release-readiness-report.mjs` | Required final proof commands, current readiness file-state signals, `blockingSignalIds`, and `blockingRiskIds`. |
| Choose a release workflow decision | `node scripts/release-decision-plan.mjs --decision all` | Local tarball, tag-only, npm-via-CI, and legacy-workflow retirement options with generated approval-boundary checks. |
| Plan performance calibration | `node scripts/performance-calibration-plan.mjs` | Budget-policy-backed calibration path with generated no-network plan shape, tightening rules, proof markers, and stop conditions. |

## Support command

| Need | Command | Output |
|---|---|---|
| Create a safe escalation packet | `node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json` | Redacted metadata-only support bundle. Review before attaching anywhere. |

## Proof boundary

No command in this toolbox runs Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
These commands are intentionally preflight-only. After using them, run the
actual gates named by their output. Examples:

- `make workflow-cookbook`
- `make acceptance-scenarios`
- `make examples-matrix`
- `make change-impact`
- `make maintenance-playbook`
- `make axioms-contract`
- `make contract-inventory`
- `make risk-register`
- `make release-readiness`
- `make release-decision-plan`
- `make enterprise-audit`
- `make perfect-fast`
- `make performance-receipt`
- `make perfect-full`
- `make perfect-live`
- `LIVE=1 make final-proof-draft`
- `make final-proof-receipt-check`
- `make final-proof-final`

The hardening goal is complete only after the final proof runbook succeeds,
`docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` is removed, and
`make final-proof-final` passes.
