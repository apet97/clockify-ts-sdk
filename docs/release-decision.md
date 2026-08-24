# Current release decision

## Decision

**Pending.** The coordinated release candidates are:

- SDK: `5.1.1`
- CLI: `5.0.3`
- TypeScript MCP: `6.0.0`

The latest verified public set remains SDK `5.1.0`, CLI `5.0.2`, and MCP
`5.0.2`; its registry values remain in
[`release-decision-registry-receipt.json`](./release-decision-registry-receipt.json)
until the candidate tags publish and fresh read-only registry proof replaces
that receipt. Publication remains tag-gated CI.

The SDK and CLI take patch bumps for routing, validation, paging, output, and
recovery fixes without public export or command-name changes. The MCP takes a
major bump because `buildServer` now returns the v2 `McpServer`; it also adds
the `./http` export and two binaries while retaining all 163 tool names. The
exact surface result and migration boundary are recorded in
[`migration-guide.md`](./migration-guide.md).

Before tags are created, the version-bumped governed inputs require a fresh
sacrificial-workspace evidence campaign, separate approval of its exact two
artifact hashes, and green deterministic, release, package, and GitHub-only
mutation proof. Both consumers continue to declare `clockify-sdk-ts-115 ^5`.

The 1.0 surface classification that gated the first major is complete and
retained in
[`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md):
every SDK symbol and subpath carries a maintainer decision, and the generator
fails closed on any symbol that lacks one.

## What this document does not do

It records the explicitly authorized 2026-08-24 release decision and its
current proof state. It does not authorize a later release.
Publication stays tag-gated CI — pushing a prefixed tag is the only path, and
[`../AGENTS.md`](../AGENTS.md) §12 keeps release-setting changes out of scope
for routine work.

## Before publishing this coordinated release

- Obtain the exact-hash live-evidence approval and record currentness after all
  governed release inputs stop changing.
- Confirm the CLI and MCP peer ranges still match the SDK major, and that
  `make version-consistency` reconciles all three manifests, the retained
  release-please manifest, the generated runtime constants, and the MCP bundle
  manifest.
- Push `wrapper-v5.1.1` first and verify its registry/provenance receipt before
  `cli-v5.0.3` and `mcp-v6.0.0`; never reuse a version for different bytes.
- Run `make perfect-full` and `make release-proof`, and dispatch the manual
  **Mutation** workflow. None of the three is wired into CI.
