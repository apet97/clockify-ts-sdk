# Changelog

All notable changes to `@clockify115/mcp-server` are documented here.

## [Unreleased]

### Added

- Added `mcp/tests/wire-shape.test.ts` locking the shared holiday/time-off-policy
  `scopeFilter` `{contains:"CONTAINS", ids, status:"ALL"}` shape (the POST/PUT form
  Clockify wants; the GET echoes it back flat).
- Fixed `clockify_time_off_requests_update_status`: it now calls the policy-scoped
  `changeTimeOffRequestStatus` endpoint with the correct `status` wire field (it
  previously hit the dead `/time-off/requests/{id}/status` route with `statusType`,
  so approvals/denials silently failed); the tool now requires `policyId`.
- `clockify_expenses_categories_delete` now archives the category (the dedicated
  PATCH `.../status` endpoint) before deleting — Clockify rejects deleting an active
  category. Both live-verified via the ai-assistant addon.
- Added rate-setting tools `clockify_projects_set_member_rate`,
  `clockify_users_set_member_rate`, and `clockify_tasks_set_rate` — amounts are
  given in MAJOR units and converted to integer minor via the SDK `toMinor`
  helper, then PUT to the per-project-member / workspace-member / task rate
  endpoints. This grows the MCP server to the **126-tool surface**.
- `clockify_scheduling_assignments_list_per_project` now accepts a `projectId`
  for one project's totals (the dedicated GET endpoint) instead of silently
  returning all projects.
- `clockify_time_off_policies_create`/`_update` now send their body FLAT (the
  generated methods ignore a nested `body`), and `_update` reads-then-replaces
  the policy and reconstructs the user/group scope into the `{contains,ids,status}`
  filter form — the same replace-safety + scope fix as holidays.
- `clockify_invoices_update` now reads-then-replaces the invoice via the SDK's
  `invoiceUpdateBodyFromExisting`: a sparse update no longer wipes untouched
  fields (note, subject, billFrom, …) and tax/discount are name+scale mapped
  (GET `discount`/`tax` ×100 ints → PUT `*Percent`) instead of silently zeroed.
  The tool also gained `taxPercent`/`discountPercent`/`tax2Percent` inputs.
- `clockify_invoices_create` now accepts `note`/`subject` and applies them via a
  follow-up update, because Clockify's `POST /invoices` silently drops them.
- `clockify_holidays_update` now list-scans (there is no single-GET route),
  rebuilds the full holiday body (PUT replaces), and reconstructs the user/group
  assignment into Clockify's `{contains,ids,status}` filter form (the GET echoes
  it flat); it errors clearly instead of dropping a required assignment.
  `clockify_holidays_create`/`_update` accept `userIds`/`userGroupIds` scope.
  All live-verified via the ai-assistant addon; see `spec/evidence/discrepancies.md`.
- Added users/roles tools: `clockify_users_list`, `clockify_member_profile_get`
  (read), and the privileged `clockify_users_grant_role` /
  `clockify_users_revoke_role` writes, built on the newly stamped
  `client.users.list/giveRole/removeRole` SDK methods.
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

- The workflow name→id resolvers (`resolveProjectId`/`resolveTaskId`/`resolveClientId`/`resolveTagId`/`resolveExpenseCategoryId`/`resolvePolicyId`/`resolveUserId`) now trust a 24-hex id via the SDK's `looksLikeClockifyId` and **throw a clear "not found" error on an unknown name** instead of the old `?? { id: value }` fallback that shipped the unverified name to the wire as an id (404 at best, a different entity at worst). `dateRange` now resolves relative dates ("yesterday", "last monday") via the SDK's `resolveRelativeDay`, so the review tools accept them, not just `YYYY-MM-DD`.
- `loadContext()` now rejects a `CLOCKIFY_BASE_URL` that points at a non-Clockify, non-loopback host (the SDK base-URL host allowlist), so a tampered env var cannot redirect authenticated MCP traffic off-host. A trusted proxy can opt in via `LoadContextOptions.allowInsecureBaseUrl: true`.
- Split workflow tool implementation into focused modules without changing tool names or result envelopes.
- MCP recoverable errors now use the shared error-code registry for default recovery hints.
- Migrated the SDK dev dependency from `file:../wrapper` to a workspace link (`"*"`). The peer dependency `clockify-sdk-ts-115 >=0.9.0` is unchanged for published consumers.
- Regenerated the shared error-code module to drop an unnecessary non-null assertion flagged by `typescript-eslint/no-unnecessary-type-assertion`.

### Internal

- Normalized import ordering in the split workflow modules so `make lint` stays
  green after the refactor.
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
- Updated the README around the 123-tool surface, workflow examples, envelopes, dry-run confirmation, and TypeScript-vs-Go positioning.

## [0.2.0] - 2026-05-26

### Added

- Added the 89-tool TypeScript MCP domain surface across Clockify's major resources.
