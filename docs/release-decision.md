# Current release decision

## Decision

**Released.** The coordinated set is SDK `2.0.0`, CLI `2.0.0`, and TypeScript
MCP `2.0.0`, published to npm on 2026-08-07 from the `wrapper-v2.0.0`,
`cli-v2.0.0` and `mcp-v2.0.0` tags. Both consumers declare
`clockify-sdk-ts-115 ^2`.

2.0.0 is a major because three wire contracts changed shape and one deprecated
alias was removed. [`migration-guide.md`](./migration-guide.md) shows every
before/after; the evidence for each is in
[`../spec/evidence/discrepancies.md`](../spec/evidence/discrepancies.md).

The 1.0 surface classification that gated the first major is complete and
retained in
[`one-point-zero-surface-inventory.md`](./one-point-zero-surface-inventory.md):
every SDK symbol and subpath carries a maintainer decision, and the generator
fails closed on any symbol that lacks one.

## What this document does not do

It records the decision that was taken. It does not authorize the next one.
Publication stays tag-gated CI — pushing a prefixed tag is the only path, and
[`../AGENTS.md`](../AGENTS.md) §12 keeps release-setting changes out of scope
for routine work.

## Before the next coordinated release

- Re-read the public SDK surface classification and the compatibility impact of
  anything added since 2.0.0.
- Confirm the CLI and MCP peer ranges still match the SDK major, and that
  `make version-consistency` reconciles all three manifests, the retained
  release-please manifest, the generated runtime constants, and the MCP bundle
  manifest.
- Take fresh exact-artifact, registry and provenance receipts. Every 2.0.0
  release run reported `registry_propagation_timeout` *after* a successful
  publish — check npm before treating a red run as a failed one.
- Run `make perfect-full` and `make release-proof`, and dispatch the manual
  **Mutation** workflow. None of the three is wired into CI.
