# Release and Support Policy

This repo's three packages are published to npm under the unofficial
`@apet97` scope (and the unscoped `clockify-sdk-ts-115`) — community-built,
not affiliated with CAKE.com or Clockify (see `NOTICE.md`). Publication is a
deliberate, tag-gated CI action: npm publication is not the default path for
routine changes (the default local loop stays `make pack-smoke`). Release
readiness means the SDK, CLI, MCP server, generated OpenAPI snapshot, docs,
and proof receipts agree before anyone ships an artifact.

## Exact-artifact release state

Release workflows use the fail-closed state engine in
`scripts/release-state.mjs`, backed by the exact schema in
`docs/release-support-contract.json`. It writes a redacted receipt with
`scripts/lib/release-state.mjs` using an atomic same-directory temporary file,
`fsync`, and `rename`. The receipt records the source SHA, package manifest
version, local artifact path and integrity, publication mode, verification
states (`registrySmoke`, attestation, and GitHub Release), and final status.

The allowed publication modes are `not_attempted`, `proof_only`,
`published_now`, `already_present_matching`, `failed`, and `mismatch`.
`published_now` and `already_present_matching` require exact equality between
the local sha512 artifact integrity and the value returned by
`npm view dist.integrity`; an `integrity_mismatch` is terminal. A malformed or
schema-mismatched existing receipt exits with code 2 and is never replaced.
Metadata is initialized once and cannot be changed by later named
transitions; there is no arbitrary receipt key setter.

The shared bounded registry harness is `scripts/registry-smoke.mjs` with
`sdk`, `cli`, and `mcp` subcommands. It installs an exact version into a
temporary consumer, captures command output, enforces a total timeout, and
cleans up in `finally`. SDK checks cover ESM import, CJS require, and required
exports; CLI checks execute both bins with exact version equality and `--help`;
MCP checks perform initialize, initialized notification, and `tools/list` over
stdio before bounded termination. The deterministic proof is wired into
`make release-support-contract`.

Release workflow handoffs require the receipt printed in the job log and
uploaded as a receipt artifact on both success and failure. The summary is
written to `$GITHUB_STEP_SUMMARY`; external writes remain `tag-push-only`,
release workflows use no live Clockify credentials, and the receipt upload
uses the pinned
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` action.

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

Manual dispatch is proof-only: it may build and pack an exact artifact but it
does not publish, move tags, or create/edit a GitHub Release. The final receipt
for that path is `proof_only`, never a published status. External writes remain
tag-push-only and later workflow steps must query `npm view dist.integrity`
before treating an already-published version as matching. There is no GitHub Release on dispatch.

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
