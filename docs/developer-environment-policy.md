# Developer Environment Policy

This repo uses npm workspaces from the root `package.json`. Setup should be
boring and explicit: install once from the root, build the package you are
working on, and run root gates when you need platform proof.

## Local runtime

| Requirement | Policy |
|---|---|
| Node.js | Use Node `>=22.13.0`. CI also exercises Node 22.13 and 24. |
| Package manager | Use `npm` with the root `package-lock.json`. |
| Root package | The root `package.json` owns the `wrapper`, `cli`, and `mcp` npm workspaces. |
| Local SDK generator | `scripts/generate-sdk-from-openapi.mjs` reads the corrected OpenAPI snapshot and emits `output/ts-sdk/**`. |
| Docker | Not required for TypeScript SDK codegen. Only use Docker for unrelated tooling that explicitly needs it. |
| GOCLMCP sibling | Required for canonical OpenAPI regeneration and full drift proof. The conventional path is `../GOCLMCP`. |

Package scripts are part of the environment contract, not incidental
metadata. In particular, `prepublishOnly` must keep the checked command
shape from `docs/package-contract.json`, so a future laptop publish path
cannot silently drop type-check or test proof.

## Setup recipes

SDK:

```bash
npm ci
make sdk-codegen
npm run build -w clockify-sdk-ts-115
```

CLI:

```bash
npm ci
make sdk-codegen
npm run build -w clockify-sdk-ts-115
npm run build -w @apet97/clockify-cli-115
```

MCP:

```bash
npm ci
make sdk-codegen
npm run build -w clockify-sdk-ts-115
npm run build -w @apet97/clockify-mcp-115
```

OpenAPI/local SDK generation:

```bash
(cd ../GOCLMCP && make gen-openapi)
cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml \
   spec/corrected/clockify.corrected.openapi.yaml
make sdk-codegen
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
repo shape, Node floor, workspace manifests, the root lockfile, required
scripts including exact `prepublishOnly` command shapes, local generator wiring, generated directory presence, and the conventional
`../GOCLMCP` sibling without running Git, npm, codegen, tests, builds, or
Clockify API calls.

`make developer-environment` also builds the repo-doctor report in memory and checks its generated shape: `network: "none"`, empty `commandsExecuted`, false environment capture flags, and required check IDs for root workspaces, package scripts, local codegen, and GOCLMCP coverage. Developer environment contract shape is part of readiness too: schema version, purpose, safe repo-relative paths, package contracts, local generator paths, repo-doctor generated-report metadata, and supporting doc marker lists are checked before environment metadata is trusted.
