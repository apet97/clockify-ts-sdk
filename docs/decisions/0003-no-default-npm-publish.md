# 0003: Packages are packable, but npm publication is not default

## Status

Accepted. Updated 2026-06-28: tag-gated npm publication enabled under the
unofficial `@apet97` scope (the default dev loop is still packable-only).

## Context

The repo ships three npm package manifests and keeps `publishConfig`
plus `prepublishOnly` scripts. Those settings make a future publish path
safer, but they are not permission to publish from a developer laptop or
automation path.

The package name suffixes are intentional, and release automation has
known legacy risk that needs a maintainer decision before use.

## Decision

Do not publish by default — nothing publishes on a routine commit. Publication is deliberate and tag-gated: a pushed prefixed version tag (`wrapper-v*`/`cli-v*`/`mcp-v*`) publishes via CI with provenance under the unofficial `@apet97` scope. Keep package manifests packable and publish-safe; prepublishOnly remains present in each manifest; keep provenance enabled; and require explicit maintainer approval before changing release workflow triggers or auth.

## Consequences

- Local readiness means packable and smoke-tested; publishing is a separate,
  deliberate tag push.
- Release workflow trigger/auth changes remain out of scope without explicit
  approval.
- The risk register keeps release automation risk visible.

## Proof

- `make package-contract`
- `make supply-chain`
- `make release-support-contract`
- `make risk-register`
- `make pack-smoke`
