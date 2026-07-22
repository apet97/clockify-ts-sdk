# CI and Workflow Policy

GitHub workflows are proof infrastructure. They should mirror the
local package gates without becoming the source of product truth.

## Current workflow roles

| Workflow | Role |
|---|---|
| `.github/workflows/ci.yml` | Consolidated SDK/CLI/MCP workspace CI on exact Node 22.13.0 and Node 24: local SDK generation, package lint/type-check/test/build, wrapper dual-build smoke, pack snapshots, cross-package contracts, coverage, and production audit. |
| `.github/workflows/mutation.yml` | Dispatch-only wrapper/MCP Stryker proof on exact Node 22.13.0. Actions are SHA-pinned, credentials are blank, checkout retains `HEAD` plus its first parent for committed-floor ratchet proof, and the checker fails closed if that shallow history lacks the predecessor contract. Reports are retained for 14 days, and `target=all` enforces the existing monotonic score floors without publishing. |
| `.github/workflows/codeql.yml` | Security analysis for hand-written TypeScript and workflow files. |
| `.github/workflows/docs.yml` | TypeDoc Pages deployment for SDK API docs. |
| `.github/workflows/release-please.yml` | Release PR automation only. |
| `.github/workflows/release.yml` | Legacy tag-triggered npm release path for `clockify-sdk-ts-115`, now on a pushed `wrapper-v*.*.*` tag; not the default local workflow and not to be changed without explicit maintainer approval. |
| `.github/workflows/ci-cli-release.yml` | Tag-triggered npm publish for `@apet97/clockify-cli-115` on a pushed `cli-v*.*.*` tag; exact Node 22.13.0 builds the SDK workspace dependency before CLI type-check/test/build/pack. `workflow_dispatch` runs proof only (publish gated to tag pushes). Requires the `NPM_TOKEN` secret; not to be changed without explicit maintainer approval. |
| `.github/workflows/ci-mcp-release.yml` | Full MCP release proof on exact Node 22.13.0. `workflow_dispatch` runs the full proof but never publishes or creates a GitHub release; a valid pushed `mcp-v*.*.*` tag may publish only after package/manifest/peer, generation, MCP, audit, MCPB, secret, and SBOM checks, then idempotently attaches the two explicit MCPB and SPDX assets. A rerun accepts an existing npm version only when its registry integrity matches the freshly packed local artifact. |
| `.github/workflows/sandbox-key-health.yml` | Optional scheduled/workflow-dispatch preflight for the sandbox Clockify key; read-only checkout, no publish, skips cleanly when secrets are absent. |

- **`cross-gate` (ci.yml)** runs the four cross-package drift gates
  (`operation-parity-drift`, `openapi-operations-drift`, `openapi-lint`,
  `product-surface-drift`) so a change that passes every per-package suite but
  breaks the OpenAPI/SDK/MCP joins is caught in CI. It does **not** publish.
- **Performance-budget timing is de-flaked in CI** via
  `CLOCKIFY_PERF_TIMING=0`: the startup smokes still run (a crash or a wrong
  MCP tool count still reds) but the wall-clock comparison is suppressed
  because shared runners show high per-run startup variance. File-size ceilings
  stay fatal. Local `make perfect-fast` keeps timing enforced.

## CI safety rules

- Do not change workflow triggers, publish/auth behavior, Pages
  permissions, or release settings during routine SDK polish.
- Keep checkout credentials non-persistent unless a workflow explicitly
  needs write access.
- Keep package workflow matrices on Node 22.13 and 24 until runtime policy
  changes intentionally.
- Keep the dispatch-only Mutation workflow on exact Node 22.13.0 with immutable
  action SHAs. Routine mutation proof runs there; local `make mutation` remains
  an opt-in maintainer gate and is not part of `perfect-full`.
- Keep live Clockify credentials out of package CI. The only GitHub-hosted
  workflow that reads Clockify secrets is `sandbox-key-health.yml`, and it
  exists solely to detect an expired sandbox key without printing it.
- Treat local `make perfect-fast`, `make perfect-full`, and
  `make perfect-live` as the operator proof surface; CI is a parallel
  safety net.
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
- `make agent-handoff`

Do not use this policy as permission to edit CI/CD behavior. It is a
drift contract for the behavior that already exists.
