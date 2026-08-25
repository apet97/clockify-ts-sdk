# Current release decision

## Decision

**Released.** The coordinated package set published from merged `main` source
`b2d1d92bf741c2511120c803d419f4463c7ab790` is:

- SDK: `5.1.1` — `clockify-sdk-ts-115` (`wrapper-v5.1.1`)
- CLI: `5.0.3` — `@apet97/clockify-cli-115` (`cli-v5.0.3`)
- TypeScript MCP: `6.0.0` — `@apet97/clockify-mcp-115` (`mcp-v6.0.0`)

All three lightweight tags resolve directly to that source commit. Their exact
registry integrity and publication timestamps are recorded in
[`release-decision-registry-receipt.json`](./release-decision-registry-receipt.json)
from fresh read-only npm queries. Each release workflow verified the packed
artifact against the registry, installed it from npm, found SLSA provenance,
and created the corresponding GitHub release. The SDK release includes its SPDX
SBOM; the MCP release includes its self-contained `.mcpb` and SPDX SBOM.
Publication remains tag-gated CI.

The SDK and CLI take patch bumps for routing, validation, paging, output, and
recovery fixes without public export or command-name changes. The MCP takes a
major bump because `buildServer` now returns the v2 `McpServer`; it also adds
the `./http` export and two binaries while retaining all 163 tool names. The
exact surface result and migration boundary are recorded in
[`migration-guide.md`](./migration-guide.md).

The version-bumped governed inputs passed the fresh sacrificial-workspace
evidence campaign and separate approval of its exact manifest and campaign
receipt hashes. Deterministic, release, package, and GitHub-only mutation proof
was green before publication; the exact-source MCP mutation run scored 86.86%
for `mcp/src/result.ts` against its 85% floor. Both consumers continue to
declare `clockify-sdk-ts-115 ^5`.

The 1.0 surface classification that gated the first major is complete and
retained in
[`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md):
every SDK symbol and subpath carries a maintainer decision, and the generator
fails closed on any symbol that lacks one.

## What this document does not do

It records the explicitly authorized 2026-08-25 release and its completed proof
state. It does not authorize a later release.
Publication stays tag-gated CI — pushing a prefixed tag is the only path, and
[`../AGENTS.md`](../AGENTS.md) §12 keeps release-setting changes out of scope
for routine work.

## Before the next coordinated release

- Bump from the published baseline SDK `5.1.1`, CLI `5.0.3`, and MCP `6.0.0`;
  never reuse these versions for different bytes.
- Obtain fresh exact-hash live-evidence approval and record currentness after all
  governed release inputs stop changing.
- Confirm the CLI and MCP peer ranges still match the SDK major, and that
  `make version-consistency` reconciles all three manifests, the retained
  release-please manifest, the generated runtime constants, and the MCP bundle
  manifest.
- Publish the SDK first and verify its registry/provenance receipt before the
  CLI and MCP.
- Run `make perfect-full` and `make release-proof`, and dispatch the manual
  **Mutation** workflow. `perfect-full` and the full mutation run stay outside
  push CI; each package release workflow reruns `release-proof` before publish.
