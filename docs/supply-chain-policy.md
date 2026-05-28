# Supply Chain Policy

This repo ships packable SDK, CLI, and MCP packages. Even when npm
publication is not the default path, tarballs should look boring,
small, licensed, and provenance-ready.

## Package supply-chain rules

| Rule | Why it exists |
|---|---|
| Every public package manifest uses `license: MIT`. | Users and scanners can understand redistribution rights without reading repo history. |
| Every public package tarball includes `LICENSE` and `README.md`. | Packed artifacts remain self-describing outside the repo checkout. |
| Every public package manifest keeps `publishConfig.access: public` and `publishConfig.provenance: true`. | If a maintainer later publishes, npm access and provenance remain explicit by default. |
| Runtime dependencies stay intentionally small and are checked by `make dependency-boundary`. | Avoid accidental framework, AI SDK, HTTP client, or utility-library sprawl. |
| `prepublishOnly` remains present on every public package and includes type-check/test/build proof where the package has tests. | A future publish path inherits a local last-resort package gate instead of only emitting JavaScript. |
| Packages must not include `src`, tests, `node_modules`, examples, or generated docs in `files`. | Tarballs should contain built artifacts plus essential docs only. |
## Required receipts

Before claiming supply-chain readiness, run or cite:

- `make supply-chain`
- `make package-contract`
- `make dependency-boundary`
- `make pack-smoke`
- `make secret-hygiene`
- `make release-support-contract`

These checks do not publish anything. They only prove package
manifests, licenses, provenance settings, dependency boundaries, and
release policy remain aligned.
