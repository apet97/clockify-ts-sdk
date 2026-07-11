# Dependency and Tooling Policy

This repo does not buy generator-platform guarantees, so dependency changes need explicit local proof.

## Repo-owned local TypeScript generator

The default SDK generator is `scripts/generate-sdk-from-openapi.mjs`.
It reads `spec/corrected/clockify.corrected.openapi.yaml`, writes
`output/ts-sdk/**`, and is wired through `make sdk-codegen` before
`wrapper/scripts/sync-sdk.sh` refreshes `wrapper/src/**`.

This generator must remain reproducible without Docker, hosted generator
accounts, API tokens, or paid SDK-platform entitlements. Hosted generator
packages such as Fern, Stainless, and Speakeasy are forbidden dependency
shortcuts unless a maintainer explicitly reopens the generator strategy with
full `make perfect-full` proof.

## Historical generator stack

Fern is **not a dependency** of this repo. The SDK generator was migrated to the
repo-owned local generator in [ADR 0005](decisions/0005-local-typescript-generator.md);
the `x-fern-sdk-*` keys that remain in the corrected OpenAPI are vendor-extension
naming hints read by that local generator (`scripts/generate-sdk-from-openapi.mjs`),
not a build- or runtime dependency on Fern. The table below pins the archived Fern
stack as historical evidence only.

| Tool | Archived pin | Change rule |
|---|---:|---|
| Fern CLI | `5.37.9` | Historical evidence only; do not restore as a required SDK generation path without maintainer approval and full `make perfect-full` proof. |
| Fern TypeScript generator | `fernapi/fern-typescript-node-sdk:3.71.2` | Historical evidence only; do not restore as a required SDK generation path without maintainer approval and SDK surface diff review. |
| Fern Python generator | `fernapi/fern-python-sdk:5.14.3` | Historical evidence only; not part of the required TS SDK proof path. |
| Fern Postman generator | `fernapi/fern-postman:0.6.1` | Historical evidence only; not part of the required TS SDK proof path. |

## Package runtime floors

| Package | Node floor |
|---|---:|
| `clockify-sdk-ts-115` | `>=22.13.0` |
| `@apet97/clockify-cli-115` | `>=22.13.0` |
| `@apet97/clockify-mcp-115` | `>=22.13.0` |

The CLI and MCP package floors intentionally match the SDK floor.
They depend on `clockify-sdk-ts-115` as the runtime API client, so
advertising an older Node floor would create an install-time trap for
users who run package managers with engine checks enabled.

## Dependency boundaries

The package dependency shape is intentionally small and guarded by
`make dependency-boundary`:

The runtime dependency license and purpose ledger is guarded by
`make dependency-license`; update `docs/dependency-license-policy.md` and
`docs/dependency-license-contract.json` in the same change as any runtime
dependency change.

| Package | Runtime dependencies | SDK relationship |
|---|---|---|
| `clockify-sdk-ts-115` | None | Owns the generated SDK wrapper seam. |
| `@apet97/clockify-cli-115` | `cli-table3`, `commander`, `picocolors` | Uses `clockify-sdk-ts-115` as a peer dependency; local dev is resolved through the root npm workspace link. |
| `@apet97/clockify-mcp-115` | `@modelcontextprotocol/sdk`, `zod` | Uses `clockify-sdk-ts-115` as a peer dependency; local dev is resolved through the root npm workspace link. |

The three packages are wired as npm workspaces from the repo-root
`package.json`; a single root `package-lock.json` covers all of them.
`make dependency-boundary` checks that the root lockfile uses npm lockfile
version 3 and that the lockfile root package name/version matches the
corresponding `package.json`. Dependency changes should therefore update
the manifest and root lockfile together instead of hand-editing only one side.

Do not import from `output/ts-sdk`, `wrapper/src`, or any other
generated-core path in CLI/MCP product code. Those paths are build
inputs, not stable public dependencies.

## Update rules

- Do not change CI/CD, auth, provenance, or npm publish behavior casually.
- Run package gates for the package whose dependencies changed.
- Run `make pack-smoke` after changes that affect package exports, bins, files, or build output.
- Run `make generator-comparison` after local generator, OpenAPI, or sync changes.
- Run `make performance-budgets` after dependency changes that can affect startup or package size.
- Add a changelog entry for user-visible package behavior changes.

## Security posture

- Never commit API keys or workspace IDs.
- Keep `CLOCKIFY_BASE_URL` limited to mock/replay/private test environments.
- Never run live tests against customer workspaces.
