# Changelog

All notable changes to `@clockify115/mcp-server` are documented here.

## [Unreleased]

### Fixed

- `clockify_review_day` / `clockify_review_week` and `clockify_fix_entry`'s
  entry lookup now walk **all** pages of `listForUser` via the SDK's
  `iterAll` (honoring the `Last-Page` header) instead of fetching a single
  page of 200. A busy week no longer silently truncates its totals, and
  `fix_entry` can find an entry past row 200 instead of failing the
  exactly-one match.
- `clockify_fix_entry` now resolves and applies `task` / `task_id` /
  `tag` / `tag_ids` (the input schema was missing those fields, so Zod
  stripped them and the handler silently ignored task/tag changes while
  reporting success). Task resolution is scoped to the resolved or
  existing project to avoid leaving a stale task pointer.
- Entry and review date inputs are now validated offline with
  field-named errors: an explicit `start`+`end` range and an explicit
  `end` supplied alongside `start` are checked for ISO-8601 validity
  before any API call, matching the CLI, instead of reaching the wire as
  an opaque 400.

### Changed

- The workflow name→id matcher (`findOneByName` in `workflows/resolve.ts`) now routes
  through the SDK's canonical `matchByName` (via the new `matchKeys` option) instead of
  re-deriving its own case-insensitive multi-field match. Name-matching semantics now
  live in exactly one place across the SDK, CLI, and MCP — no parallel matcher to drift.
  Behavior preserved: ambiguous → `AmbiguousNameError`, miss → `null`/`notFound`, users
  still match on `["name","email"]`.
- Domain write tools (create / update / delete across entries, projects, tasks, clients,
  tags, webhooks, invoices, custom fields, groups, expenses, holidays, scheduling, time-off)
  now emit the same populated `entity` + `changed.{created,updated,deleted}` receipt the
  workflow tools do, via a shared `writeReceipt` helper — so an agent can chain on the
  structured `changed` field no matter which tool tier answered.

### Documentation

- Documented in `users.ts` why `grant_role` / `revoke_role` intentionally skip the
  dry_run→confirm_token guard: both resolve the target user with `trustIds:false`
  (an ambiguous/unknown name yields a grounded clarification, never a guessed id) and
  each is reversible via its sibling tool.
- Corrected a stale header comment in `holidays.ts` that referenced a non-existent
  `clockify_api_request` MCP tool; the curated server has no raw-API escape hatch by design.
- Documented the name→id resolution behavior (resolve-then-write, with a
  grounded `clarification` receipt on ambiguous/unknown names) in the
  Domain Tools and Result Envelope sections of `README.md`.

### Fixed

- Timer-stop now uses the live, bound route. The MCP `clockify_timer_stop` /
  `clockify_stop_work` / `clockify_switch_work` tools detect a running timer via
  `timeEntries.listInProgress` and stop it via `timeEntries.updateForUser` (`{ end }`,
  live-verified 2026-06-17). The dead `/stop` suffix route (`stopTimer`, 404 code 3000)
  is no longer called, and "no timer running" comes from an empty in-progress list — so a
  real running timer is never silently left ticking. The callers share
  `mcp/src/tools/timer-stop.ts`.
- `clockify_switch_work` no longer hides partial state: if starting the new timer fails
  after the previous one was already stopped, the error says so instead of masking the
  stop. Ambiguous project/task/tag names still surface the grounded clarification receipt.
- `clockify_review_day` / `clockify_review_week` reject an unparseable `date` /
  `week_start` with a clear, field-named `invalid_request` error instead of letting an
  opaque "Invalid time value" RangeError escape.
- Refreshed the transitive `hono` dependency (resolved through `@modelcontextprotocol/sdk`)
  to `4.12.25` so `npm audit --omit=dev` reports 0 production vulnerabilities; no direct
  dependency on `hono` exists in this repo.
- Holiday, time-off, scheduling, group add-member, and role-grant tools now resolve a
  NAME passed where a user/group/project id is expected to a real id BEFORE any write
  or read filter, via the list/filter resolvers (`clockify-sdk-ts-115/resolve`). An
  ambiguous or unknown name returns a grounded `clarification` receipt (real candidate
  ids) and performs no API call; 24-hex ids pass through unchanged, and read-filter
  slots stay list-free on the happy path.
- All destructive domain delete/remove tools (`clockify_custom_fields_delete`,
  `clockify_project_custom_fields_remove`, `clockify_holidays_delete`,
  `clockify_groups_delete`, `clockify_groups_remove_member`,
  `clockify_expenses_categories_delete`, `clockify_expenses_delete`,
  `clockify_invoices_delete`, `clockify_scheduling_assignments_delete`,
  `clockify_time_off_requests_delete`) now require the
  `dry_run` → `confirm_token` handshake through the shared confirmation guard,
  matching the six already-guarded deletes. An LLM caller must preview the delete
  and pass back a single-use token before anything is removed.
- `clockify_time_off_policies_create` / `clockify_time_off_policies_update` now
  send the user/group scope filter with `status:"ACTIVE"` (was `"ALL"`), matching
  the live-verified Clockify behavior for time-off policies; holiday assignments
  keep `status:"ALL"`. The shared `scope-filter.ts` helper gained an optional
  `status` parameter (defaults to `"ALL"`).

### Added

- Added `clockify_plan_change` — a read-only planning tool that explains which
  tools a change will use, in order, and whether each step mutates or needs the
  dry_run → confirm_token handshake, before anything mutates. This grows the MCP
  server to the **127-tool surface** (21 workflow + 106 domain).
- Added a first-class `clarification` field to the success-result envelope (and
  its output schema): a grounded "did you mean?" receipt with a question, the
  ambiguous field, and real candidate ids for ambiguous-name resolution.
- Wired the `clarification` receipt into the workflow tools: when a name matches
  more than one entity, name→id resolution now returns a success envelope carrying
  a populated `clarification` (question, ambiguous field, and real candidate ids)
  instead of a dead-end error, so the caller can re-invoke with the chosen id.
- Added `mcp/examples/claude-desktop.json`, a compact `mcp/examples/agent-mode.md`
  guide, and `mcp/examples/workflow-transcripts/` (log yesterday's work, invoice
  Acme, clean demo data, recover from not_found).
- Added `mcp/examples/README.md` — agent tool-call recipes (status, log work,
  invoice with dry_run → confirm_token, demo seed/cleanup) and how to run the
  server, cross-linked from the top-level `examples/` index.
- Added a `clockify://guide/which-tool` resource — an intent → first-tool decision
  tree (time tracking, work setup, billing, time off, scheduling, webhooks, and the
  domain-tool fallback) so an agent can route a request without scanning all 126
  tools.
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
- Added forgiving argument shapes for weak-model robustness: list fields now
  accept a bare string (`userIds: "Bob"` -> `["Bob"]`) and numeric fields accept
  a numeric string (`amount: "75"` -> `75`), via `zStringList`/`zNumberLike` in
  the new `mcp/src/arg-shapes.ts`. Coercion is conservative — never `"" -> 0`
  (a silent zero-amount money bug) and no comma splitting. Because the MCP SDK's
  zod-to-json-schema unwraps `z.preprocess`, the model-visible tool schema and
  `docs/mcp-tools.json` are unchanged and no new tools are added (surface stays
  127). Applied to the holidays, scheduling, time-off, and expenses
  list/number/array fields.

### Changed

- `clockify_projects_delete`, `clockify_tasks_delete`, and `clockify_clients_delete` now archive the project/client (GET-then-PUT `archived:true`) / mark the task DONE before deleting, because Clockify rejects DELETE of an active project/task/client (400, live-verified 2026-06-15) and the dedicated `/archive` routes 404. Projects/tasks were verified live end-to-end through the real tools. The client path uses the `clients.update` **body envelope** `{name, archived:true}`, which bypasses the generated field whitelist via `core.bodyFromRequest` (the flattened form drops `archived`); it carries the client name the replace-PUT requires and errors clearly if the client has no name. This corrects the earlier note that the SDK had no client-archive path. Order pinned by `mcp/tests/archive-then-delete.test.ts`.
- `clockify_time_off_requests_get` now searches `timeOff.list` (`POST /time-off/requests`) with `statuses:["ALL"]`, walks pages (bounded), and scans by id, because `GET /time-off/requests/{id}` is a dead 404 route (live re-probed 2026-06-15). Live finding: the search `statuses` filter accepts only `[PENDING, APPROVED, REJECTED, ALL]` — it 400s on the per-request `WITHDRAWN` status — so the scan filters on `ALL`. Verified live end-to-end against a real request id. Test: `mcp/tests/time-off-get.test.ts`.
- `clockify_groups_get` now reads the group from `userGroups.list` and scans by id, because the generated `userGroups.get` is typed `void` (Clockify has no single-GET route that returns the group) — the tool previously returned nothing. It now errors clearly on an unknown id. Offline-verifiable from the generated method signature; test in `mcp/tests/groups-get.test.ts`.
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
