# Changelog

All notable changes to `@clockify115/mcp-server` are documented here.

## [Unreleased]

### Added

- Added single-operation write tools: `clockify_approvals_resubmit` (resubmit
  entries for approval over a period), `clockify_invoices_import_time` (import
  time/expenses into an existing invoice), and `clockify_entries_mark_invoiced`
  (mark/unmark time entries invoiced). Project archiving and the `POST
  /time-entries` create are covered by `clockify_projects_update` (archived:true)
  and `clockify_entries_log` respectively; the dedicated `/projects/{id}/archive`
  route is not bound on the live API (see `spec/evidence/discrepancies.md`).
- Added expense write tools: `clockify_expenses_create` and
  `clockify_expenses_update`. Both expose the scalar expense fields (amount,
  category, project, date, notes, billable), default the user to the API-key
  owner, and — for update — derive Clockify's required `changeFields` list from
  the supplied fields. The upstream multipart `file` is optional in practice,
  so no binary upload is required.
- Completed the scheduling surface: `clockify_scheduling_publish` (publish draft
  assignments across a date range, optionally notifying users) and
  `clockify_scheduling_capacity` (per-user scheduled-capacity totals). The
  project-totals endpoint is already covered by
  `clockify_scheduling_assignments_list_per_project`; the users/totals endpoint
  is deferred because it returns HTTP 404 on the live API (see
  `spec/evidence/discrepancies.md`).
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
