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
`published_pending_registry`, `published_now`, `already_present_matching`,
`failed`, and `mismatch`. The tested boundary helper
`scripts/release-publish.mjs` records `published_pending_registry`
immediately after a successful `npm publish` command, before registry
propagation is assumed. It retries bounded 404 propagation, records an exact
matching `dist.integrity` as `published_now` or
`already_present_matching`, and makes an empty, malformed, unavailable, or
mismatched response fatal. A propagation timeout preserves the pending
publication evidence and must not be retried blindly. The
`publish-command-succeeded` transition is the durable boundary for that
pending publication. The separate
`scripts/release-attestation.mjs` boundary distinguishes a present, absent,
malformed, or failed provenance query; `verified` requires a matching
publication, passed registry smoke, and present provenance attestation. An
`integrity_mismatch` is terminal. A malformed or schema-mismatched existing
receipt exits with code 2 and is never replaced. Metadata is initialized once
and cannot be changed by later named transitions; there is no arbitrary receipt
key setter.

`proof_only` remains a state-engine value for non-publishing receipts and
deterministic transition tests; no publish-capable workflow exposes a manual
trigger.

The shared bounded registry harness is `scripts/registry-smoke.mjs` with
`sdk`, `cli`, and `mcp` subcommands. It installs an exact version into a
temporary consumer, captures command output, enforces a total timeout, and
cleans up in `finally`. SDK checks cover ESM import, CJS require, and required
exports; CLI checks execute both bins with exact version equality and `--help`;
MCP checks perform initialize, initialized notification, and `tools/list` over
stdio before bounded termination. The deterministic proof is wired into
`make release-support-contract`.

Release workflow handoffs initialize the receipt before source ancestry proof.
After initialization, both success and failure require the receipt printed in
the job log and uploaded as a receipt artifact. The
summary is written to `$GITHUB_STEP_SUMMARY`; evidence-critical finalization
does not use `|| true`, and missing receipt files fail the upload step.
External writes remain `tag-push-only`, release workflows use no live Clockify credentials,
and the receipt upload uses the pinned
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` action.

## Public packages

| Package | User surface | Support promise |
|---|---|---|
| `clockify-sdk-ts-115` | TypeScript SDK wrapper, public exports, subpaths, examples, and TypeDoc. | Keep additive changes source-compatible whenever practical before `1.0.0`; document any break in the migration guide and changelog. |
| `@apet97/clockify-cli-115` | `clockify115` and `clk115` binaries, command names, global flags, JSON output, and exit codes. | Preserve command names and JSON/exit contracts; add aliases before removals. |
| `@apet97/clockify-mcp-115` | Version `6.0.0`: `clockify115-mcp`, `clockify115-mcp-http`, `clockify115-mcp-admin`, `./http`, authenticated stateless HTTP, `ui://clockify115/reports-dashboard`, tool names, envelopes, output schemas, resources, and prompts. | Preserve binary, export, tool, resource, prompt, and structured-receipt contracts. Add replacements before removals, and document transport or authorization breaks in the migration guide and changelog. |

The remote binary is a self-hosted service surface. Publication provides the
software and portable deployment assets; it does not claim that this repository
operates a public endpoint or provisions OAuth, PostgreSQL, TLS, or secrets.

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
`package.json`, verifies the tagged commit is reachable from `origin/main`,
runs generator drift and fixture proof plus `make contract-gates` and
`make release-proof`, publishes with
provenance via OIDC (`id-token: write` + `publishConfig.provenance: true`), and
requires the `NPM_TOKEN` repo secret.

The CLI and MCP server peer-depend on `clockify-sdk-ts-115`, so publish the SDK
(`wrapper-v*`) before pushing `cli-v*` / `mcp-v*`. The publish-capable workflows are tag-only.
The read-only `.github/workflows/ci.yml` workflow is the
manual proof surface and has no npm publication credentials or commands.
Changing release triggers, auth, or provenance is a deliberate maintainer
action — not routine polish.

External writes remain tag-push-only; the tag path uses the tested publish and
attestation boundary helpers and queries `npm view dist.integrity` before
treating an already-published version as matching.

The workflow definition comes from the tagged commit. Local checks validate the
current definition but cannot make an older committed workflow inherit newer
guards or configure remote tag/environment rules. Maintainers must preserve
external evidence that matching release tags cannot target pre-hardening
commits and that npm/GitHub release credentials are protected.

## MCPB release assets

The MCP package can also be distributed as a Claude Desktop one-click `.mcpb`
bundle. Local validation is split deliberately:

- `make mcpb-validate` checks `mcp/manifest.json` and is part of the normal
  deterministic gate.
- `make mcpb-smoke` is a maintainer handoff gate: it builds the bundle, then runs
  the pinned `@anthropic-ai/mcpb` inspector against `mcp/clockify115-mcp-*.mcpb`.

The tag-triggered MCP release workflow attaches the `.mcpb` and SPDX files to
the GitHub Release only after `make mcpb-smoke` and the remaining release gates
pass. `perfect-fast`, `perfect-full`, and the manual CI workflow never attach
release assets.

## Security support

Security intake is documented in `SECURITY.md`. Security fixes use the
same support window above, but private triage and coordinated
disclosure take precedence over normal release cadence.
