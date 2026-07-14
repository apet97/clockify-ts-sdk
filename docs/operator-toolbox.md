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

## Orientation commands

| Need | Command | Output |
|---|---|---|
| Check repo shape before setup | `node scripts/repo-doctor.mjs` | JSON repo-shape report for Node floor, root workspace manifests, lockfile, local generator wiring, generated directories, and `../GOCLMCP` presence. |
| Choose SDK, CLI, MCP, mock, live, full, or support path | `node scripts/plan.mjs onboarding --goal all` | Shape-checked Markdown or JSON onboarding plan with first reads, safe-start commands, proof gates, and stop conditions. |

## Product path commands

| Need | Command | Output |
|---|---|---|
| Diagnose first-run setup or support handoff | `node scripts/plan.mjs workflow --workflow first-run-support` | Shape-checked no-network SDK, CLI, MCP diagnostics path with `readinessContext` and `safeCommandHints` boundaries. |
| Pick a common SDK/CLI/MCP workflow | `node scripts/plan.mjs workflow --workflow all` | Shape-checked SDK, CLI, MCP paths plus workflow safety notes. |
| Pick an acceptance scenario proof path | `node scripts/plan.mjs acceptance --scenario all` | Shape-checked scenario proof plan with evidence, escalation type, and cleanup expectations. |
| Pick an examples path | `node scripts/plan.mjs examples --example all` | Shape-checked SDK, CLI, MCP examples with safety boundaries and proof hints. |

## Governance and release commands

| Need | Command | Output |
|---|---|---|
| Map a changed path to required gates | `node scripts/plan.mjs change-impact --path docs/workflow-cookbook.md` | Shape-checked change scopes with required targets, docs, and changelog posture. |
| Choose a maintenance path | `node scripts/plan.mjs maintenance --cadence all` | Shape-checked weekly, monthly, dependency, generator, drift, release, and rollback plans with proof targets and stop conditions. |
| Inspect contract ownership | `node scripts/plan.mjs contract-inventory` | Contract entries, checker ownership, generated report/helper ownership, toolbox helper ownership, structural invariants, Inventory shape status for safe repo-relative paths and typed lists, contract-gates coverage, audit IDs, and missing-file signals. |
| Inspect risk status | `node scripts/plan.mjs risk-status --status all` | Open/provisional risks, closure gates, generated risk-status report shape, and file-state signals. |
| Choose a release workflow decision | `node scripts/plan.mjs release-decision --decision all` | Local tarball, tag-only, npm-via-CI, and legacy-workflow retirement options with generated approval-boundary checks. |
| Plan performance calibration | `node scripts/plan.mjs performance-calibration` | Budget-policy-backed calibration path with generated no-network plan shape, tightening rules, proof markers, and stop conditions. |

## Support command

| Need | Command | Output |
|---|---|---|
| Create a safe escalation packet | `node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json` | Redacted metadata-only support bundle. Review before attaching anywhere. |

## Proof boundary

No command in this toolbox runs Git, npm, Docker, Fern, tests, builds, or Clockify API calls.
After using these helpers, run the actual gates:

- `make axioms-contract`
- `make workflow-cookbook`
- `make acceptance-scenarios`
- `make examples-matrix`
- `make change-impact`
- `make maintenance-playbook`
- `make contract-inventory`
- `make risk-register`
- `make release-readiness`
- `make release-decision-plan`
- `make enterprise-audit`
- `make perfect-fast`
- `make performance-receipt`
- `make perfect-full`
- `make perfect-live`
