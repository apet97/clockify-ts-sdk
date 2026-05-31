# CI and Workflow Policy

GitHub workflows are proof infrastructure. They should mirror the
local package gates without becoming the source of product truth.

## Current workflow roles

| Workflow | Role |
|---|---|
| `.github/workflows/ci.yml` | SDK wrapper CI: local SDK codegen, type-check, build, smoke dual ESM/CJS, tests, type tests, pack snapshot, size, lint, OpenAPI/codegen checks, Bun smoke, and Deno smoke. |
| `.github/workflows/ci-cli.yml` | CLI CI: build the wrapper first, then type-check, test, build, and dry-run pack the CLI package. |
| `.github/workflows/ci-mcp.yml` | MCP CI: build the wrapper first, then type-check, test, build, and dry-run pack the MCP package. |
| `.github/workflows/codeql.yml` | Security analysis for hand-written TypeScript and workflow files. |
| `.github/workflows/docs.yml` | TypeDoc Pages deployment for SDK API docs. |
| `.github/workflows/release-please.yml` | Release PR automation only. |
| `.github/workflows/release.yml` | Legacy tag-triggered npm release path; not the default local workflow and not to be changed without explicit maintainer approval. |

## CI safety rules

- Do not change workflow triggers, publish/auth behavior, Pages
  permissions, or release settings during routine SDK polish.
- Keep checkout credentials non-persistent unless a workflow explicitly
  needs write access.
- Keep package workflow matrices on Node 20 and 22 until runtime policy
  changes intentionally.
- Keep live Clockify credentials out of GitHub-hosted CI.
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
- `make package-contract`
- `make supply-chain`
- `make release-support-contract`
- `make agent-handoff`

Do not use this policy as permission to edit CI/CD behavior. It is a
drift contract for the behavior that already exists.
