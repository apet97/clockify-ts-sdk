# Changelog

All notable changes to `@apet97/clockify-mcp-115` are documented here.

## [Unreleased]

### Changed

- docs: annotate the expenses update request cast with the KEEP convention (no behavior change).

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
