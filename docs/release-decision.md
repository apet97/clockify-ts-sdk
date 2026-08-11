# Current release decision

## Decision

**Released.** The coordinated public package versions are:

- SDK: `5.1.0`
- CLI: `5.0.2`
- TypeScript MCP: `5.0.2`

All three packages were published on 2026-08-11 from merged `main` commit
`94fe318f473daa9eda7b3cfc038a51429c3dee14` through `wrapper-v5.1.0`,
`cli-v5.0.2`, and `mcp-v5.0.2`. Each tag resolves to that commit. Registry
integrity, npm provenance, and fresh registry installs were verified. The
`mcp-v5.0.2` GitHub release carries its `.mcpb` bundle and SPDX SBOM,
attached by the release workflow itself. The exact registry values are
recorded in
[`release-decision-registry-receipt.json`](./release-decision-registry-receipt.json).
Both consumers continue to declare `clockify-sdk-ts-115 ^5`.

The `wrapper-v5.1.0` and `cli-v5.0.2`/`mcp-v5.0.2` tags needed two
live-evidence-currentness re-attestations before the version-bump commit
went green: the first campaign's captured input fingerprint went stale when
`package-lock.json`'s wrapper entry (still `5.0.2` after the semver
correction to `5.1.0`) had to be fixed by a follow-up `npm install`,
caught by `dependency-boundary` in CI. A second campaign run against the
sandbox workspace, approved by `apet97-via-sonnet5`
(`docs/live-evidence-approval.json`), produced the fingerprint that matches
the commit that actually shipped.

The SDK takes a minor bump to `5.1.0`: it adds the `classifyWriteOutcome`
write-outcome classifier and `PaginatedList#collect()`, both new public
exports, so `published-surface-diff` requires at least a minor version per
semver over a patch bump. The CLI and TypeScript MCP take patch bumps to
`5.0.2`: CLI help-text examples on every leaf command, an MCP tool-schema
emitter, and an MCP fail-closed fix for `clockify_tools_guide` before setup —
no command or tool surface changed. Nothing removes a public name or changes
an accepted request shape. [`migration-guide.md`](./migration-guide.md)
retains the 5.0 major-migration context.

The 1.0 surface classification that gated the first major is complete and
retained in
[`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md):
every SDK symbol and subpath carries a maintainer decision, and the generator
fails closed on any symbol that lacks one.

## What this document does not do

It records the release decision that was taken and its proof. It does not
authorize a later release.
Publication stays tag-gated CI — pushing a prefixed tag is the only path, and
[`../AGENTS.md`](../AGENTS.md) §12 keeps release-setting changes out of scope
for routine work.

## Before the next coordinated release

- Re-read the public SDK surface classification and the compatibility impact of
  anything added since 5.1.0 (SDK) / 5.0.2 (CLI, MCP).
- Confirm the CLI and MCP peer ranges still match the SDK major, and that
  `make version-consistency` reconciles all three manifests, the retained
  release-please manifest, the generated runtime constants, and the MCP bundle
  manifest.
- Take fresh exact-artifact, registry, provenance, SBOM, and GitHub-release
  receipts. If publication succeeded before a later step failed, reconcile the
  exact existing artifact; never publish different bytes under the same version.
- Run `make perfect-full` and `make release-proof`, and dispatch the manual
  **Mutation** workflow. None of the three is wired into CI.
