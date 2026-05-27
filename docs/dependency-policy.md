# Dependency and Tooling Policy

This repo does not buy generator-platform guarantees, so dependency changes need explicit local proof.

## Pinned generator stack

| Tool | Current pin | Change rule |
|---|---:|---|
| Fern CLI | `5.37.9` | Do not change without full `make perfect-full` proof. |
| Fern TypeScript generator | `fernapi/fern-typescript-node-sdk:3.71.2` | Do not change without full `make perfect-full` proof and SDK surface diff review. |
| Fern Python generator | `fernapi/fern-python-sdk:5.14.3` | Treat as secondary spec-smoke tooling. |
| Fern Postman generator | `fernapi/fern-postman:0.6.1` | Treat as secondary visual/spec-smoke tooling. |

## Package runtime floors

| Package | Node floor |
|---|---:|
| `clockify-sdk-ts-115` | `>=20` |
| `@clockify115/cli` | `>=20` |
| `@clockify115/mcp-server` | `>=20` |

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
| `@clockify115/cli` | `cli-table3`, `commander`, `picocolors` | Uses `clockify-sdk-ts-115` as a peer dependency and `file:../wrapper` as the local dev dependency. |
| `@clockify115/mcp-server` | `@modelcontextprotocol/sdk`, `zod` | Uses `clockify-sdk-ts-115` as a peer dependency and `file:../wrapper` as the local dev dependency. |

Each package keeps its own `package-lock.json` next to its manifest.
`make dependency-boundary` checks that every lockfile uses npm lockfile
version 3 and that the lockfile root package name/version matches the
corresponding `package.json`. Dependency changes should therefore update
the manifest and lockfile together, using the package-local npm install
workflow instead of hand-editing only one side.

Do not import from `output/ts-sdk`, `wrapper/src`, or any other
generated-core path in CLI/MCP product code. Those paths are build
inputs, not stable public dependencies.

## Update rules

- Do not change CI/CD, auth, provenance, or npm publish behavior casually.
- Run package gates for the package whose dependencies changed.
- Run `make pack-smoke` after changes that affect package exports, bins, files, or build output.
- Run `make generator-comparison` after Fern, OpenAPI, or sync changes.
- Run `make performance-budgets` after dependency changes that can affect startup or package size.
- Add a changelog entry for user-visible package behavior changes.

## Security posture

- Never commit API keys or workspace IDs.
- Keep `CLOCKIFY_BASE_URL` limited to mock/replay/private test environments.
- Never run live tests against customer workspaces.
