# Developer Environment Policy

This repo is intentionally package-local, not an npm workspace. Setup
should be boring and explicit: install the package you are working on,
build its dependencies, and run root gates when you need platform proof.

## Local runtime

| Requirement | Policy |
|---|---|
| Node.js | Use Node `>=20`. CI also exercises Node 20 and 22. |
| Package manager | Use `npm` with each package's checked-in `package-lock.json`. |
| Root package | There is no root `package.json`; do not add one casually or turn this into a workspace without an explicit architecture decision. |
| Fern | Fern CLI is pinned by `spec/fern/fern.config.json`; generators are pinned by `spec/fern/generators.yml`. |
| Docker | Required for `fern generate`, because Fern runs generator containers locally. |
| GOCLMCP sibling | Required for canonical OpenAPI regeneration and full drift proof. The conventional path is `../GOCLMCP`. |

Package scripts are part of the environment contract, not incidental
metadata. In particular, `prepublishOnly` must keep the checked command
shape from `docs/package-contract.json`, so a future laptop publish path
cannot silently drop type-check or test proof.

## Setup recipes

SDK:

```bash
cd wrapper
npm ci
npm run sync
npm run build
```

CLI:

```bash
cd wrapper && npm ci && npm run sync && npm run build
cd ../cli && npm ci && npm run build
```

MCP:

```bash
cd wrapper && npm ci && npm run sync && npm run build
cd ../mcp && npm ci && npm run build
```

OpenAPI/Fern:

```bash
(cd ../GOCLMCP && make gen-openapi)
cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml \
   spec/corrected/clockify.corrected.openapi.yaml
cd spec/fern
fern check --warnings --from-openapi
fern generate --group ts --local --force
```

## Required receipts

Before claiming the local environment is ready, run or cite:

- `node scripts/repo-doctor.mjs`
- `make developer-environment`
- `make runtime-support`
- `make generator-config`
- `make dependency-boundary`
- `make agent-handoff`

Do not confuse environment readiness with final product readiness.
Final product readiness still requires the final proof runbook.

`scripts/repo-doctor.mjs` is intentionally no-network and read-only. It checks
repo shape, Node floor, package manifests, package-local lockfiles, required
scripts including exact `prepublishOnly` command shapes, Fern pins, generated directory presence, and the conventional
`../GOCLMCP` sibling without running Git, npm, Docker, Fern, tests, builds, or
Clockify API calls.

`make developer-environment` also builds the repo-doctor report in memory and checks its generated shape: `network: "none"`, empty `commandsExecuted`, false environment capture flags, and required check IDs for root, package script, Fern, and GOCLMCP coverage. Developer environment contract shape is part of readiness too: schema version, purpose, safe repo-relative paths, package contracts, Fern paths, repo-doctor generated-report metadata, and supporting doc marker lists are checked before environment metadata is trusted.
