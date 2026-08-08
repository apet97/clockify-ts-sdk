# Changelog

All notable changes to `@apet97/clockify-mcp-115` are documented here.

## [Unreleased]

### Added

- Opt-in progressive tool disclosure. Set `CLOCKIFY_MCP_DISCOVERY=1` and the
  server advertises only the 23 workflow and orientation tools; the 140 domain
  tools stay registered but disabled, and `clockify_tools_search` loads the
  ones a query matches. A 163-tool list costs a large amount of context before
  the model does any work, and most sessions touch a handful.

  Leave the variable unset and nothing changes: the same 162 tools are
  advertised as before, and `clockify_tools_search` is registered disabled, so
  it is neither listed nor callable.

  A disabled tool is not merely hidden — calling it by name is an error. That
  is what makes discovery a real surface reduction rather than a display
  filter.

### Changed

- `clockify_entity_changes_list` reports `count` for every change type and
  returns the wire array unchanged. The SDK now types all three entity-change
  reads as arrays, so the tool no longer branches on response shape, and an
  empty window reports `count: 0` instead of omitting the field.
- The tool surface is 163 tools, 23 workflow plus 140 domain. The one new tool
  is `clockify_tools_search`, classified `read`.

## [2.0.0](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v1.0.1...mcp-v2.0.0) - 2026-08-07

### Changed

- Removed a stray `apet97-clockify-mcp-115-2.0.0.tgz` from the package
  directory. `make pack-smoke` writes one there and deletes it again; a
  `git add -A` in between had committed it. It was never published —
  package.json's `files` list already excluded it.

- `clockify_invoices_items_delete` takes `order` as a positive integer rather
  than a string, matching the int the path segment binds to.

- `clockify_time_off_policies_create` always sends the wire-required
  `approve` object and exposes a `requiresApproval` flag (default `false`) to
  control it. Creating a policy without `approve` returns 400 "must not be
  null".

### Fixed

- `name_reserved_after_delete`'s meaning and recovery were wrong. A name is
  held for as long as the entity exists — including while it is archived, which
  the default list call hides — and deleting releases it immediately
  (live-probed 2026-08-07 on clients and tags). The old text described a
  post-delete reservation window and told callers to wait for it, which never
  expires because it does not exist. The code keeps its identifier for
  compatibility; it is a misnomer and now says so.

- `clockify_switch_work` reports "no timer was running" instead of "the
  previous timer was stopped" when the switch's start-side create fails and
  the prior stop found no running timer. The note-selection read
  `stopped.stopped` off `stopWork`'s returned envelope, but the envelope has
  no top-level `stopped` field -- the flag lives at `stopped.data.stopped`.
  A running timer's `data` is the entry (also no `stopped` field), so both
  the buggy and correct read were `undefined` on that path and it read as
  "was stopped" either way, which hid the bug on the no-timer path until
  start also failed.

- `clockify_entries_log` returns the wire time entry as-is instead of
  `{...entry, ...body}`. The response never has flat `start`/`end` fields
  (only nested `timeInterval`), so the merge only ever added phantom
  top-level `start`/`end`/`description`/... duplicating (or, wherever the
  server normalizes on write, shadowing) the real entity -- live-verified
  2026-08-07: a real created entry's `timeInterval.start` truncates the
  milliseconds that were sent, and the old merge reported the untruncated,
  pre-request value as a `data.start` field that should not have existed.

- `clockify_holidays_create`/`clockify_holidays_update`'s `color` field now
  validates `#RRGGBB` client-side (matching `clockify_projects_create`'s
  `PROJECT_COLOR_SCHEMA`) instead of accepting any string and 400ing opaquely
  on the wire.

- `clockify_approvals_resubmit`'s `period` enum now reuses the shared
  `APPROVAL_PERIODS` constant instead of an inlined copy, so a future wire
  change to the period set can no longer update the other three approval
  tools while silently missing this one.

- `errorCodeForMessage` (shared with the wrapper and CLI, emitted verbatim
  into all three packages by `scripts/generate-error-docs.mjs`) now matches
  a status-less upstream/gateway failure as the retryable
  `clockify_upstream_error` before the generic "invalid" validation token —
  a message that merely quotes a downstream failure (e.g. "upstream gateway
  error: invalid gateway") previously classified as non-retryable
  `invalid_request`. Reachable only when a caller-supplied error carries no
  HTTP status. Word forms only (`upstream`, `gateway`, `service
  unavailable`, `internal server error`) -- deliberately not a bare
  `500`/`502`/`503`/`504`, which would otherwise misclassify a validation
  message like "amount must be at most 500" as upstream.

### Changed

- Recorded a coverage decision for every `docs/operation-parity.json` row
  that previously reported `tsMcp:null` with no `overrideReason` (64 of
  168 operations). Classified by ground truth — cross-referencing each
  operation's exact SDK call against every tool handler's actual source,
  not name-guessing: 37 are genuinely exposed under a differently-named
  or combined tool, 27 are genuinely unexposed for a specific documented
  reason (binary payloads, workspace-admin config, or the manager-acts-
  for-another-user write asymmetry). No tool added, removed, or renamed.

- Dropped `mcp/tests/sdk-narrow.test.ts` (duplicated the same `entityId`
  test already covered by the wrapper's `operation-receipt.test.ts`).

- `mcp/tests/tool-manifest.test.ts` now asserts the committed manifest's
  `idempotentHint` against a fresh live introspection for every tool, not
  just `readOnlyHint`/`destructiveHint`/`openWorldHint` (which are pure
  functions of `risk` and were already covered).  `idempotentHint` is the one
  annotation a tool can override (`idempotent: true`, e.g.
  `timeOff/requests.ts`), so a flipped override could previously desync the
  manifest from runtime with nothing catching it.

## [1.0.1](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v1.0.0...mcp-v1.0.1) - 2026-08-06

### Changed

- `REGIONAL_PREFIXES` and `KNOWN_REGIONS` are exported so a test can pin them
  to the SDK's `ClockifyRegion` union -- see the CLI changelog for why. Internal
  to the package; no tool, resource, or bin surface changes.

### Fixed

- `clockify_doctor` read `CLOCKIFY_BASE_URL`, `CLOCKIFY_REGION`, and
  `CLOCKIFY_SUBDOMAIN` untrimmed while the server trims them, so a
  whitespace-only value made the report describe a configuration the server
  was not running: a custom base URL it was not using, and a failed routing
  check while it routed `global`. A diagnostic that contradicts the running
  server is worse than none. All three are now trimmed at the read.

- A whitespace-only `CLOCKIFY_API_KEY` or `CLOCKIFY_WORKSPACE_ID` no longer
  kills the server at startup. Both were read untrimmed, so `"   "` was
  truthy, skipped the deferred `setup_required` path, and reached
  `createClockifyClient`, which rejected it with a bare `TypeError` before
  the process ever spoke MCP. Both are now trimmed like every other env var,
  so a blank credential produces the documented `setup_required` receipt.

### Added

- The server names the resolved routing profile on stderr when it is not
  `global`. `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN` supply
  `acknowledgeUnconfirmedRegion` on the operator's behalf, so a region
  inherited from a shared launcher config previously sent authenticated
  traffic to an unproven host with nothing on the record. stdout is
  untouched; it carries JSON-RPC.

### Changed

- `warnIfSetupRequired` is now `warnStartupDiagnostics` and also drains the
  context's `startupNotices`. Internal to the package; no tool, resource, or
  bin surface changes.

### Changed

- The write-safety negative test captures the checker's stderr instead of
  inheriting it. Its deliberate failure text no longer appears in a passing
  suite log, where it read like a real gate failure. The assertions are
  unchanged.

## [1.0.0](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.10.0...mcp-v1.0.0) - 2026-08-05

First stable release, alongside `clockify-sdk-ts-115` 1.0.0. The 162 tools
(22 workflow plus 140 domain), their input schemas and their risk classes
are frozen under semantic versioning.

### Changed

- The `clockify-sdk-ts-115` peer range moves from `>=0.15.1 <1` to `^1`.
  Install the SDK 1.0.0 or later.

- The time-off and invoice tool modules are split by resource group:
  `tools/timeOff/{requests,policies,balances,balance-assignments}.ts` and
  `tools/invoices/{invoices,items,payments}.ts`. This is a pure move --
  `docs/mcp-tool-manifest.json` regenerates byte-identical at 162 tools and
  every published input and output JSON Schema is unchanged.

- Strict TypeScript is complete: `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals` and `noUnusedParameters`
  are on, and ESLint runs `strictTypeChecked`. The zod 4 deprecations are
  gone (`passthrough` to `loose`, `string().url()` to `url()`, the no-op
  `finite()`), with the published schemas proven unchanged.

### Fixed

- A confirmation preview that cannot be JSON-serialized now raises a clear
  error instead of failing inside `createHash`.

## [0.10.0](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.9.1...mcp-v0.10.0) - 2026-08-05

### Added

Nine tools that clear the last of the ADR 0006 backlog, taking the surface
from 153 to 162 (22 workflow plus 140 domain):

- `clockify_invoices_items_add` (business_write) and
  `clockify_invoices_items_delete` (destructive). Items are addressed by
  `order`, not by id, and deleting one renumbers the rest.
- `clockify_invoices_payments_create` (business_write) and
  `clockify_invoices_payments_delete` (destructive). Payments are additive
  and the API does not deduplicate.
- `clockify_projects_estimates_update` (business_write): set a budget or
  time estimate; each estimate sent replaces that estimate's settings.
- `clockify_projects_templates_list` (read) and
  `clockify_projects_templates_mark` (business_write). Marking flags the
  project itself; it does not copy it.
- `clockify_workspace_settings` (read): the pinned workspace record and its
  settings block, with no matching write tool.
- `clockify_time_off_requests_create_for_user` (business_write): the
  on-behalf-of variant that `clockify_request_time_off` does not cover.

### Notes

Three backlog rows are closed without shipping.
`clockify_time_off_requests_create` duplicates `clockify_request_time_off`,
`clockify_custom_fields_set_value` is already served by
`clockify_project_custom_fields_update` and
`clockify_entries_update`/`clockify_fix_entry`, and `clockify_reports_export`
would move binary payloads through MCP, which contradicts the decision in
CLI 0.5.1 that removed binary export for want of an output-file streaming
contract.

### Changed

- Build with TypeScript 7. No emitted output or public surface changes.

## [0.9.1](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.9.0...mcp-v0.9.1) - 2026-08-05

### Fixed

- Raised the `clockify-sdk-ts-115` peer floor from `>=0.13.0` to `>=0.15.1`.
  The 0.9.0 tools for the 7 new operations call SDK methods that first exist
  in 0.15.1, so a consumer that resolved an older SDK got a `TypeError`
  instead of a clear peer-range error at install time.

## [0.9.0](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.8.1...mcp-v0.9.0) - 2026-08-05

### Added

- `clockify_entries_get_many` (read): fetch several time entries by ID in
  one call. The endpoint omits IDs it cannot resolve, so compare `count`
  against the number of IDs sent.
- `clockify_time_off_balance_assignments_list` (read),
  `_create` (business_write), `_update` (business_write), and
  `_delete` (destructive): manage a user's time-off balance for one
  policy. Live-verified semantics: `create` adds to an existing
  assignment and creates one only when absent; `update` applies a delta,
  not a replacement value; `delete` requires a note.
- `clockify_approvals_submit_with_type` and
  `clockify_approvals_submit_for_user_with_type` (business_write): submit
  an approval request with an explicit type. Only the for-user tool
  accepts `TIMESHEET_AND_EXPENSE`.

The tool surface moves from 146 to 153 tools (22 workflow/orientation
plus 131 domain).

## [0.8.1](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.8.0...mcp-v0.8.1) - 2026-08-04

### Fixed

- `clockify_shared_reports_view` now advertises only `JSON_V1` / `JSON` and
  returns the parsed response body instead of serializing `BinaryResponse`
  metadata. The unusable `clockify_invoices_export` tool is deferred until MCP
  has a bounded resource or file-safe binary contract; no replacement tool is
  advertised. The honest surface is now 146 tools (22 workflow, 124 domain).
- MCP request cancellation now reaches the underlying Clockify fetch for every
  tool. Cancelling a multi-step destructive call stops before its next request,
  while caller-supplied fetch signals and concurrent requests remain isolated.
  Pre-cancelled calls do not enter handlers or consume confirmation tokens;
  once a confirmed mutation may have started, its token remains consumed and a
  fresh `dry_run` is required.
- Importing the package root from an unrelated `index.js` no longer starts the
  stdio server; direct invocation now matches the exact resolved entry module,
  including npm's installed-bin symlink.
- Report summaries accept the live `TAG` grouping. Direct report tools now
  expose only `JSON` / `JSON_V1`; CSV and binary exports remain deferred until
  a bounded file-safe MCP tool can return them without text corruption.
  Detailed and attendance report page sizes are capped at 1,000 before the API
  call, matching the CLI and bounding JSON response amplification.
- `clockify_reports_weekly` now rejects invalid date ranges before calling the
  API and requires one exact seven-day interval (exclusive end, or inclusive
  end-of-day), rather than merely touching seven calendar dates.
- Project metadata updates and archive-before-delete preserve the current
  `billable` / `public` state across Clockify's mixed PUT omission semantics.

## [0.8.0](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.7.0...mcp-v0.8.0) - 2026-08-01

### Security

- **`@modelcontextprotocol/sdk` `^1.29.0` → `^1.30.0`, which eliminates
  GHSA-frvp-7c67-39w9** (path traversal in `@hono/node-server` `serve-static` on
  Windows via encoded backslash). 1.30.0 widens its declared range to
  `^1.19.9 || ^2.0.5`, so the transitive resolves to `@hono/node-server@2.0.12`
  — above the vulnerable `<2.0.5`. The governed exception in
  `docs/npm-audit-exceptions.json` is **removed**, leaving that register empty:
  the advisory is fixed, not excepted.
  This surfaced as a release-blocking `build-mcpb` failure. The MCPB stage does a
  *fresh* production install rather than using the committed lock, so it
  resolved SDK 1.30.0 and reported the exception as stale while `mcp/`'s own
  locked audit still reported the advisory. Both are now clean. The previously
  recorded objection to an npm override ("npm 11 drops the out-of-range
  overridden package") no longer applies either, since 2.x is now in range.
  Tool surface unchanged: 147 tools, 6 resources, 2 prompts; 893 tests pass.

### Changed

- **zod 3 → 4** (`^3.25.0` → `^4.4.3`). `@modelcontextprotocol/sdk` already
  accepts `^3.25 || ^4.0`, and the install dedupes to a single zod instance, so
  the server and the SDK share one copy. The tool surface is unchanged: **147
  tools, 6 resources, 2 prompts**, and every count in `docs-counts` holds.
  `z.preprocess` still unwraps to the inner schema, so `zStringList` /
  `zNumberLike` remain invisible in the model-visible JSON Schema — all five
  forgiveness invariants are asserted and pass (`"75"` → `75`; `""` does NOT
  become `0`; no comma-splitting; bare string → `[string]`; no boolean
  coercion; the last two were added as tripwires *before* the bump).
  Migration details: `z.record(V)` now requires an explicit key type
  (`z.record(z.string(), V)`, 7 sites); `z.ZodEffects` is gone, so
  `arg-shapes.ts` returns `z.ZodType<z.output<S>, unknown>`; and
  `GuardControlShape` names `z.ZodOptional<z.ZodBoolean>` / `<z.ZodString>`
  directly because `ReturnType<typeof z.boolean>` now resolves to the internal
  `$ZodType`, which has no `.optional`.
- **Model-visible schema note:** zod 4 emits an explicit
  `"maximum": 9007199254740991` (`Number.MAX_SAFE_INTEGER`) for `.int()` fields
  where zod 3 left it implicit. This is the JS safe-integer ceiling that always
  held in practice, it does not reach `docs/mcp-tools.json` (a names-and-counts
  summary carrying no schemas), and it does not change the tool count.

### Fixed

- `clockify_demo_cleanup`'s read-only discovery phase now walks every page of
  all five sweeps (time entries, projects, tasks-per-project, tags, clients)
  instead of reading page 1 only. The entry sweep's default window is a full
  calendar year at page-size 200, so a busy workspace truncated — and those
  counts are exactly the preview a human approves before issuing the
  `confirm_token`, so the tool could report `entries: 0` and then delete
  nothing while demo residue survived.
- `clockify_setup_webhook` no longer advertises `trigger_source_type` /
  `trigger_source`. The tool always hardcodes `WORKSPACE_ID` +
  `[workspaceId]` (a deliberate, test-pinned security property), so a model
  setting them believed it had narrowed the subscription when it had not. The
  description now points at `clockify_webhooks_create` for a real USER_ID /
  PROJECT_ID / USER_GROUP_ID trigger source. Tool count unchanged.
- `clockify_request_time_off`'s two period-shape rejections now carry the
  tool's own recovery hint (`clockify_time_off_policies_list`) instead of the
  generic `invalid_request` fallback. They early-returned an `errorResult`,
  bypassing the `prepareWorkflow` catch that attaches the hint for every other
  failure of the same tool. Messages and the `invalid_request` code unchanged.
- `clockify_switch_work`'s receipt keeps the stop's `changed.updated` ref
  alongside the start's `changed.created`. Only the created bucket survived, so
  an agent could not chain on the entry it had just stopped.
- `clockify_review_day` / `clockify_review_week` honour `max_rows: 0` as
  "totals only". The schema advertises `.int().min(0)`, but 0 was treated as
  unset and returned 15 issues plus 15 unrequested `next` actions.
- `clockify_entries_update`'s description now discloses that the tool is a full
  REPLACE (PUT semantics) and that every omitted optional field — `end`,
  `description`, `projectId`, `taskId`, `tagIds`, `billable`, and custom-field
  values — is CLEARED, pointing at `clockify_fix_entry` for the read-merge path.
  It was the one replace-PUT on the surface whose contract was undisclosed, so a
  model updating one field silently wiped the rest. Behavior unchanged.
- `clockify_review_day` / `clockify_review_week` no longer attach an `entry_id`
  argument to a `clockify_stop_work` next-action. That tool's input schema is
  `{ end? }`, so the MCP SDK's `z.object` stripped the key and the model was
  handed a parameter the target does not accept; the id now travels in the
  human-readable `reason` instead.
- Four input-validation rejections now classify as `invalid_request` rather than
  the maintainer-facing catch-all `error` code: `clockify_webhooks_update`'s
  missing-state and legacy-name guards, `clockify_expenses_create/update`'s
  unresolvable-current-user error, and `clockify_demo_cleanup`'s reserved-prefix
  guard. Messages were reworded to carry a token `errorCodeForMessage` matches;
  behavior and the tailored recovery hints are unchanged.
- `clockify_create_work_package` preserves the SDK error class when a composition
  step fails. It rebuilt the failure as a bare `Error` from the status message,
  so `errorCodeForError` lost the status/class and a retryable upstream 500 was
  reported as the catch-all `error` with `retryable:false` — the same defect
  already fixed in `clockify_switch_work`. The rollback's "nothing partial was
  left behind" note is still prepended/appended to the original message, and an
  `AmbiguousNameError` deliberately keeps the bare-`Error` path so the
  clarification receipt does not discard that note.
- `clockify_create_work_package` reports an unparseable `color` as
  `invalid_request` instead of the developer-facing catch-all `error`. The
  message now carries a token `errorCodeForMessage` matches, so a plain model
  input mistake gets the "fix the request fields, then retry" recovery.
- `clockify_scheduling_assignments_create` resolves a project NAME against every
  page of the workspace project list, not just the first 200 rows. Past that row
  a real project produced a false clarification ("There is no active project
  named X") and the guarded create stopped. This was the last single-page
  reference-list closure in the server.
- `clockify_scheduling_assignments_create` no longer hides a created assignment
  when the follow-on publish fails. The confirm token is consumed before
  `execute` runs, so turning a publish failure into a bare error left the agent
  with no id and only one way forward: a fresh dry-run and a SECOND create, i.e.
  a duplicate assignment in the user's workspace. It now returns the created
  draft with a `publish_failed` warning and a `clockify_scheduling_publish`
  next-step. **Semantic change:** `meta.published` now reports the publish
  OUTCOME rather than "publish was requested".
- `clockify_switch_work` preserves the SDK error class when starting the new
  timer fails. Re-wrapping it in a bare `Error` erased the type, so
  `errorCodeForError` fell through to the message matcher and a retryable
  upstream 500 was reported as the catch-all `error` with `retryable:false` —
  telling the agent not to retry a failure the registry marks retryable.
- Eight local validation messages across `clockify_fix_entry`,
  `clockify_schedule_work`, `clockify_log_work`/`clockify_start_work`/
  `clockify_switch_work`, `clockify_entries_log`, and `clockify_invoices_create`
  now classify as `invalid_request` instead of the catch-all `error`. All are
  reachable from a schema-valid call. Wording only; the thrown types and guard
  semantics are unchanged, and the model-visible JSON Schema and tool count do
  not move.

- A tool supplying a custom `recovery` object no longer loses `retryable`:
  `errorResult` now spreads the supplied value over the code-derived default,
  so an explicit `retryable` (true or false) still wins while the default fills
  in when it is omitted. Previously any custom recovery dropped the field
  entirely and agents lost the retry signal.

### Added

- Behavioral tests for tools that had none: `clockify_demo_seed` (and with it
  the only consumer of the exported `mergeChanged`), `clockify_groups_list` /
  `_create` / `_update`, `clockify_expenses_get` and the two expense-category
  writes, `clockify_invoices_get` / `_export`, `clockify_webhooks_events`, and
  `clockify_webhooks_create`'s non-`WORKSPACE_ID` trigger-source guard.
  `clockify_plan_change` is now exercised through the REGISTERED handler (the
  only place `entity` is forwarded), `clockify_status` is exercised WITH a
  running timer in both the own-user and other-user directions, and
  `clockify_users_invite` is exercised with `sendEmail` omitted so the
  documented `default true` arm is no longer dead.
- `clockify_scheduling_assignments_create` reports `published` in its result
  ids, so a caller can tell a published assignment from an unpublished one
  without a follow-up read.

- Write receipts (`entity` + `changed`) on the remaining domain writes that
  lacked them, so agents can chain on `changed.created`/`changed.updated`
  uniformly: the three approval writes (`clockify_approvals_submit`,
  `clockify_approvals_update_state`, `clockify_approvals_resubmit`),
  `clockify_users_grant_role` / `clockify_users_revoke_role`,
  `clockify_invoices_import_time`, `clockify_timer_stop`, and
  `clockify_tags_update`.
- `clockify_tags_update` now rejects a no-op call (only `tagId`, or
  `name: ""` alone) with a local `invalid_request` error instead of sending
  an empty body to the wire, matching its sibling update tools.
- `clockify_scheduling_publish` now returns an `entity` + `changed` write
  receipt like every other scheduling write, so an agent can chain on
  `changed.updated` after a publish.
- `clockify_member_profile_update` now rejects a call carrying only `userId`
  with a local `invalid_request` error instead of PATCHing an empty body and
  returning an "updated" receipt for a mutation that changed nothing.

### Fixed

- The no-op-update guards across ten tools (clients, tasks, custom fields ×2,
  expense categories, invoices ×2, webhooks, holidays, time-off policies) now
  classify as `invalid_request` instead of the catch-all `error` code, so the
  agent gets the "fix the request fields, then retry" recovery hint. Message
  wording only; the thrown types and guard semantics are unchanged.
- The shared name→id resolver failures now classify precisely: an unresolvable
  name is `not_found` and an ambiguous one is `invalid_request`, instead of
  both falling through to the catch-all `error`. This is visible on the domain
  tools that resolve outside a workflow (time-off policy and expense-category
  lookups); workflow clarification receipts are unaffected.
- Argument forgiveness now covers the numeric and string-list slots that were
  missed: `zNumberLike` on `clockify_entries_log.durationSeconds`, the
  `log_work` duration args, the three invoice percent fields, the project
  membership rate `amount`, the detailed-report `auditFilter.duration`,
  `clockify_docs_search.max_results`, and the review workflows' `max_rows`;
  `zStringList` on `clockify_audit_log_search.actions`/`authorIds`, entity-change
  `types`, custom-field `allowedValues`, and invoice `statuses`.
  The model-visible JSON Schema and the tool count are unchanged.

- Group-name resolution before writes (projects / holidays / time-off) now
  paginates the user-group listing via a shared `listGroupRefs` helper
  instead of fetching only page 1: a real group past row 200 no longer
  stops the write with a false "did you mean?" clarification.
- Unknown-id failures from `clockify_groups_get` and
  `clockify_time_off_requests_get` now classify as `not_found` (message
  reworded to carry the "not found" token); the
  `clockify_holidays_update` no-assignment error now classifies as
  `invalid_request` ("provide" instead of "pass").

### Changed

- Argument-shape forgiveness is now consistent across tools: all remaining
  `page`/`pageSize` fields accept a numeric string via `zNumberLike`
  (entries, projects, tasks, clients, tags, users, groups, webhooks,
  custom fields, approvals, audit, reports incl. nested filters, shared
  reports, invoice payments), the workflow `hours_per_day` accepts `"8"`,
  and the id-list fields accept a bare string via `zStringList`
  (`tagIds`, `timeEntryIds`, `assigneeIds`, `triggerSource`, workflow
  `tags`/`tag_ids`/`trigger_source`). The model-visible JSON Schema is
  unchanged (the preprocess wrappers unwrap to the inner schema).

- Dev-dependency refresh: `eslint` `^10.5.0` -> `^10.8.0`, `typescript-eslint`
  `^8.64.0` -> `^8.65.0`, and `tsx` `^4.19.2`/`^4.22.3` -> `^4.23.1`. Build-time
  only; no published runtime or type surface change. All three packages now
  declare one `tsx` range, and `tsx` is additionally declared at the workspace
  root -- root-level gates run `node --import tsx` with the repo root as cwd,
  so they need it resolvable there rather than relying on npm hoisting a
  workspace copy.
- Narrowed ten module-local types to module scope (`UnguardedToolRisk`,
  `GuardedToolRisk`, `ToolName`, `ToolNameForRisk`, `GuardedToolHandlers`,
  `AgentDocSearchResult`, `PageMeta`, `ResolverClarify`, `StopOutcome`,
  `UserRefHelpers`). Each was `export`ed but imported by nothing outside its
  defining file. The 147-tool surface, every tool schema, and all runtime
  behavior are unchanged.

## [0.7.0](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.6...mcp-v0.7.0) - 2026-07-27

### Added

- Optional `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN` env vars select a Clockify
  routing profile (process-env only, matching the existing auth/workspace/
  base-URL precedence). Mutually exclusive with `CLOCKIFY_BASE_URL`.
  `clockify_doctor` reports routing posture, redacting the subdomain value.

## [0.6.6](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.5...mcp-v0.6.6) - 2026-07-24

### Changed

- Version-only release, cut to keep the SDK, CLI, and MCP on one coordinated
  checkpoint after a repository hygiene pass. The 147-tool surface, every tool
  schema, the write-safety confirmation flow, and all runtime behavior are
  unchanged from `0.6.5`.

## [0.6.5](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.4...mcp-v0.6.5) - 2026-07-23

### Fixed

- MCPB staging audit now uses the same governed production exception register as
  main CI (`docs/npm-audit-exceptions.json`), so the unreachable
  `@hono/node-server` advisory no longer blocks `make mcpb` / release asset
  build. Sync `package-lock.json` with the MCP package version.

## [0.6.4](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.3...mcp-v0.6.4) - 2026-07-23

### Fixed

- MCP release CI now runs the governed production npm audit gate
  (`scripts/check-npm-audit.mjs`) instead of raw `npm audit --json`. Raw audit
  exited non-zero on the already-excepted `@hono/node-server` advisory and on a
  Typedoc-only `linkify-it` high finding outside the production install tree,
  which blocked `mcp-v0.6.3` after a successful package proof. The published
  surface is unchanged from the 0.6.3 changelog entries below.

## [0.6.3](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.2...mcp-v0.6.3) - 2026-07-23

### Fixed

- `isCallToolResult` now requires a `structuredContent.ok: boolean` envelope, so a
  business preview that happens to carry a `content` array cannot skip the
  dry-run / confirm-token path.

### Security

- Documented a governed, expiring production-audit exception for
  GHSA-frvp-7c67-39w9 (`@hono/node-server` < 2.0.5, path traversal in
  `serve-static` on Windows): the package is a transitive dependency of
  `@modelcontextprotocol/sdk` (pinned `^1.19.9`; the fix exists only in
  2.0.5+ and no patched 1.x exists). This server is stdio-only and never
  constructs the SDK's HTTP transport or serves static files, so the
  vulnerable code path is unreachable. Tracked in
  `docs/npm-audit-exceptions.json` with expiry 2026-10-20; the repo audit
  gate (`scripts/check-npm-audit.mjs`) goes red when the exception expires,
  the severity changes, or an upstream fix makes it stale.

### Added

- `clockify_entity_changes_list`, a read-only experimental feed that routes one
  required change type to the matching generated created, updated, or deleted
  endpoint and preserves its response with an explicit stability warning.
- `clockify_projects_memberships_list` and the privileged, confirmation-guarded
  `clockify_projects_memberships_update` for inspecting and replacing verified
  project memberships through the generated project SDK operations.
- `clockify_scheduling_copy`, a business-write, confirmation-guarded scheduling
  assignment copy tool with verified target-user resolution, exact series-scope
  preview, and lossless array responses.
- `clockify_time_off_balances_update`, a business-write, confirmation-guarded
  batch balance replacement tool with verified policy/user resolution, explicit
  value-not-delta semantics, note-redacted execution receipts, and read-back guidance.
- `clockify_users_set_status`, a privileged, confirmation-guarded workspace
  membership activation/deactivation tool with verified ID/name/email resolution
  and a hard current-user deactivation block.
- `clockify_webhooks_delivery_diagnose`, a read-only SDK-backed view of the
  latest webhook delivery status, response code, timestamp, and retry count.
  Recipient-controlled response bodies are always omitted from MCP results and
  produce an explicit safety warning when present.
- Exact-artifact release proof: `prepublishOnly` now ends with the shared
  pack-consumer-smoke engine in `--package=mcp` mode, which packs the wrapper
  and MCP tarballs, prints their names and sha512 integrity digests, installs
  them into a temporary consumer, import-smokes the `server`/`client`
  subpaths, and completes a real MCP `initialize` → `tools/list` exchange with
  the packed server binary over stdio before any publish.

### Breaking

- Renamed the code-level `LoadContextOptions.allowInsecureBaseUrl` field to
  `allowNonClockifyHttpsHost`, matching the SDK option and its HTTPS-only
  behavior. Environment-based startup remains strict by default.

### Fixed

- Holiday create/update previews now assemble the generated request unions from
  typed bodies directly, eliminating the final two request-object assertions;
  assignment filters keep the same `CONTAINS`/`ALL` wire shape. Updates now
  fail closed when list read-back omits required `occursAnnually` rather than
  silently inventing `false`.
- MCP review/fix workflows now call `timeEntries.listForUser` with its generated
  request and `TimeEntry` types, preserve custom-field values on replace-style
  fixes through a validated read-to-write projection that strips hydrated
  read-only fields, detect ambiguity across pages, and stop before inspecting
  entry 10,001.
- `clockify_expenses_update` now dispatches its stored typed preview directly;
  regenerated API truth makes the multipart `file` field optional without a
  request cast.
- `clockify_expenses_list` now uses the shared bounded SDK date filter, exposes
  distinct `limit`/`pageSize`/`page`/`offset`/`maxPages` controls, and returns
  the client-side-filter warning plus lossless page/offset continuation metadata.
  Empty bounds fail schema validation and generated next actions stay within the
  tool's supported page ceiling, including a reduced continuation scan bound
  when the original `maxPages` would cross it.
## [0.6.2](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.1...mcp-v0.6.2) - 2026-07-14

### Fixed

- Aligned the root coverage provider with Vitest 4.1.10 so clean-workspace coverage proof
  resolves the matching provider
  ([fa4eabf](https://github.com/apet97/clockify-ts-sdk/commit/fa4eabfe61d3b2b0a153865dc1261fa62ffa7948)).

### Changed

- Refreshed compatible test and lint tooling (`@vitest/coverage-v8` and Vitest 4.1.10,
  `eslint-plugin-import-x` 4.17.1, `fast-check` 4.9.0, and `typescript-eslint` 8.64),
  including a root-aligned coverage provider for reproducible clean-workspace proof, without
  changing runtime behavior.

## [0.6.1](https://github.com/apet97/clockify-ts-sdk/compare/mcp-v0.6.0...mcp-v0.6.1) - 2026-07-14

### Fixed

- Restored MCP cast-budget verification by annotating the intentional expenses update
  request cast with the KEEP convention; no runtime behavior changed
  ([092dfaa](https://github.com/apet97/clockify-ts-sdk/commit/092dfaabd25f598e0d0b7406706de4b639ffce79)).

## [0.6.0] - 2026-07-12

### Changed

- Require Node.js 22.13 or newer and `clockify-sdk-ts-115 >=0.12.0 <1`.
- Runtime initialize metadata is generated from the package manifest.
- Full type checking includes MCP tests; builds use a source-only build config.
- Tool output schemas are injected by `defineTool`; the global `registerTool` monkeypatch is gone.
- Audit actions use the SDK runtime enum and reject invalid values before network access.
- Full-replacement writes reconstruct and validate current state before mutation;
  report, import, time-entry, expense, scheduling, project, rate, and webhook
  payloads now use generated request types and operation-specific schemas.

### Security

- Publish a governed runtime risk class and confirmation mode for all 140 tools.
  The 56 business, external-side-effect, privileged, and destructive writes now
  require a five-minute, one-use token and execute the exact canonical preview
  captured by `dry_run`; read and routine writes remain one-call operations.
- Live sandbox proof verifies that a guarded business write cannot mutate on a bare or
  dry-run call and executes only from its one-use stored preview token, with deterministic
  prefixed cleanup through the root four-surface orchestrator.

## [0.4.1] - 2026-06-29

### Fixed

- Adversarial-review pass (plan 011):
  - **`clockify_fix_entry`** no longer wipes `end`/`projectId`/`taskId`/`tagIds`/
    `billable`/`description` on a partial fix. The time-entry update is a
    replace-`PUT`, so every field is now preserved from the already-fetched entry
    and overridden only when an argument supplies a value — a description-only fix
    on a finished entry no longer converts it into a running timer. (data-loss, HIGH)
  - `clockify_time_off_policies_archive` sends the required `{status}` wire field
    instead of the ignored `{archived}`.
  - The MCP result envelope classifies a real `402` `ClockifyApiError` as
    `feature_unavailable` instead of a catch-all `error`.
  - `clockify_audit_log_search` clamps `pageSize` to the audit-log host's
    documented max of 50 (was 200).
  - `clockify_review_day`/`clockify_review_week` no longer advertise gap/overlap
    detection or accept the inert `min_gap_minutes`/`workday_start`/`workday_end`
    fields — the contract now matches behavior.
  - `shared-reports` `type` allowlist synced to the 19-member generated wire union.
  - A blank/whitespace-only `CLOCKIFY_BASE_URL` is normalized to unset, so the
    server falls back to the default Clockify host instead of crashing at startup.

### Security

- Adversarial-review pass (plan 011):
  - `clockify_demo_cleanup` is gated behind the shared `dry_run` → `confirm_token`
    handshake and restricted to the reserved `DEMO-`/`sdk-demo-` prefix; it marks a
    task `DONE` before deleting it (active-task `DELETE` 400s).

## [0.4.0]

### Changed

- Renamed the package to `@apet97/clockify-mcp-115` (was `@clockify115/mcp-server`)
  and enabled tag-triggered npm publish on a pushed `mcp-v*` tag. Unofficial,
  community-built; the `clockify115-mcp` binary is unchanged and the MCP server
  identity now reports the new name.

### Added

- 5 read-only domain tools — tool surface 135 -> 140 (22 workflow + 118 domain):
  `clockify_invoices_info` (the richer POST /invoices/info filter projection),
  `clockify_invoices_items_list` (an invoice's line items), `clockify_invoices_payments_list`
  (recorded payments), `clockify_reports_expense` (detailed expenses report on the
  reports host), and `clockify_webhooks_events` (offline registry of subscribable
  webhook event types).
- `clockify_doctor`: a read-only live connection-check tool. It validates
  CLOCKIFY_API_KEY against `/user`, confirms the pinned CLOCKIFY_WORKSPACE_ID
  is reachable for that key, reports base-URL posture (host only), and
  estimates clock skew, returning a pass/fail receipt with per-failure
  remediation. It reuses the shared failure-class hints (`mcp/src/diagnose.ts`)
  and gracefully reports `setup_required` when the server started without
  credentials. Tool surface 134 -> 135 (22 workflow + 113 domain).
- docs: add `POSITIONING.md` — a nominative "how this compares to other Clockify
  MCP servers" page and a visual quickstart (install → first call → log work)
  with screenshot/GIF placeholders and a maintainer capture checklist. No tool,
  API, or count changes.
- First-run onboarding: the server `instructions` now point new users at
  `clockify_status` and `clockify://guide/which-tool`; a new zero-argument
  `clockify-getting-started` prompt walks a brand-new user from API key + workspace to
  their first logged entry; and `clockify_status`'s recovery hint now points at that
  prompt when credentials are missing or invalid. No tool was added or removed
  (still 134 tools).
- The MCP server now starts even when `CLOCKIFY_API_KEY`/`CLOCKIFY_WORKSPACE_ID`
  are unset; every tool returns a `setup_required` receipt with the exact fix
  (which env vars to set, where, and where to get them) instead of the process
  crashing at startup. A one-line `setup:` hint is written to stderr (stdout
  stays clean JSON-RPC). New shared error code `setup_required`; tool count
  unchanged (134).
- Added a self-contained one-click MCPB install bundle (`manifest.json`,
  `scripts/build-mcpb.mjs`, `make mcpb`) and reframed the README install flow for
  end users. The builder stages a production install (the `clockify-sdk-ts-115`
  tarball plus `@modelcontextprotocol/sdk` and `zod`) so the packed `.mcpb` runs
  standalone without the monorepo `node_modules`. No tool or API changes (still
  `134 tools`).

### Fixed

- Domain list receipts for clients, projects, tasks, tags, and current-user
  entries now honor Clockify's `Last-Page` response header when it is present,
  instead of relying only on page length for `meta.hasMore`.
- Workflow and domain name resolvers now walk bounded pages for clients,
  projects, tasks, tags, users, expense categories, and time-off policies. Large
  workspaces no longer miss exact name/email matches beyond the first 200 rows,
  and `include-roles:false` is preserved for user lookup.
- Install docs now treat local source/MCPB builds as the current primary path
  until a maintainer attaches real release assets; the new `make mcpb-validate`
  gate validates the bundle manifest without building a release artifact.
- `clockify_shared_reports_create`/`clockify_shared_reports_update` now map the `public`
  argument to the wire field `isPublic`. They previously sent `public`, which the live
  API silently ignores, so requesting a public report had no effect. The tool argument
  name is unchanged.

### Changed

- `clockify_status` now returns a failure-class-aware recovery hint: a `401`/`403`
  points at regenerating the API key (Clockify > Profile Settings > API), a
  `404`/wrong-workspace points at the 24-character workspace id, and a
  network/timeout failure points at connectivity/proxy — instead of one static
  "verify your credentials" string. The mapping lives in `mcp/src/diagnose.ts`
  (`failureHint`) and is reusable via the new `RecoveryResolver` seam in
  `mcp/src/result.ts`. No new error codes; tool count unchanged (134).
- Repointed `clockify_scheduling_assignments_create` and the `clockify_schedule_work`
  workflow to the live `scheduling.createRecurring` endpoint — the bare
  `POST /scheduling/assignments` 404s on live Clockify and was removed from the
  2026-06-23 corrected spec; `published` maps to the separate range-based publish op.
  `createRecurring` returns an array (one entry per occurrence); the tool reads the first
  element for the receipt id, and `published` narrows the publish range to the
  just-assigned user via `userFilter`. The member-profile update tool retypes its body to
  `UpdateMemberProfilesRequest`.
- Tightened `clockify_setup_webhook`'s `name` validation from `min(1)` to
  `min(2).max(30)`, matching the domain `clockify_webhooks_create` tool and the
  live-verified 2–30 constraint on the API-key webhook-create path.

### Security

- `clockify_setup_webhook` (workflow) now redacts the webhook `authToken` HMAC
  signing secret from its result, like the domain `clockify_webhooks_create` tool
  already did. The workflow create path returned Clockify's raw create response —
  which includes `authToken` — verbatim into the result envelope, so an agent
  transcript could leak the signing secret. `redactWebhook` is now exported from
  `webhooks.ts` and applied on the workflow path; `webhooks-redact.test.ts` gains
  a `clockify_setup_webhook` confirm-flow case.

### Added

- `clockify_request_time_off`: a `half_day_period` arg (`FIRST_HALF` |
  `SECOND_HALF`) so an afternoon half-day can be requested. The workflow
  previously hard-coded `FIRST_HALF` whenever `half_day` was true, making an
  afternoon half-day impossible; a bare `half_day: true` still defaults to
  `FIRST_HALF`.

### Changed

- Internal: the byte-identical `listUsers` (workspace user listing, `page-size:
  200`) and `meUserId` (current-user id) helpers that were copy-pasted into the
  holidays, users, scheduling, groups, and time-off tool modules now live once in
  `src/tools/user-refs.ts` (`userRefHelpers(ctx)`). Pure refactor — identical
  request shape, return shape, and behavior; no tool, schema, or output change.

### Fixed

- `clockify_webhooks_create` now **requires** `name` (2–30 chars); it was
  optional, leaving the two webhook-create surfaces inconsistent. Webhook `name`
  requiredness is auth-scheme-dependent (maintainer-confirmed): required on the
  API-key path this SDK uses, optional only for addon-token creates. The primary
  `clockify_setup_webhook` workflow already requires a name, the corrected
  `WebhookRequest` marks it `minLength:2`/`maxLength:30` in `required[]`, and the
  2026-06-21 live API-key probe supplied one — so an omitted name was a latent gap,
  not a supported path. The body builder always sends `name`, and
  `webhooks-create.test.ts` covers the schema boundary (a missing or too-short name
  is rejected before the handler runs). See `spec/evidence/discrepancies.md`
  `webhook.create.name-required-on-api-key-not-addon`.
- `clockify_expenses_create` / `clockify_expenses_update` now promote a date-only
  `date` (`YYYY-MM-DD`) to RFC3339 (`…T00:00:00Z`). The expense endpoint requires
  `yyyy-MM-ddThh:mm:ssZ` and 400s "invalid value for field: [date]" on a bare date
  (live-verified via the shared SDK path). The `record_expense` workflow already
  normalized; these domain tools forwarded the raw arg.
- `clockify_invoices_update_status` sent the wrong wire field — `body: { status }`
  behind an `as never` cast — so the change-status PATCH 400s "invalid value for
  field: [invoiceStatus]... can't be empty" (live-verified) and silently never
  applied. The official op + generated body type both require `invoiceStatus`; the
  body is now `{ invoiceStatus: args.status }` and the cast is dropped (it compiles
  cleanly). + a regression test asserting the wire body.
- `clockify_custom_fields_update`: the workspace custom-field `status` description
  listed the wrong enum (`ACTIVE | INACTIVE`); the official `editCustomField` set is
  `INACTIVE | VISIBLE | INVISIBLE` (matching the sibling project-level tool). A model
  trusting the old text would send `ACTIVE` and 400. Description-only change.

- `clockify_holidays_update`: a start-only edit no longer collapses a multi-day
  holiday to a single day. The replace-PUT body fell back to `args.startDate`
  before the existing `endDate`, discarding it when only the start moved; the
  fallback order is now `args.endDate ?? existingPeriod.endDate ?? args.startDate`.
- `clockify_setup_webhook`: the workflow tool's `event`/`webhook_event` enum now
  carries the full `WebhookEventType` set (51 events, mirrored from the generated
  union with a compile-time exhaustiveness guard) instead of 12, so it no longer
  hard-rejects 39 valid events (e.g. `TIME_OFF_REQUESTED`, `EXPENSE_CREATED`,
  `NEW_INVOICE`) that the low-level `clockify_webhooks_create` already accepted.
- `clockify_invoices_list`: added `page`/`pageSize` (forwarded as `page`/
  `page-size`, surfaced in `meta`), matching every other list tool — a workspace
  with more than one page of invoices was previously stuck on the first page.
- `clockify_users_set_member_rate`: now emits a `writeReceipt` (`entity:
  workspace_member` + `changed.updated`), matching the projects/tasks rate tools,
  so agents can chain on the receipt.
- `clockify_log_work`: dropped the dead `allow_overlap` argument — it was advertised
  in the schema but never read or forwarded to any wire field (no overlap-guard
  exists), so setting it silently did nothing.
- `resolveUserId` (workflow name resolution): the user name lookup now sends
  `page: 1, page-size: 200` like every sibling resolver, so an exact match past the
  default first page on a large workspace is no longer missed.
- Server version drift: the MCP server advertises a hand-typed `version` literal
  in `src/server.ts`, now pinned equal to `package.json` by a test (mirrors the
  CLI's `program.version()` assertion) so a release bump cannot leave it stale
  silently.

### Tests

- Closed two coverage gaps: `mcp/tests/prompt-handler.test.ts` drives the
  `clockify-workflow-plan` prompt callback (the body was never executed by a
  test — both sides of the `goal?.trim() || "not specified"` arm), and
  `mcp/tests/error-codes.test.ts` exercises `errorCodeForMessage`'s message-only
  classification branches.
- Added `mcp/tests/entries.test.ts` (list / log / get / update behavior) and
  raised the mcp coverage floors (branches 67->69, statements 82->84, lines
  86->88, functions 85->86) in `vitest.config.ts` + `docs/coverage-contract.json`.
- Added `mcp/tests/webhooks-redact.test.ts` (no raw `authToken` leaves any webhook
  tool), `mcp/tests/iter-maxpages.test.ts` (the review + groups_get walks stop at
  the `maxPages` cap), `mcp/tests/projects-next.test.ts` (projects-create next
  hint), plus cases in `workflows.test.ts` (DAYS-policy `request_time_off` period
  shape + the neither-end-nor-days error; ambiguous/over-cap `fix_entry`),
  `entries.test.ts` (one EntityRef per id from mark_invoiced),
  `archive-then-delete.test.ts` + `clients-tool.test.ts` + `tasks-tool.test.ts`
  (create/delete next-action hints), and `client.test.ts` (the single-flight
  current-user memo).
- Added cases for: `workflows.test.ts` (record_expense with no `date` is
  confirmable — the defaulted date is stable across dry_run/confirm and the
  mutation runs exactly once); `rates.test.ts` (a numeric-string `amount` "75"
  coerces to 7500 minor units); `result.test.ts` (`cleanIds` strips
  blank/whitespace ids and omits `ids` entirely when all are blank);
  `confirm-guard-matrix.test.ts` (every dry_run preview grounds `workspaceId`
  in meta/ids and carries an executable `next[0]` with the issued
  `confirm_token` + a reason); `confirmation-store.test.ts` (a non-positive
  `ttlMs` falls back to the 5-minute default).

### Fixed

- Official-OpenAPI conformance pass (diffing the MCP tools against
  https://docs.clockify.me/openapi.json found tools sending invalid enums or calling
  routes that 404/405 live):
  - `clockify_approvals_submit` no longer offers the invalid period `BIWEEKLY`
    (official `CreateApprovalRequest.period` = WEEKLY/SEMI_MONTHLY/MONTHLY);
    `clockify_approvals_update_state` now offers the real
    PENDING/APPROVED/WITHDRAWN_SUBMISSION/WITHDRAWN_APPROVAL/REJECTED set instead of
    a bare `WITHDRAWN` it could not act on; `clockify_approvals_list` constrains its
    status filter to the 3 listable values and drops an unchecked cast. Each enum is
    now pinned `as const satisfies readonly ClockifyApi.<Type>[]`, so future enum
    drift fails type-check loudly.
  - `clockify_scheduling_assignments_update` / `_delete` were calling the dead bare
    `PUT|DELETE /scheduling/assignments/{id}` routes (404 "No static resource",
    live-confirmed); they now call the live recurring routes `scheduling.updateRecurring`
    (PATCH .../recurring/{id}) / `scheduling.deleteRecurring` (DELETE .../recurring/{id},
    optional `seriesUpdateOption`). Update returns a clean `invalid_request` if asked to
    reassign user/project (the recurring-edit body cannot express it) rather than
    silently dropping intent; the delete confirm-guard handshake is unchanged.
  - `clockify_groups_list_members` was calling the dead 405 `userGroups.listMembers`
    (GET /user-groups/{id}/users — the spec literally names it "DOES NOT EXIST"); it
    now uses the documented `users.filterWorkspaceUsers({ userGroups:[groupId] })`.
  - `clockify_project_custom_fields_update` no longer sends the non-schema
    `allowedValues` (not part of the official `CustomFieldProjectDefaultValuesRequest`).
  - `clockify_invoices_list` supports multiple statuses + sort column/order (the typed
    GET route honours them) and drops a now-stale `wireBody` escape.
  - `clockify_setup_webhook` makes `name` optional (official `WebhookRequest` marks it
    optional) and omits it when absent. Tool count unchanged (134).
- `clockify_time_off_requests_delete` can now actually delete. It previously called
  the flat `timeOff.delete` route (`DELETE /time-off/requests/{id}`), which 404s
  live, so the tool always failed. It now requires `policyId` and calls the
  policy-scoped `timeOff.withdraw` (`DELETE /time-off/policies/{policyId}/requests/{id}`,
  200 on a PENDING request, live-verified 2026-06-22); the description clarifies that
  only PENDING requests are deletable. Tool count unchanged (134).
- `clockify_scheduling_assignments_list` now requires `start`/`end` and forwards
  them as the query range. The endpoint (`GET .../scheduling/assignments/all`) 400s
  (code 3001) without `start` (live-verified), so the tool previously failed; this
  mirrors the already-required start/end on
  `clockify_scheduling_assignments_list_per_project`. Tool count unchanged (134).
- `clockify_record_expense` with the `date` omitted is now confirmable. The
  confirmation preview defaulted `date` to a millisecond wall-clock
  (`new Date().toISOString()`), which the confirm-guard re-evaluated at a
  different instant when it rebuilt-and-rehashed the preview at confirm time —
  the `preview_hash` never matched, so the common "record a $10 expense"
  (no date) case was un-confirmable forever. The default is now that day's
  sliced `YYYY-MM-DD` (widened by `normalizeDate` to stable midnight-UTC, the
  correct expense-day semantic), identical across dry_run and confirm. (The
  sibling `clockify_invoice_client_work` already slices its default dates; its
  bounded cross-UTC-midnight edge is left as-is.)
- The three rate tools (`clockify_users_set_member_rate`,
  `clockify_projects_set_member_rate`, `clockify_tasks_set_rate`) now accept a
  numeric-string `amount` (`"75"` -> 75) via `zNumberLike`, matching every other
  money field. The model-visible JSON Schema stays `number` (the `z.preprocess`
  unwraps before validation), so `docs/mcp-tools.json` and the tool count are
  unchanged.
- `clockify_timer_start` now emits a `writeReceipt("created","time_entry",…)`
  so an agent gets a chainable `changed.created[].id` (the blessed
  `clockify_entries_log` already did); previously it returned a bare
  success envelope with no change set.
- `clockify_scheduling_assignments_list_per_project` with a `projectId` now
  forwards `start`/`end` to the single-project totals GET — the live route 400s
  (code 3001) without them, so that branch was previously always failing; the
  tool descriptions that claimed it "ignores start/end" are corrected.
- `resolveExpenseCategoryId` (hit when an expenses tool is given a category
  *name*) now unwraps the `{count, categories}` list envelope before
  name-matching; it previously matched against the envelope object and always
  reported the category not found.
- A wrong id (live `400` "X doesn't belong to Workspace" body) now surfaces the
  `not_found` recovery hint in tool receipts instead of `auth_or_permission`
  (shared `error-codes` regenerated).
- `clockify_groups_get` now auto-paginates `userGroups.list` (via `iterAll`)
  instead of scanning only the first 200 groups, so a group past row 200 is no
  longer falsely reported as not found.
- `clockify_fix_entry` (by description) streams the user's time entries instead
  of buffering the entire history into memory: it keeps only matches, throws the
  moment a second match appears, and bounds the scan (asks to narrow the window
  or pass `entry_id` past 10k entries).
- `clockify_time_off_requests_submit` makes `end` optional and requires one of
  `{end, days}`: DAYS-unit policies want `days` (a `{start,end}` submit 400s
  "number of days is not allowed"); HOURS-unit policies want `end`.
- **Security:** the webhook tools (`clockify_webhooks_{create,update,get,list}`)
  no longer emit the webhook `authToken` (the HMAC signing secret) in the result
  envelope — it is redacted to `***redacted***` before the receipt, keeping
  id/name/url/event/enabled. The generated `Webhook` type is untouched.
- `clockify_request_time_off` (workflow tool) now mirrors the domain tool's
  policy-unit-aware period: `end` is optional, a new `days` field is accepted,
  the period is built conditionally (`{start}` plus `end` and/or `days`), and the
  handler returns a clear error before any write when neither `end` nor `days` is
  given — previously it always sent `{start,end}` and deterministically 400'd on
  DAYS-unit policies.
- `clockify_entries_mark_invoiced` now emits one `changed.updated[]` EntityRef per
  time-entry id instead of comma-joining every id into a single malformed ref id
  that no consumer could chain on.
- `clockify_review_day`/`clockify_review_week` and `clockify_groups_get` now cap
  their `iterAll` page walk at `maxPages: 1000`, so a backend that keeps returning
  full pages (or `Last-Page: false`) can no longer spin without end.
- The MCP context now memoizes the current user's id with a per-server-lifetime
  single-flight memo (`createCurrentUserIdMemo`): the id-only `getCurrentUser`
  call sites (per-tool `meUserId` resolvers + entries/timer/review/stop/expense/
  fix-entry/demo paths) share one fetch instead of re-fetching the user on every
  tool call. The `./resolve` wrapper subpath signature is unchanged (`meUserId` is
  still passed in as a resolved string); hand-built test contexts that omit the
  memo fall back to a direct call.

### Changed

- The projects/clients/tasks create + delete domain-WRITE receipts now carry a
  `next` action hint (create -> the natural next tool with the new id wired in;
  delete -> the corresponding list tool to verify removal). No signature change;
  read-only tools stay receipt-free.
- Re-snapshot of the corrected OpenAPI: `clockify_time_off_requests_update_status`
  binds `changeTimeOffRequestStatus` via the typed body-envelope form (no
  `wireBody`) now that the regenerated request marks `note` optional;
  `resolveExpenseCategoryId` / `resolvePolicyId` drop their `wireBody` (the
  regenerated list requests carry `page`/`page-size`). No behavior change.

- Dev-dependency bump: `vitest` and `@vitest/coverage-v8` `2.x` -> `4.x`
  (`^4.1.4` / `^4.1.9`), unifying the vitest major across all three workspace
  packages (wrapper was already on 4.x). No MCP source or behavior change. The
  vitest 4 v8 (AST-aware) coverage provider counts functions/branches more
  granularly than v2; rather than rebaseline down, new behavior tests for the
  `approvals`, `audit`, `tags`, `customFields`, `tasks`, `clients`, and
  `sharedReports` tools lifted the honest v4 coverage (functions 79->86,
  branches 59->68), so the `mcp` floors in `vitest.config.ts` and
  `docs/coverage-contract.json` are pinned to the new measured baseline
  (lines 86, functions 85, branches 67, statements 82). The Stryker mutation
  run executes via `@stryker-mutator/vitest-runner`.
- `clockify_projects_delete` and `clockify_clients_delete` now call the SDK
  helpers `archiveThenDeleteProject` / `archiveThenDeleteClient`
  (`clockify-sdk-ts-115/ensure`) for the live-allowed GET-name → archive → DELETE
  sequence, instead of hand-copying the steps (incl. the clients body-envelope
  archive quirk and empty-name guard, which now throws → `errorResult` via
  `defineTool`'s catch). Behavior, receipts, and the confirm gate are unchanged;
  order still pinned by `mcp/tests/archive-then-delete.test.ts`.
- Reduced the consumer `as never` cast residue after the corrected-OpenAPI
  re-snapshot (annotated `KEEP as never` count fell from 22 to 7). The
  `workspaces.addUser` invite cast is gone (`AddUserWorkspacesRequestFlattened`
  now matches); `timeEntries.update` is a typed local
  `ClockifyRequestBody<UpdateTimeEntriesRequest>`; the `timeOff.list`
  request-search dropped both its request cast and response narrow (typed
  `ListTimeOffRequest` + `TimeOffRequestsResponse`); a stale `expenses` KEEP
  comment was removed (only a response narrow remains). Surviving request escapes
  (invoices.list/update, invoiceItems.import, time-off policy create/update,
  projects.create, expense-categories/time-off-policy list pagination) now route
  through the typed `wireBody<T>` bridge rather than bare `as never`. The
  documented Bucket-C residue (multipart-file on expense create/update, invoice
  status PATCH, time-off status/note + archive naming, `timeEntries.listForUser`
  envelope) stays annotated. No tool surface or behavior change.

### Tests

- Added Stryker mutation coverage for the safety-critical modules
  `src/orchestration/confirmation.ts`, `src/orchestration/confirm-guard.ts`, and
  `src/result.ts` (`mcp/stryker.conf.json`, `npm run mutation`). The run mutates
  the existing Vitest 2 suite; floors are pinned in
  `docs/mutation-score-contract.json` and enforced by `make mutation`. No runtime
  code changed.

### Added

- Structural MCP tool manifest: `docs/mcp-tool-manifest.json`, generated by
  `mcp/scripts/generate-tool-manifest.mjs`, now supplies the tool-name set for
  write-safety and operation-parity gates so registration-format changes do not
  break discovery.
- `clockify_time_off_requests_list` now exposes only POST-search statuses the
  Clockify wire accepts (`ALL`, `PENDING`, `APPROVED`, `REJECTED`); the tool
  schema is covered by `mcp/tests/time-off-search-statuses.test.ts`.
- Measured code coverage: `@vitest/coverage-v8` (v2, version-matched) wired
  into `vitest.config.ts` over `src/**`. New `npm run test:coverage` script;
  floors pinned in `docs/coverage-contract.json` and enforced by
  `make coverage`.
- Behavioral confirm-guard matrix (`mcp/tests/confirm-guard-matrix.test.ts`):
  drives all 17 guarded domain deletes plus 5 high-risk workflow writes through
  `dry_run` -> `confirm_token` via the in-memory client, asserting the mutation
  fires exactly once and only on a valid token.
- Behavioral parity-stamp test
  (`mcp/tests/operation-parity.behavioral.test.ts`): every non-null `sdk` and
  `tsMcp` stamp in `docs/operation-parity.json` resolves to a real callable or
  registered tool.
- Typed the consumer->SDK list-request boundary:
  `projects/clients/tags/tasks/entries/groups/approvals/scheduling` list calls
  now pass generated `ClockifyApi.List*Request` types instead of
  `as never`/`as unknown[]`. Inline single-id extractions collapse onto a new
  `entityId()` helper in `result.ts`. MCP source now enables
  `exactOptionalPropertyTypes`.
- Expanded the shared error-code registry so MCP envelopes and generated
  troubleshooting docs share stable names for rate-limit headers, add-on-token
  scope, host routing, active-delete, dead-route, and delete-name-reservation
  failures.
- Enforced `mcp/.packsnapshot` tarball-content drift in CI, replacing the old
  print-only pack file list.
- 7 new domain tools (**127 → 134**): a `shared_reports` group
  (`clockify_shared_reports_list` / `_view` / `_create` / `_update` / `_delete`)
  for the workspace's public-link reports, plus `clockify_users_invite`
  (add a user to the workspace by email) and `clockify_member_profile_update`
  (update a member's profile). `clockify_shared_reports_delete` is
  confirm-guarded (dry_run → confirm_token) like the other destructive deletes.
  The README intro and the agent-UX/product-surface contracts now state the
  134-tool surface (21 workflow + 113 domain).

### Fixed

- `clockify_time_off_requests_update_status`: the note-required branch is now
  live-verified (2026-06-20). A status PATCH with only `{status}` (no note)
  returns 200, so `note` is optional on the wire — the generated
  `ChangeTimeOffRequestStatus` type wrongly marks it required. The conditional
  `note` is kept and the masking raw `as never` is replaced by the typed
  `wireBody<ChangeTimeOffRequestStatusTimeOffRequest>` escape. The
  `time-off.change-status.union-and-note` discrepancy is now `compensated`.
- `clockify_expenses_create` / `clockify_expenses_update` now resolve an exact
  expense category name before writing, and `clockify_time_off_requests_submit`
  / `clockify_time_off_requests_update_status` do the same for exact policy
  names. A 24-hex id still passes through; an unresolved name stops before the
  API call.
- Workflow entry cleanup/fix helpers now materialize generated `TimeEntry` DTOs
  as plain records at the workflow boundary, keeping MCP receipts type-clean
  after the GOCLMCP required-field schema sync.
- Webhook create/update tools now reject unsafe callback URLs (non-HTTPS,
  loopback, private/link-local, metadata, and embedded-credential hosts) before
  making a Clockify API call.
- `clockify_expenses_categories_list` now unwraps the generated
  `{ categories, count }` envelope and reports the real item count.
- `clockify_time_off_requests_submit` now rejects invalid `halfDayPeriod`
  values at the MCP schema boundary.
- Webhook URL validation now rejects common internal-only host suffixes
  (`.home.arpa`, `.lan`, `.corp`, `.intranet`).
- `clockify_sdk_snippet` pagination/sdk and webhook/sdk snippets now use real
  SDK APIs: `tags.list` with request-object `iterAll`, and single-object
  `constructEvent({ headers, payload, expectedToken })`.
- P2-1 trap-cast corrections (live-probed 2026-06-18):
  - `clockify_scheduling_assignments_list_per_project` now sends the **required**
    `start`/`end` (the all-projects search 400s without them) and camel `pageSize`
    instead of the silently-ignored kebab `page-size`; `start`/`end` are now
    required tool inputs and both `as never` / `as unknown[]` casts are gone.
  - `clockify_time_off_requests_update_status` restricts the settable status to
    `APPROVED` / `REJECTED` (the wire rejects `PENDING` / `WITHDRAWN` as a target).
  - `clockify_time_off_requests_list` unwraps the `{ count, requests }` search
    envelope (it is not a bare array) and reports the server-side `count`.
  - `clockify_time_off_policies_list` builds a typed request (`page` as a string,
    matching the query-string wire form) instead of masking the mismatch with a
    cast. See `spec/evidence/discrepancies.md`
    (`scheduling.list-per-project.start-end-required-camel-pagesize`,
    `time-off.change-status.union-and-note`).
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

- MCP success/error result text is now compact JSON while preserving the same
  structured envelope shape.
- Tool-manifest hardening: the generator now fails closed if runtime
  introspection drops below the known MCP tool floor, the test and generator
  share one offline introspection harness, and write-safety now verifies every
  confirmation-guarded domain tool still advertises `destructiveHint:true`.
- Tool-manifest tests now derive summary assertions from the manifest and
  enforce structural floors instead of exact-count pins, so legitimate tool
  additions do not require a hand-bumped test.
- Coverage thresholds in `vitest.config.ts` now mirror the measured floor in
  `docs/coverage-contract.json`, so bare MCP coverage runs enforce the same
  floor as the cross-package ratchet.
- Internal type-safety: domain/workflow write calls now use generated
  `ClockifyApi.*Request` bindings and the new SDK `requests` seam where the
  generated body-envelope arm is the real wire shape. The write-safety checker
  also accepts multiline `maybeConfirm` / `requireConfirmation` calls, keeping
  the guard proof stable under formatting.
- README: added a "Naming" subsection explaining the two tool grammars
  (workflow verb-phrase vs domain `clockify_<group>_<action>`) and
  linking `docs/naming-taxonomy-policy.md` as the source of truth, plus a
  prose note on why the `clockify_demo_seed` / `clockify_demo_cleanup`
  tools ship by default (they back `npm run verify:live-cleanup`, create
  only prefix-namespaced objects, and `demo_cleanup` is
  `destructiveHint`-guarded).
- completed the type-preserving defineTool migration across all domain +
  workflow tools (P2-2).
- `clockify_create_work_package` is now transactional: it builds its client →
  project → task → tag create-or-reuse steps as a composition (the new SDK
  `clockify-sdk-ts-115/compose`) so a failure mid-way rolls back the entities it
  created (archive-first / DONE-first, since active deletes 400) instead of
  orphaning a half-built package. A required-step failure returns an error
  receipt with a truthful left-behind note; reused entities are never rolled back.
- Added a `defineTool` envelope helper (`result.ts`) that owns the uniform
  `try { … } catch (err) { return errorResult(name, err) }` wrapper so a tool
  carries only its happy path; migrated `status` / `audit` / `timer` onto it.
  The remaining tools stay on `registerTool` pending a type-preserving generic
  seam (the current envelope widens handler args to `Record<string,unknown>`,
  which erases Zod arg inference). Tool count, names, and JSON Schemas unchanged.
- Internal type-safety: dropped gratuitous `as unknown[]` result casts on the
  `tasks` / `clients` / `scheduling` list tools (the typed path already yields
  the generated array). The type-erasing "trap" casts on the scheduling
  per-project and time-off list/status/policy requests are now documented with
  in-code `(P2-1 trap)` comments naming the real latent wire-shape bugs, rather
  than silently narrowed (which would change unproven wire behavior).
- The SDK client the MCP server uses no longer exposes the dead
  `timeEntries.stopTimer` method (the `/stop` route 404s live and was
  quarantined out of the canonical OpenAPI upstream). The timer tools
  already stop via `timeEntries.updateForUser({ end })`; the stale
  `stopTimer` test mock was removed. No tool name or behavior changed.
- `clockify_record_expense`'s `amount` now accepts a numeric string (e.g. `"75"`)
  via `zNumberLike`, matching the domain expense tools; the model-visible JSON
  Schema stays `number`.
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
- Corrected the `eslint.config.mjs` header comment to describe the actual
  type-aware setup (`project: ["./tsconfig.lint.json"]`) instead of the stale
  `projectService: true` note.

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
