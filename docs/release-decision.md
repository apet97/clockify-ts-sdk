# Current release decision

## Decision

**Approved release candidate.** The source package versions prepared for the
next tag-gated release are:

- SDK: `5.0.1`
- CLI: `5.0.1`
- TypeScript MCP: `5.0.1`

The public npm versions remain `5.0.0` until `wrapper-v5.0.1`, `cli-v5.0.1`,
and `mcp-v5.0.1` complete their release workflows. Both consumers continue to
declare `clockify-sdk-ts-115 ^5`. Do not describe this candidate as published
until registry integrity, provenance, GitHub releases, and required assets are
verified.

5.0.1 is a patch release. It hardens error parsing, input validation, paging,
routing, receipts, confirmation storage, live-proof isolation, and SDK release
evidence without removing a public name or changing an accepted request shape.
[`migration-guide.md`](./migration-guide.md) retains the 5.0 major-migration
context.

The 1.0 surface classification that gated the first major is complete and
retained in
[`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md):
every SDK symbol and subpath carries a maintainer decision, and the generator
fails closed on any symbol that lacks one.

## What this document does not do

It records the release candidate decision and its required proof. It does not
authorize a later release.
Publication stays tag-gated CI — pushing a prefixed tag is the only path, and
[`../AGENTS.md`](../AGENTS.md) §12 keeps release-setting changes out of scope
for routine work.

## Required before publishing this coordinated release

- Re-read the public SDK surface classification and the compatibility impact of
  anything added since 5.0.0.
- Confirm the CLI and MCP peer ranges still match the SDK major, and that
  `make version-consistency` reconciles all three manifests, the retained
  release-please manifest, the generated runtime constants, and the MCP bundle
  manifest.
- Take fresh exact-artifact, registry, provenance, SBOM, and GitHub-release
  receipts. If publication succeeded before a later step failed, reconcile the
  exact existing artifact; never publish different bytes under the same version.
- Run `make perfect-full` and `make release-proof`, and dispatch the manual
  **Mutation** workflow. None of the three is wired into CI.
