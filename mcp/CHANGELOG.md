# Changelog

All notable changes to `@clockify115/mcp-server` are documented here.

## [Unreleased]

### Added

- Added read-only reports tools: `clockify_reports_summary`,
  `clockify_reports_detailed`, `clockify_reports_weekly`, and
  `clockify_reports_attendance` run the Clockify report endpoints over a date
  range, exposing the always-required filter and passing any other report field
  through `extra`.
- Added read-only agent discovery tools: `clockify_docs_search`,
  `clockify_operation_guide`, and `clockify_sdk_snippet` map a task to the
  recommended SDK imports, CLI examples, MCP tools, and next steps without
  loading the full domain catalog.
- Added the `clockify://guide/agent-mode` resource describing those tools.
- Added `CLOCKIFY_BASE_URL` for mock/replay environments.
- Added a shared MCP result output schema to every advertised tool.
- Added MCP guide resources and a workflow-planning prompt.
- Added deterministic mock Clockify server coverage for `clockify_status`.

### Changed

- `loadContext()` now rejects a `CLOCKIFY_BASE_URL` that points at a non-Clockify, non-loopback host (the SDK base-URL host allowlist), so a tampered env var cannot redirect authenticated MCP traffic off-host. A trusted proxy can opt in via `LoadContextOptions.allowInsecureBaseUrl: true`.
- MCP recoverable errors now use the shared error-code registry for default recovery hints.
- Migrated the SDK dev dependency from `file:../wrapper` to a workspace link (`"*"`). The peer dependency `clockify-sdk-ts-115 >=0.9.0` is unchanged for published consumers.
- Regenerated the shared error-code module to drop an unnecessary non-null assertion flagged by `typescript-eslint/no-unnecessary-type-assertion`.

### Internal

- Added an ESLint flat config (`eslint.config.mjs` + `tsconfig.lint.json`) and a
  `lint` script for the hand-written server surface, wired into `make lint`, CI,
  and `make perfect-fast`. Fixed what it surfaced: tightened two webhook-URL
  classifier return types and the day-review issue-list typing. The ESLint
  toolchain (`eslint`, `typescript-eslint`, `eslint-plugin-import-x`) is declared
  as explicit devDependencies rather than relying on workspace hoisting.

## [0.3.0] - 2026-05-26

### Added

- Added 16 workflow tools: `clockify_tools_guide`, `clockify_create_work_package`, `clockify_log_work`, `clockify_start_work`, `clockify_stop_work`, `clockify_switch_work`, `clockify_review_day`, `clockify_review_week`, `clockify_fix_entry`, `clockify_invoice_client_work`, `clockify_record_expense`, `clockify_request_time_off`, `clockify_schedule_work`, `clockify_setup_webhook`, `clockify_demo_seed`, and `clockify_demo_cleanup`.
- Documented the complete workflow-facing surface: `clockify_status`, `clockify_tools_guide`, `clockify_create_work_package`, `clockify_log_work`, `clockify_start_work`, `clockify_stop_work`, `clockify_switch_work`, `clockify_review_day`, `clockify_review_week`, `clockify_fix_entry`, `clockify_invoice_client_work`, `clockify_record_expense`, `clockify_request_time_off`, `clockify_schedule_work`, `clockify_setup_webhook`, `clockify_demo_seed`, and `clockify_demo_cleanup`.
- Added rich workflow envelopes with `entity`, `ids`, `changed.{created,updated,deleted,reused}`, `warnings`, and `next`.
- Added structured recovery guidance with `recovery.{hint,tool,args,retryable}`.
- Added short-lived, single-use confirmation tokens for dry-run previews.
- Added `loadContext(..., { hooks, fetch })` so callers can wire SDK fetch hooks such as `otelHooks()`.
- Added package exports for `./server` and `./client`.

### Changed

- Bumped the package to `0.3.0`.
- Updated the README around the 105-tool surface, workflow examples, envelopes, dry-run confirmation, and TypeScript-vs-Go positioning.

## [0.2.0] - 2026-05-26

### Added

- Added the 89-tool TypeScript MCP domain surface across Clockify's major resources.
