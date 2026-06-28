# Release and Support Policy

This repo's three packages are published to npm under the unofficial
`@apet97` scope (and the unscoped `clockify-sdk-ts-115`) — community-built,
not affiliated with CAKE.com or Clockify (see `NOTICE.md`). Publication is a
deliberate, tag-gated CI action: npm publication is not the default path for
routine changes (the default local loop stays `make pack-smoke`). Release
readiness means the SDK, CLI, MCP server, generated OpenAPI snapshot, docs,
and proof receipts agree before anyone ships an artifact.

## Public packages

| Package | User surface | Support promise |
|---|---|---|
| `clockify-sdk-ts-115` | TypeScript SDK wrapper, public exports, subpaths, examples, and TypeDoc. | Keep additive changes source-compatible whenever practical before `1.0.0`; document any break in the migration guide and changelog. |
| `@apet97/clockify-cli-115` | `clockify115` and `clk115` binaries, command names, global flags, JSON output, and exit codes. | Preserve command names and JSON/exit contracts; add aliases before removals. |
| `@apet97/clockify-mcp-115` | `clockify115-mcp` binary, tool names, envelopes, output schemas, resources, and prompts. | Preserve tool names and structured receipts; add replacement tools before removals. |

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
7. Capture command receipts from command output.
8. Run the full deterministic proof (`make perfect-full`) immediately before the
   release tag or handoff, only after the command receipts are complete.

Do not run `npm publish` from a developer laptop without explicit
maintainer approval. Do not change CI/CD, provenance, auth, or release
workflow triggers as part of routine SDK polish.

## npm publish (enabled — unofficial `@apet97` scope)

All three packages publish to npm via tag-triggered CI on a pushed prefixed
tag whose version matches the package's `package.json`:

| Package | Tag | Workflow |
|---|---|---|
| `clockify-sdk-ts-115` | `wrapper-v*.*.*` | `.github/workflows/release.yml` |
| `@apet97/clockify-cli-115` | `cli-v*.*.*` | `.github/workflows/ci-cli-release.yml` |
| `@apet97/clockify-mcp-115` | `mcp-v*.*.*` | `.github/workflows/ci-mcp-release.yml` |

The `@apet97` scope and `-115` suffix are deliberate trademark distance: these
are unofficial, community-built packages, not affiliated with CAKE.com or
Clockify (see `NOTICE.md`). Each workflow verifies the tag matches
`package.json`, publishes with provenance via OIDC (`id-token: write` +
`publishConfig.provenance: true`), and requires the `NPM_TOKEN` repo secret. A
manual `workflow_dispatch` run only builds and dry-run packs — the publish step
is gated to tag pushes.

The CLI and MCP server peer-depend on `clockify-sdk-ts-115`, so publish the SDK
(`wrapper-v*`) before pushing `cli-v*` / `mcp-v*`. Changing release triggers,
auth, or provenance is a deliberate maintainer action — not routine polish.

## MCPB release assets

The MCP package can also be distributed as a Claude Desktop one-click `.mcpb`
bundle. Local validation is split deliberately:

- `make mcpb-validate` checks `mcp/manifest.json` and is part of the normal
  deterministic gate.
- `make mcpb-smoke` is a maintainer handoff gate: it builds the bundle, then runs
  the pinned `@anthropic-ai/mcpb` inspector against `mcp/clockify115-mcp-*.mcpb`.

Attaching the `.mcpb` file to a GitHub Release is a maintainer action after
`make mcpb-smoke`; it is not performed by `perfect-fast`, `perfect-full`, or npm
publish workflows.

## Security support

Security intake is documented in `SECURITY.md`. Security fixes use the
same support window above, but private triage and coordinated
disclosure take precedence over normal release cadence.
