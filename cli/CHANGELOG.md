# Changelog

All notable changes to `@clockify115/cli` are documented here.

## [Unreleased]

### Added

- Added `CLOCKIFY_BASE_URL` and `--base-url` for deterministic mock/replay testing.
- Added `clk115 completion [zsh|bash|fish]` shell completion generation.
- Added `clk115 doctor` local diagnostics for config, runtime, base URL, and next-step readiness without contacting Clockify.
- Added generated CLI command table metadata.
- Added JSON error payloads with stable code, recovery, and retryability fields.
- Added exit-code contract tests for success, runtime errors, and commander usage errors.

### Changed

- Commander usage errors now return exit code `2`, matching the documented CLI contract.
- Added `exports` field to the package manifest so consumers can use the package self-reference; only `./dist/index.js` is exposed.

## [0.1.0] - 2026-05-26

### Added

- Initial `@clockify115/cli` package with `clockify115` and `clk115` binaries.
- Added Clockify status, list, create/update/delete, reporting-adjacent, and admin command groups on top of `clockify-sdk-ts-115`.
- Added JSON output mode for automation and human-readable table output for terminal use.
