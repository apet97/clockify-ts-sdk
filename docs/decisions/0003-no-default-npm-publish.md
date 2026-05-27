# 0003: Packages are packable, but npm publication is not default

## Status

Accepted.

## Context

The repo ships three npm package manifests and keeps `publishConfig`
plus `prepublishOnly` scripts. Those settings make a future publish path
safer, but they are not permission to publish from a developer laptop or
automation path.

The package name suffixes are intentional, and release automation has
known legacy risk that needs a maintainer decision before use.

## Decision

Do not publish by default. Keep package manifests packable and publish-safe; prepublishOnly remains present in each manifest; keep provenance enabled for any future publish; and require explicit maintainer approval before running `npm publish` or changing release workflow behavior.

## Consequences

- Local readiness means packable and smoke-tested, not published.
- Release workflow changes remain out of scope without explicit approval.
- The risk register must keep release automation risk visible until a
  maintainer chooses to address it.

## Proof

- `make package-contract`
- `make supply-chain`
- `make release-support-contract`
- `make risk-register`
- `make pack-smoke`
