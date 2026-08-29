# CI and Workflow Policy

GitHub workflows are proof infrastructure. They should mirror the
local package gates without becoming the source of product truth.

## Current workflow roles

| Workflow | Role |
|---|---|
| `.github/workflows/ci.yml` | Consolidated SDK/CLI/MCP workspace CI on exact Node 22.13.0 and Node 24: local SDK generation, package lint/type-check/test/build, wrapper dual-build smoke, pack snapshots, cross-package contracts, coverage, and a governed audit of production and development dependencies. A manual `workflow_dispatch: {}` runs the same proof without publication or live Clockify credentials. |
| `.github/workflows/mutation.yml` | Weekly-scheduled (Mondays 05:00 UTC, dispatch-capable) wrapper/MCP/CLI Stryker proof on exact Node 22.13.0. Actions are SHA-pinned, credentials are blank, and checkout fetches complete history so the checker can enforce the maximum floors and governed-path union across every contract-changing first-parent commit. Shallow history fails closed. Target-aware report presence is verified before one target/run-attempt artifact is retained for 14 days; `target=all` proves all three packages without publishing. |
| `.github/workflows/codeql.yml` | Security analysis for hand-written TypeScript and workflow files. |
| `.github/workflows/docs.yml` | TypeDoc Pages deployment for SDK API docs. |
| `.github/workflows/release.yml` | Tag-only exact-artifact SDK release on exact Node 22.13.0. A pushed `wrapper-v*.*.*` tag may write externally only when its receipt exists, its commit is reachable from `origin/main`, generator drift/fixture proof, `make contract-gates`, and `make release-proof` pass, and tag/version, package, integrity, registry-smoke, and attestation checks succeed. |
| `.github/workflows/ci-cli-release.yml` | Tag-only exact-artifact CLI release on exact Node 22.13.0. A pushed `cli-v*.*.*` tag may publish only when its receipt exists, its commit is reachable from `origin/main`, generator drift/fixture proof, the SDK dependency and CLI gates, `make contract-gates`, and `make release-proof` pass. Requires the `NPM_TOKEN` secret. |
| `.github/workflows/ci-mcp-release.yml` | Tag-only full MCP release on exact Node 22.13.0. A pushed `mcp-v*.*.*` tag may publish only when its receipt exists, its commit is reachable from `origin/main`, and package/manifest/peer, generation, MCP, contract-gates, release-proof, audit, MCPB, secret, and exact-artifact checks pass, then idempotently attaches the two explicit MCPB and SPDX assets. A rerun accepts an existing npm version only when its registry integrity matches the freshly packed local artifact. |
| `.github/workflows/sandbox-key-health.yml` | Optional scheduled/workflow-dispatch preflight for the sandbox Clockify key; read-only checkout, no publish, skips cleanly when secrets are absent. |

- **`cross-gate` (ci.yml)** runs the four cross-package drift gates
  (`operation-parity-drift`, `openapi-operations-drift`, `openapi-lint`,
  `product-surface-drift`) so a change that passes every per-package suite but
  breaks the OpenAPI/SDK/MCP joins is caught in CI. It does **not** publish.
- **Performance budgets are operator proof, not hosted CI proof.** Package CI
  still runs build/runtime smoke tests, but it does not run
  `make performance-budgets`; load-sensitive startup timings and package-size
  ceilings run solo in local `make perfect-fast`/`make perfect-full`.

## CI safety rules

- Do not change workflow triggers, publish/auth behavior, Pages
  permissions, or release settings during routine SDK polish.
- Keep checkout credentials non-persistent unless a workflow explicitly
  needs write access.
- Keep package workflow matrices on Node 22.13 and 24 until runtime policy
  changes intentionally.
- Keep the weekly-scheduled, dispatch-capable Mutation workflow on exact Node
  22.13.0 with immutable
  action SHAs and `fetch-depth: 0`. Routine mutation proof runs there; never run Stryker locally — the
  `make mutation` target exists only as the `target=all` entry point that
  workflow invokes — and mutation is not part of `perfect-full` (only the
  `make mutation-ci` wiring proof is). The floor checker requires complete, non-shallow first-parent
  contract history; it fails closed when historical maxima or governed-path
  retention cannot be proven.
- Keep live Clockify credentials out of package CI. The only GitHub-hosted
  workflow that reads Clockify secrets is `sandbox-key-health.yml`, and it
  exists solely to detect an expired sandbox key without printing it.
- The publish-capable workflows are tag-only. `.github/workflows/ci.yml` is the
  read-only manual proof surface; it has `contents: read`, no npm token, and no
  publication command.
- Treat local `make perfect-fast`, `make perfect-full`, and
  `make perfect-live` as the operator proof surface; CI is a parallel
  safety net.
## Release workflow state contract

Release workflows declare the fail-closed `scripts/release-state.mjs` engine
and use the shared bounded `scripts/registry-smoke.mjs` harness. They have no
manual trigger. External writes are `tag-push-only`; exact artifact publication records local and remote
`dist.integrity`, fails on mismatch, and does not substitute a branch ref for
the manifest version. Every release checkout has complete history, and a tag
path initializes its receipt before checking whether the commit is reachable
from `origin/main`; an unreachable source then fails with that receipt intact.
Every package release runs generator reproducibility and fixture proof plus
`make contract-gates` and `make release-proof` before packing the exact artifact.

Every release receipt is printed, summarized through `$GITHUB_STEP_SUMMARY`,
and uploaded as a receipt artifact with the pinned
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` action on
success or failure. Only the named receipt finalizer steps may use
`if: always()`. Root helper steps explicitly set `working-directory: .`, and
release workflows use no live Clockify credentials.

Workflow files are versioned with their tagged commits. The local contract can
prove the current files, but it cannot retroactively harden a workflow stored in
an older commit or configure remote tag/environment protections. Repository
rules must therefore prevent release tags from targeting pre-hardening commits
and protect npm/GitHub release credentials; that evidence remains external
governance rather than a claim made by `make ci-contract`.

## Release workflow decision packet

Before any tag, GitHub release, npm publication, or release workflow
change, run:

```bash
node scripts/plan.mjs release-decision --decision all
```

The planner is no-network and preflight-only. It does not run Git, npm,
Docker, hosted SDK generators, tests, builds, Clockify API calls, `npm publish`, or CI/CD
changes. It separates the default local-tarball handoff path from
tag-only, npm-via-CI, and legacy-workflow retirement decisions. Any path
other than local tarball handoff requires explicit maintainer approval.

## Required receipts

Before claiming CI readiness, run or cite:

- `make ci-contract`
- `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make sandbox-key-health`
- `make package-contract`
- `make supply-chain`
- `make release-support-contract`

Do not use this policy as permission to edit CI/CD behavior. It is a
drift contract for the behavior that already exists.
