# Release and Support Policy

This repo is packable, but npm publication is not the default path.
Release readiness means the SDK, CLI, MCP server, generated OpenAPI
snapshot, docs, and proof receipts agree before anyone ships an
artifact.

## Public packages

| Package | User surface | Support promise |
|---|---|---|
| `clockify-sdk-ts-115` | TypeScript SDK wrapper, public exports, subpaths, examples, and TypeDoc. | Keep additive changes source-compatible whenever practical before `1.0.0`; document any break in the migration guide and changelog. |
| `@clockify115/cli` | `clockify115` and `clk115` binaries, command names, global flags, JSON output, and exit codes. | Preserve command names and JSON/exit contracts; add aliases before removals. |
| `@clockify115/mcp-server` | `clockify115-mcp` binary, tool names, envelopes, output schemas, resources, and prompts. | Preserve tool names and structured receipts; add replacement tools before removals. |

## Version support

| Line | Support |
|---|---|
| `0.x` | Latest minor only. This is pre-`1.0.0`, but public breaks still need changelog and migration notes. |
| `1.x+` | Latest minor of the latest major. Older majors receive fixes only when migration is not practical and the patch is low risk. |

The three package versions do not have to be identical, but any
user-visible change must land in the touched package changelog and
the generated product surface must be refreshed.

## Release readiness checklist

Before a maintainer intentionally ships or hands off artifacts:

1. Update package changelogs for every touched package.
2. Refresh generated metadata when package names, versions, commands,
   MCP tools, errors, or operation mappings change.
3. Run `make perfect-fast`.
4. Run `make perfect-full` before a broad readiness or release claim.
5. Run `make pack-smoke` before trusting tarballs.
6. Run `make perfect-live` only against the sacrificial sandbox. A concrete
   live-proof deferral can explain a draft blocker, but final readiness requires
   completed sandbox live proof.
7. Fill `docs/final-proof-receipt.md` from command output.
8. Remove `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md`
   only after the final proof receipt is complete and immediately before
   `make final-proof-final`.

Do not run `npm publish` from a developer laptop without explicit
maintainer approval. Do not change CI/CD, provenance, auth, or release
workflow triggers as part of routine SDK polish.
## Security support

Security intake is documented in `SECURITY.md`. Security fixes use the
same support window above, but private triage and coordinated
disclosure take precedence over normal release cadence.
