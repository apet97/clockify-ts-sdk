# Changelog

All notable changes to `@clockify115/cli` are documented here.

## [Unreleased]

### Added

- Added `clk115 api <method> <path>` for scriptable direct API calls through the
  generated SDK client's fetch layer, with `--query`, `--header`, `--body`
  (inline/`@file`/stdin), `--all` page/page-size walking, and `--include-headers`.
- Added `--output table|json|ndjson`, `--compact`, and `--select <dot-path>`
  output controls for automation. `--json` remains a shortcut for `--output json`.
- Added `CLOCKIFY_BASE_URL` and `--base-url` for deterministic mock/replay testing.
- Added `clk115 completion [zsh|bash|fish]` shell completion generation.
- Added `clk115 doctor` local diagnostics for config, runtime, base URL, and next-step readiness without contacting Clockify.
- Added generated CLI command table metadata.
- Added JSON error payloads with stable code, recovery, and retryability fields.
- Added exit-code contract tests for success, runtime errors, and commander usage errors.
- Added focused unit tests for the `audit-log search`, `start`, and `log` commands
  (required-field rejection, list splitting, authors-mode toggle, page bounds,
  name→ID resolution, and duration/end derivation).

### Fixed

- `clk115 api` now attaches the HTTP status to the error it throws on a non-2xx
  response, so the status-based classifier wins. A 404 whose body mentions a
  trigger word (e.g. "workspace") is no longer misclassified as
  `auth_or_permission`.

### Changed

- `--base-url` / `CLOCKIFY_BASE_URL` is now validated against the SDK Clockify host allowlist: only an official Clockify API host or a loopback host is accepted, arbitrary hosts are rejected with a clear message (strict by default — the CLI never opts in to insecure hosts). Help text updated.
- Commander usage errors now return exit code `2`, matching the documented CLI contract.
- Added `exports` field to the package manifest so consumers can use the package self-reference; only `./dist/index.js` is exposed.
- Migrated the SDK dev dependency from `file:../wrapper` to a workspace link (`"*"`). The peer dependency `clockify-sdk-ts-115 >=0.9.0` is unchanged for published consumers.
- Regenerated the shared error-code module to drop an unnecessary non-null assertion flagged by `typescript-eslint/no-unnecessary-type-assertion`.

### Internal

- Added an ESLint flat config (`eslint.config.mjs` + `tsconfig.lint.json`) and a
  `lint` script for the hand-written CLI surface, wired into `make lint`, CI, and
  `make perfect-fast`. Fixed what it surfaced: the table-cell formatter no longer
  risks `[object Object]` for unserializable values, and `start.ts` uses the
  exported `ClockifyClient` type directly instead of a type-only helper shim.
  The ESLint toolchain (`eslint`, `typescript-eslint`, `eslint-plugin-import-x`)
  is declared as explicit devDependencies rather than relying on workspace hoisting.

## [0.1.0] - 2026-05-26

### Added

- Initial `@clockify115/cli` package with `clockify115` and `clk115` binaries.
- Added Clockify status, list, create/update/delete, reporting-adjacent, and admin command groups on top of `clockify-sdk-ts-115`.
- Added JSON output mode for automation and human-readable table output for terminal use.
