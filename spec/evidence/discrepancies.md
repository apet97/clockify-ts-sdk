# Clockify OpenAPI Discrepancies — Evidence Ledger

Local-only working log. The canonical OpenAPI lives at
`docs/openapi/clockify-openapi.yaml`. This ledger answers, per
endpoint or schema, the same five questions for every divergence
between Clockify's published spec and what the live API returns:

1. **What does official documentation claim?** — pointer into
   `../official/clockify.official.openapi.yaml` (path / operationId).
2. **What does Clockify actually return?** — pointer into
   `probes/<probe-id>.json` (live response fixture) and
   `fixtures/<entity>.json` if a curated golden exists.
3. **Which live test proves it?** — `internal/...` Go test name, the
   `tests/live/...` campaign, or the manual MCP tool invocation that
   produced the probe.
4. **Which MCP tool depends on it?** — list of `clockify_*` tool
   descriptors that consume this shape (registry in
   `internal/tools/oneuser_domains.go`).
5. **Which uncertainty remains?** — explicit open questions; never
   silently resolved. If "uncertain" persists, leave it written.

Add one section per discrepancy. Keep entries small and atomic —
one schema, enum, pagination quirk, or routing surprise per entry.

---

## Findings from initial Fern run (2026-05-24)

First `fern check` against `spec/corrected/clockify.corrected.openapi.yaml`
surfaced **9 errors** (blocking generation) and **8 warnings**
(non-blocking). Errors patched in the workspace copy only —
`docs/openapi/clockify-openapi.yaml` in GOCLMCP is unchanged.

## Findings from Fern TS-SDK type-check run (2026-05-24, evening)

First `tsc --noEmit` against the Fern-emitted TS SDK (`output/ts-sdk/`)
surfaced **26 errors across 5 files**, all the same class
(`TS2300/2687/2717` duplicate-identifier interface members on POST
or PATCH request-body shapes). Root cause traced into the generator
script — fix landed at the source. See entry below.

### `gen-clockify-openapi.merge_parameters.destructive-concat` — RESOLVED 2026-05-24

- **Official claim:** N/A — internal generator script behaviour.
- **Actual behavior (deterministic, reproducible):**
  `../GOCLMCP/scripts/gen-clockify-openapi`'s
  `merge_parameters(path_params, op_params)` used
  `path_params.concat(op_params)` to combine path-item-level
  parameters with operation-level parameters. `Array#concat` is
  destructive — it mutates `path_params` in place and returns it.
  The caller captures `path_params` once per path-item and reuses
  it across every operation under that path
  (`scripts/gen-clockify-openapi` line 769). After the first
  operation iteration (alphabetically `get`), `path_params` was
  polluted with the GET's query parameters; the next iteration
  (`patch` / `post`) then inherited those query params into its
  own parameter list. Result: every POST/PATCH on a path that
  shared the path with a GET sibling carried the GET's query
  params, which Fern's TS emitter flattened into the request-body
  interface as duplicate-identifier members alongside the actual
  body fields.
- **Symptom in TS SDK (5 affected files, 26 tsc errors):**
  - `api/resources/balance/.../PatchWorkspacesWorkspaceIdBalanceRequest.ts`: `policyId`, `userId` (× both required and optional declarations)
  - `api/resources/projects/.../CreateProjectRequest.ts`: `name`, `billable`
  - `api/resources/tag/.../TagCreate.ts`: `name`
  - `api/resources/tasks/.../TaskCreateRequest.ts`: `name`
  - `api/resources/timeOffPolicies/.../CreateTimeOffPolicyRequest.ts`: `name`
- **Live evidence:** `tsc --noEmit` against
  `output/ts-sdk/` before the generator fix produced
  `error TS2300: Duplicate identifier 'name'` (and three sibling
  errors per file).
- **MCP tools affected:** none directly — the MCP layer
  (`internal/tools`) consumes the canonical spec, not the Fern SDK.
  But the leaked query params changed the operation's apparent
  signature in the canonical spec, which is misleading on its
  own and could break tool-descriptor inference if any pass
  walks operation parameters.
- **Open questions:** none.
- **Status:** `fixed-in-generator-script`. The one-line patch
  replaces `path_params.concat(op_params)` with
  `(path_params + op_params)` (Array#+ is non-destructive). Inline
  comment block above the change documents the trap so a future
  refactor doesn't reintroduce it. `make gen-openapi` regenerates
  cleanly; all four drift gates (`openapi-drift`, `catalog-drift`,
  `selfinspect-drift`, `raw-allowlist-drift`) pass.
  `go test ./internal/tools/...` still passes. After the regen,
  `fern check` stays at 0 errors / 8 warnings (unchanged), the
  TS SDK regenerates with single-declaration request-body
  interfaces, and `tsc --noEmit` against the SDK exits 0.

### `time-off.request.status.schema-collision` — RESOLVED 2026-05-24

- **Official claim:** spec defined both an *inline*
  `TimeOffRequest.status` object (fields: `changedAt`, `changedBy`,
  `createdAt`, `createdBy`, `note`, `statusType`) AND a *named*
  `#/components/schemas/TimeOffRequestStatus` (fields: `changedAt`,
  `changedByUserId`, `changedByUserName`, `changedForUserName`,
  `note`, `statusType`). The two shapes disagreed on how the actor
  was named and on whether `createdAt`/`createdBy` existed at all.
- **Actual behavior (live probe, 2026-05-24):** real shape is
  ```json
  {
    "statusType": "APPROVED",
    "changedByUserId": "64621fae…",
    "changedByUserName": "Firstname Lastname",
    "changedForUserName": "Firstname Lastname",
    "changedAt": "2026-05-17T23:51:17.160269150Z",
    "note": null
  }
  ```
  For PENDING, `changedByUserId` and `changedAt` come back as `null`
  but the keys are still present. **No `createdBy` field exists at
  any level.** **`createdAt` lives at top level**, not under
  `status` — captured from a separate probe on the same record.
- **Live evidence:**
  `probes/20260524-time-off-requests-approved.json` and
  `probes/20260524-time-off-requests-pending.json` (raw POST search
  response for the sacrificial workspace; saved from `/tmp/`).
- **MCP tools affected:** `clockify_time_off_approve`,
  `clockify_time_off_deny`, `clockify_time_off_requests_get`,
  `clockify_time_off_requests_list`, `clockify_time_off_requests_update`.
- **Open questions:** none. The named schema wins.
- **Status:** `fixed-in-canonical-generator`. The inline status
  definition lived in
  `docs/openapi/sources/clockify-api-probe-lab/openapi.yaml` at
  the `TimeOffRequest` block (lines 719–727); replaced with
  `$ref: '#/components/schemas/TimeOffRequestStatus'`. Manifest
  sha256 + bytes refreshed in `docs/openapi/sources/manifest.json`.
  `make gen-openapi` regenerates `docs/openapi/clockify-openapi.yaml`
  with the corrected ref; all four drift gates (`openapi-drift`,
  `catalog-drift`, `selfinspect-drift`, `raw-allowlist-drift`) pass.
  `go test ./internal/tools/...` still passes. Re-running
  `fern check` and `fern generate --group ts --local` against
  the regenerated spec produces a clean SDK with the correct
  `TimeOffRequestStatus` interface.

### `time-off.request.missing-top-level-fields` — RESOLVED 2026-05-24

The 2026-05-24 probe revealed the canonical `TimeOffRequest` schema
was missing seven top-level fields and two `timeOffPeriod` details
that the live API returns on **100% of records** (audit: 195/195
across PENDING / APPROVED / REJECTED).

| Field | Type | Coverage | Status |
| --- | --- | --- | --- |
| `policyName` | string | 195/195 | added |
| `userName` | string | 195/195 | added |
| `userEmail` | string (format: email) | 195/195 | added |
| `userTimeZone` | string | 195/195 | added |
| `balance` | number (double) | 195/195 | added |
| `createdAt` | string (date-time) | 195/195 | added |
| `requesterUserName` | string | 195/195 | added |
| `timeOffPeriod.halfDayPeriod` | enum | 195/195 | added (`NOT_DEFINED` x171, `SECOND_HALF` x23, `FIRST_HALF` x1) |
| `timeOffPeriod.halfDayHours` | `{start, end}` datetimes / null | 24 set, 171 null | shape narrowed from `additionalProperties:true` |

Also tightened `balanceDiff` to `format: double` for consistency
with `balance`.

- **Live evidence:** same probes as above
  (`probes/20260524-time-off-requests-{approved,pending}.json`)
  plus the in-memory 200-record audit script (output retained in
  this entry).
- **MCP tools affected:** read paths in
  `clockify_time_off_requests_list`, `clockify_time_off_requests_get`,
  and the rehydration in `_approve` / `_deny` / `_requests_update`.
- **Status:** `fixed-in-canonical-generator`. Patched the same
  `TimeOffRequest` block in
  `docs/openapi/sources/clockify-api-probe-lab/openapi.yaml`,
  refreshed `manifest.json` (`126895 → 128402` bytes). `make
  gen-openapi` regenerated `docs/openapi/clockify-openapi.yaml`;
  all four drift gates green, `go test ./internal/tools/...`
  passes. The regenerated TS SDK now has 17 fields on
  `TimeOffRequest` (was 10), an inline `HalfDayPeriod` enum, and
  a typed `HalfDayHours { start, end }` namespace.

### `routes.literal-vs-parameterized.collisions` — RESOLVED-AT-SCHEMA / 8 Fern warnings remain

Three route families have a literal sub-path that collides with a
sibling `{id}` parameterized route. HTTP routers resolve this with
"literal wins" precedence at runtime; at the spec level the
ambiguity is resolved by constraining the ID path-parameter's
`pattern` so the literal segment cannot satisfy the parameterized
template.

| Literal | Parameterized | Family | Path param |
| --- | --- | --- | --- |
| `/workspaces/{ws}/expenses/categories` | `/workspaces/{ws}/expenses/{expenseId}` | expenses | `expenseId` |
| `/workspaces/{ws}/invoices/settings` | `/workspaces/{ws}/invoices/{invoiceId}` | invoices | `invoiceId` |
| `/workspaces/{ws}/scheduling/assignments/publish` | `/workspaces/{ws}/scheduling/assignments/{assignmentId}` | scheduling | `assignmentId` |

- **MCP tools affected:** `clockify_expenses_categories_*`,
  `clockify_invoice_*`, `clockify_scheduling_publish`,
  `clockify_scheduling_assignments_*`.
- **Resolution:** the generator now stamps a Mongo-ObjectID
  `pattern: ^[0-9a-fA-F]{24}$` onto each of the three colliding
  path params (`PATH_PARAM_PATTERNS` in
  `scripts/gen-clockify-openapi`). Verified 19 path-param
  instances carry the pattern after `make gen-openapi`.
  `categories` / `settings` / `publish` (literal sub-paths) cannot
  satisfy a 24-char hex pattern, so any spec-validating consumer
  unambiguously routes them to the literal sibling.
- **Why Fern still emits 8 warnings:** Fern's path-conflict check
  is purely structural — it compares path templates without
  consulting parameter schemas. There is no suppression flag
  (`fern check --help` confirmed). The warnings are a known
  generator quirk on a structurally-resolved spec; they do not
  block generation and the generated SDK is correct.
- **Status:** `fixed-in-canonical-generator` with a residual
  Fern-noise caveat.

### `sdk.resource-duplication` — RESOLVED 2026-05-24

The generated TS SDK had duplicated resource groups because
upstream OpenAPI sources used inconsistent tag spellings for the
same domain (`Project` + `Projects`, `User` + `Users`, etc.). The
generator now collapses 6 variants into 5 canonical plurals
before emitting tags.

| Old tag (variants) | Canonical | Operations |
| --- | --- | --- |
| `Project` (3) | `Projects` (15) | merged |
| `User` (1) | `Users` (6) | merged |
| `Webhook` (1) | `Webhooks` (10) | merged |
| `TimeEntry` (7), `Time entry` (1) | `Time Entries` (14) | merged |
| `TimeOff` (4) | `Time Off` (12) | merged |

- **MCP tools affected:** none directly — MCP tools name themselves
  explicitly. Affects only downstream SDK consumers.
- **Resolution:** the generator now applies a `TAG_RENAMES` table
  in `scripts/gen-clockify-openapi` during the per-operation
  metadata pass. Tag count dropped 37 → 31. After regen, the
  TS SDK has 32 resource groups (was 36 — the four spurious
  singulars `project` / `user` / `webhook` / `timeEntry` are
  gone). `expenses` + `expenseReport` and `timeOff` +
  `timeOffPolicies` are correctly retained as separate domains.
- **Status:** `fixed-in-canonical-generator`.

---

## Template

### <short slug — e.g. `expenses.create.amount-units`>

- **Official claim:**
- **Actual behavior:**
- **Live evidence:**
- **MCP tools affected:**
- **Open questions:**
- **Status:** `open` | `compensated-in-corrected-spec` | `compensated-in-tool-layer` | `wontfix`

---

## Known discrepancies (seed list — port from CLAUDE.md "Clockify API notes")

Each of the items below already lives in CLAUDE.md as a one-line
operational rule. Each deserves its own entry here with concrete
probe evidence before the corrected spec is allowed to claim
"live-verified".

- `time-off.requests.list`: POST not GET (official spec says GET);
  GET returns 405. — affects `clockify_time_off_requests_list`.
- `time-off.approve|deny|requests-update`: PATCH returns a sparse
  body; tool layer re-hydrates with a follow-up GET, surfaced via
  `meta.rehydrate_failed`. — affects `clockify_time_off_approve`,
  `_deny`, `_requests_update`.
- `scheduling.assignments.delete`: real route is
  `DELETE /scheduling/assignments/recurring/{id}`; the bare
  `/scheduling/assignments/{id}` returns 404. — affects
  `clockify_scheduling_assignments_delete`.
- `expenses.categories.list`: server caps a single page; un-paginated
  read silently drops categories. — affects
  `clockify_expenses_categories_*`, `clockify_record_expense`.
- `reports.*`: amounts in minor units (cents); `meta.amountUnit` and
  `meta.totalAmount` carry normalized major-unit totals. Family-
  specific totals keys: `totals_summary`,
  `group_totals_summary`, `weekly_totals_summary` — not always the
  legacy top-level `totals`. — affects every `clockify_reports_*`.
- `audit-logs.search`: server caps/ignores `pageSize`; tool reports
  `requested_page_size` and a lower-bound total in meta. — affects
  `clockify_audit_logs_search`.
- `invoices.send`, `webhooks.test`, `invoices.items.update`: no
  upstream endpoint exists; tools return a clean `unsupported` error
  pointing at the working alternative. — affects the three
  respective `clockify_*` tools.
- `holidays.get|update`: not equivalent to `list|create|delete`;
  partial update merges from current state. — affects
  `clockify_holidays_get`, `_update`.
- `expenses.categories.update`: Clockify's PUT requires `name`;
  handler pre-fetches and merges if caller omits. — affects
  `clockify_expenses_categories_update`.
- `groups.update`: requires full desired membership in `user_ids`,
  not a partial append. — affects `clockify_groups_update`.
- `approvals.requests.list`: only `PENDING`, `APPROVED`,
  `WITHDRAWN_APPROVAL` are listable. — affects
  `clockify_approvals_list`.
- `entries.timer.stop`: idle stop is a clean no-op
  (`stopped:false`, `reason:"no timer running"`), not a 404. —
  affects `clockify_entries_timer_stop`.
- `pagination`: most list endpoints return `Last-Page` header, not
  a total. Tools synthesize `total_min` lower-bound on full pages
  rather than an authoritative `total`. — affects every paginated
  `clockify_*_list`.

Each of these needs:
- a probe fixture under `probes/`,
- a pointer to the Go live test that proves it,
- and an explicit status (already-compensated vs still-open in the
  corrected spec).

### `fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings` — DOCUMENTED 2026-05-24

- **Official claim:** Three pairs of routes co-exist in Clockify's
  API surface where a literal sub-segment sits next to a templated
  `{id}` sibling. All six routes are first-class in the upstream
  spec (`docs/openapi/sources/realOPENAPI/{EXPENSES,INVOICES,SCHEDULING}OPEAPI.YAML`
  for the literal halves, and the same files plus
  `clockify-api-probe-lab/openapi.yaml` for the templated halves).
  The pairs:
  - `/workspaces/{workspaceId}/expenses/categories` (literal,
    `getExpenseCategories` / `addExpenseCategory`) vs
    `/workspaces/{workspaceId}/expenses/{expenseId}` (templated,
    `getExpenseById` / `updateExpense` / `deleteExpense`).
  - `/workspaces/{workspaceId}/invoices/settings` (literal,
    `getInvoiceSettings` / `updateInvoiceSettings`) vs
    `/workspaces/{workspaceId}/invoices/{invoiceId}` (templated,
    `getInvoiceById` / `updateInvoice` / `deleteInvoice`).
  - `/workspaces/{workspaceId}/scheduling/assignments/publish`
    (literal, `publishAssignments`, PUT-only) vs
    `/workspaces/{workspaceId}/scheduling/assignments/{assignmentId}`
    (templated; auto-named at canonical line 8756).

  OpenAPI 3.0.3 §4.8.5.4 explicitly defines precedence:
  > "the concrete definition, `/pets/mine`, will be matched first if used"
  so the spec-level "ambiguity" is a known-resolved case where
  concrete > templated.

- **Actual behavior (live probes, 2026-05-24, workspace
  `65b382b606de527a7ee2b60e`):**
  - `GET /expenses/categories` → 200, 140 categories returned
    (probes/`20260524-expenses-categories-list.json`).
  - `GET /expenses/aaaaaaaaaaaaaaaaaaaaaaaa` → 400, error code 501
    `Expense doesn't belong to Workspace`
    (probes/`20260524-expenses-id-not-found.json`).
    Server routed the 24-hex segment to the `{expenseId}` handler.
  - `GET /invoices/settings` → 200, settings payload
    (probes/`20260524-invoices-settings.json`).
  - `GET /invoices/aaaaaaaaaaaaaaaaaaaaaaaa` → 400, error code 501
    `Invoice doesn't belong to Workspace`
    (probes/`20260524-invoices-id-not-found.json`).
  - `GET /scheduling/assignments/publish` → 405,
    `Request method 'GET' is not supported`
    (probes/`20260524-scheduling-publish-get-rejected.json`).
    Confirms the literal endpoint exists; it's PUT-only.
  - `GET /scheduling/assignments/aaaaaaaaaaaaaaaaaaaaaaaa` → 404,
    `No static resource ...` (probes/`20260524-scheduling-assignment-not-found.json`).
    Server routed the 24-hex segment to the `{assignmentId}` handler.
  Both shapes on the server. Concrete-takes-precedence is the
  observed precedence; the spec models reality.

- **Live evidence:** the six probe fixtures listed above, all
  captured 2026-05-24 against `CLOCKIFY_WORKSPACE_ID=65b382b606de527a7ee2b60e`
  with `curl -H "X-Api-Key: $CLOCKIFY_API_KEY"`. Each fixture is the
  raw response body (no editing).

- **MCP tools affected:** none — `internal/tools/` consumes the
  canonical spec, which models both routes. The MCP runtime never
  encounters the spec-level ambiguity; it generates explicit URLs
  per operation. Fern's `no-conflicting-endpoint-paths` rule is a
  static spec-shape check, not a runtime concern.

- **Open questions:**
  1. None on the API behavior side — probes are definitive.
  2. Fern-tooling side: no workspace-level rule-disable mechanism
     exists for OpenAPI-only Fern workspaces as of Fern CLI 5.37.9.
     Tried `fern.config.json check.rules.no-conflicting-endpoint-paths: off`
     and `fern check` rejected it (`Unrecognized key(s) in object: 'check'`).
     Fern's `getRuleSettings` API exists in the CLI bundle but is
     not surfaced for `fern.config.json` against an OpenAPI spec.
     `x-fern-ignore: true` exists but would omit the operation from
     the generated SDK — wrong tool for this case.

- **Status:** `resolved-via-new-parser` (2026-05-24). The
  canonical spec generator (`../GOCLMCP/scripts/gen-clockify-openapi`)
  already stamps `pattern: "^[0-9a-fA-F]{24}$"` on `expenseId`,
  `invoiceId`, and `assignmentId` path params (function
  `stamp_path_param_patterns!`, line 685; allowlist at line 673-677).
  31 pattern annotations land in the canonical YAML. This is the
  OpenAPI-correct disambiguator. Fern CLI 5.37.9's *legacy*
  `no-conflicting-endpoint-paths` rule does not consume `pattern`
  constraints when evaluating path-template overlap, so
  `fern check --warnings` still prints the 8 warnings.

  **Resolution:** invoke `fern check --warnings --from-openapi`
  instead. The new parser parses OpenAPI directly to IR without
  the intermediate Fern Definition tag-grouped service
  representation that triggers the legacy rule. With the new
  parser, the check exits with **"All checks passed"** (0 errors,
  0 warnings). The new parser does report 2 informational notes
  about response/request example summary pairing on POST
  `/workspaces/` — non-blocking, unrelated to the route-conflict
  question.

  `fern generate --group ts --local --force` still uses the
  legacy IR pipeline internally (no `--from-openapi` flag exists
  for generate), so the legacy "8 warnings" line prints in its
  output — but generation succeeds and the resulting SDK is
  clean (`tsc --noEmit` exits 0). The warnings are *informational*
  during generate, not blocking. The user-facing validation
  command (`fern check`) is now 0/0 with the `--from-openapi`
  flag. Workspace `README.md` should be updated to recommend
  `fern check --warnings --from-openapi` for routine validation.

### `time-off-b.yaml.changedForUserName.malformed-inline-yaml` — RESOLVED 2026-05-24

- **Official claim:** `TimeOffRequestStatus.changedForUserName` is
  a nullable string field on the time-off request status object.
  The properly-formed sibling fields (`changedByUserId`,
  `changedByUserName`, `changedAt`, `note`) all use flow-style
  inline YAML `field: { type: string }` (space after the colon).
- **Actual behavior (spec-level bug):** in
  `docs/openapi/sources/clockify-api-probe-lab/openapi-fragments/time-off-b.yaml:157`
  the line was written without a space after the key colon:
  `changedForUserName:{ type: string }`. YAML accepts this leniently
  (some parsers treat it as a scalar key with mapping value, some
  reject), but the bytes propagated into the canonical spec
  unchanged at line 21323. Fern CLI 5.37.9's new `--from-openapi`
  parser correctly flagged this as `Schema property
  changedForUserName: { type should be an object`.
- **Live evidence:** confirmed by running `fern check --warnings
  --from-openapi` from `spec/fern/` before and after the patch.
  Before: 1 warning at line 21323 of the corrected snapshot. After:
  "All checks passed" (modulo 2 unrelated example-pairing notes).
- **MCP tools affected:** none directly. The Go MCP layer parses
  the canonical YAML with `gopkg.in/yaml.v3` which is permissive
  enough to accept the malformed line, so live-test flows for
  `clockify_time_off_*` tools were unaffected.
- **Open questions:** none.
- **Status:** `fixed-at-source`. Single character added (a space
  after the colon) in `time-off-b.yaml:157`. Source manifest
  (`docs/openapi/sources/manifest.json`) updated to record the new
  size (7630 bytes) and sha256
  (`3281b9843cb04b88a886986a638466c2a2c83be190455554c4285f09e8497cc5`).
  `make gen-openapi` regenerates cleanly (193 operations); all four
  drift gates (`openapi-drift`, `catalog-drift`, `selfinspect-drift`,
  `raw-allowlist-drift`) exit 0; `go test ./internal/tools/...`
  passes (10.0s). After refreshing the workspace's
  `spec/corrected/clockify.corrected.openapi.yaml` snapshot,
  `fern check --warnings --from-openapi` reports "All checks
  passed", `fern generate --group ts --local --force` succeeds,
  and `tsc --noEmit` against `output/ts-sdk/` exits 0.

### `gen-clockify-openapi.pagination-params-stamped` — RESOLVED 2026-05-24

- **Official claim:** Clockify's published OpenAPI surfaces (the
  `AIII`, `realOPENAPI`, and `clockify-api-probe-lab` source bundles)
  declare `page` + `page-size` query parameters on a subset of list
  endpoints. As of 2026-05-24 they appear on exactly 7 GET operations:
  `getWorkspaceProjects`,
  `getWorkspacesWorkspaceIdTimeEntriesStatusInProgress`,
  `getBalancesForPolicy`, `getBalanceForUser`,
  `getTimeOffPolicies`, `findWorkspaceUsers`, `findUserTeamManagers`.
- **Actual behavior (live, 2026-05-24, workspace
  `65b382b606de527a7ee2b60e`):** the live API accepts `?page=N&page-size=M`
  and returns a `Last-Page: <bool>` header on 11 *additional* list
  endpoints whose source-spec declarations omit those params. Probe
  evidence (raw JSON bodies + raw response headers) saved as
  `probes/20260524-pagination-<endpoint>.{json,hdr}` for:
  approval-requests, clients, tags, user-groups, custom-fields,
  holidays, scheduling-assignments-all, user-time-entries,
  invoice-payments, project-custom-fields, project-tasks.
  Three additional endpoints from the array-returning-GET survey
  were probed but skipped from the stamping list: `/workspaces`
  (top-level) ignores `page-size` and returns the full collection,
  `/workspaces/{wsId}/balance` returned 404 (likely needs different
  query shape; defer), `/workspaces/{wsId}/holidays/in-period`
  returned 400 (the `start`/`end` params have a stricter format than
  the probe used; defer).
- **Live evidence:** the 17 probe files listed above, plus the
  earlier conflict probes from item 1 that re-confirm the
  workspace + API key shape.
- **MCP tools affected:** none directly. The Go MCP layer doesn't
  parse `x-fern-pagination` and synthesizes its own pagination
  (see the existing entry in this ledger on `pagination: most list
  endpoints return Last-Page header`). The newly stamped params
  make MCP tool descriptors slightly more accurate.
- **Open questions:**
  1. ~~The 3 deferred endpoints (`/workspaces`, `balance`,
     `holidays/in-period`) need follow-up — should they paginate in
     the spec, and if so what query shape do they accept on the live
     API?~~ **RESOLVED 2026-05-24 (re-probe).** All three confirmed
     **NOT paginated**. Full evidence captured under
     `deferred-list-endpoints.not-paginated-or-not-live` below.
     None added to `PAGINATED_LIST_OPS`.
- **Status:** `fixed-in-generator-script`. `scripts/gen-clockify-openapi`
  now carries a `PAGINATED_LIST_OPS` set + `PAGE_PARAM_DEFAULT` /
  `PAGE_SIZE_PARAM_DEFAULT` parameter templates + an
  `ensure_pagination!(op, method, path)` function. The function is
  called from the operation-finalization loop alongside
  `stamp_path_param_patterns!`. It idempotently appends `page` and
  `page-size` query params to any operation listed in
  `PAGINATED_LIST_OPS` that doesn't already declare them. After
  regen, the canonical spec has 18 ops with both params (was 7).
  `make gen-openapi` clean, all four drift gates exit 0,
  `go test ./internal/tools/...` passes (9.2s). `fern check
  --warnings --from-openapi` reports "All checks passed", `fern
  generate --group ts --local --force` succeeds, `tsc --noEmit`
  against `output/ts-sdk/` exits 0.

### `fern.x-fern-pagination.bare-array-unsupported` — DOCUMENTED 2026-05-24

- **Official claim (Fern docs):** the `x-fern-pagination` OpenAPI
  extension instructs Fern's SDK generators to emit auto-pagination
  helpers (an `AsyncIterable<T>` in the TypeScript SDK). The offset
  schema is `offset: $request.<page-param>`, `results:
  $response.<list-field>`.
- **Actual behavior (live Fern CLI 5.37.9):** the `results` field
  must be a dot-delimited sub-path of the response schema. Strings
  like `$response`, `$response.body`, `$response[*]` are rejected
  at `fern generate` time with errors:
  - `Pagination configuration for endpoint X must define a
    dot-delimited 'results' property starting with $response (e.g.
    $response.results).`
  - `Pagination configuration for endpoint X specifies 'results'
    $response.body, which is not a valid 'results' type.`
- **Live evidence:** `fern generate --group ts --local --force`
  output captured 2026-05-24 against the corrected snapshot with
  `x-fern-pagination` stamped on each of the 18 list ops. 19
  errors fired (one per op + an extra type-validation on
  `getTimeOffPolicies`'s `offset $request.page` referencing a
  `type: string` page param).
- **MCP tools affected:** none. This is an SDK-generator
  limitation; the MCP layer does its own pagination.
- **Open questions:**
  1. Is there a Fern overrides syntax that can wrap a bare-array
     response in a synthetic envelope at SDK-generation time
     without breaking the runtime (where the actual API returns
     the bare array)? Likely not — the SDK would deserialize the
     bare array, hit `.results`, and crash. Doc-fetch attempts on
     `buildwithfern.com/learn/api-definitions/openapi/extensions/pagination`
     and `.../sdks/capabilities/auto-pagination` 404'd; sending a
     direct support@buildwithfern.com question is the documented
     escape hatch.
  2. Until Fern adds bare-array offset support, the TS SDK ships
     without auto-pagination. The wrapper layer planned for item 4
     (`./output/ts-sdk/` → publishable package) can
     ship a hand-written iterator helper that consumes
     `page`/`page-size` and stops on `Last-Page: true`.
- **Status:** `documented-blocking-upstream`. `x-fern-pagination`
  is **not** stamped on any Clockify operation. The `page` and
  `page-size` query params are stamped — that's still a real spec
  improvement consumed by callers, MCP tools, and any downstream
  generator (Speakeasy, Stainless, etc.) that doesn't share Fern's
  strict envelope requirement. Re-evaluate when Fern publishes a
  release that documents bare-array pagination support or when an
  overrides-side workaround is discovered.

### `fern.x-fern-sdk-method-name.drops-resource-modules` — DEFERRED 2026-05-24

- **Official claim:** Fern's `x-fern-sdk-method-name` OpenAPI extension
  overrides the operationId-derived SDK method name. Applied per-op,
  it should rename e.g. `getWorkspacesWorkspaceIdTags()` to `list()`
  inside the `tags` resource module without affecting any other op.
- **Actual behavior (Fern CLI 5.37.9, fern-typescript-node-sdk
  3.71.2):** stamping `x-fern-sdk-method-name` on 135 of 193
  operations via a generator post-processor (heuristic deriving
  list / get / create / update / delete / partialUpdate / archive
  from method + URL shape) caused Fern's TS generator to **silently
  drop 12 entire resource modules** from the output:
  - tags, holidays, expenses, expenseCategories, expenseReport,
    files, memberProfiles, reports, sharedReport, timeOffPolicies,
    auditLogReport, entityChangesExperimental.

  The IR (intermediate representation) at
  `/private/var/folders/.../fern-*/ir.json` retained all 31 services
  (`service_tag`, `service_holidays`, `service_files`, ...). Fern
  check passed (`✓ All checks passed`). The Docker container's
  generator log (`/private/var/folders/.../tmp-*-*`) only emitted
  `/src/api/resources/<19 modules>/` paths — never started generating
  the 12 missing modules. No warnings, no errors, no skip messages
  for the dropped modules. The Tag-related types
  (`TagDto`, `ContainsTagFilter`, `ReportTagDto`, `TagsError`) were
  generated under `types/`, confirming the IR knew about the data
  shapes; only the resource module emission was skipped.
- **Live evidence:** the regression reproduces deterministically:
  enabling the `stamp_sdk_method_name!` call in the generator's
  per-op loop and re-running `make gen-openapi` + `fern generate
  --group ts --local --force` drops the 12 modules; removing the
  call brings all 32 back. SDK directory listings + IR snapshots
  captured 2026-05-24 (not committed; reproducible).
- **MCP tools affected:** none. The Go MCP layer doesn't consume
  the TS SDK.
- **Open questions:**
  1. Why does Fern silently drop modules instead of warning? Is
     there a collision with the type namespace (`TagDto` →
     `Tag` derived ID → conflict with `Tags` module)? Fern's
     fern-typescript-node-sdk container source isn't directly
     readable from this workspace.
  2. Does an `x-fern-sdk-group-name` annotation alongside
     `x-fern-sdk-method-name` change behavior? Untested.
  3. Does the new `--from-openapi` parser surface the issue
     differently? `fern generate` has no `--from-openapi` flag at
     CLI 5.37.9, so this can't be tested without a generator-side
     opt-in.
  4. Would stamping `x-fern-sdk-method-name` on only collision-free
     ops (omitting Holidays' second `list` and any other
     intra-group collision) avoid the cascade? Untested; the
     bisect showed the cascade affected Tags (5 ops, all distinct
     methods, no internal collision) too, so collision-avoidance
     alone is unlikely to be the full fix.
- **Status:** `deferred-needs-upstream-investigation`. The
  `stamp_sdk_method_name!` call has been removed from the
  generator's per-op finalization loop and the `derive_sdk_method_name`
  + `stamp_sdk_method_name!` function bodies replaced with a NOTE
  comment block at the same location. Re-enable only after the
  drop-modules behavior is reproduced upstream (file an issue at
  fern-api/fern with this repro) or empirically isolated. Until
  then, SDK callers consume the upstream operationId-derived method
  names (e.g. `tags.getWorkspacesWorkspaceIdTags()`) — long but
  stable, and all 32 resource modules are emitted.

### `tag-renames.singular-to-plural` — RESOLVED 2026-05-24

- **Official claim:** Clockify's published OpenAPI tags mix singular
  and plural for collection-shaped resources — `Tag` next to
  `Tasks`, `Client` next to `Users`, `Policy` next to `Roles`,
  `Approval` next to `Workspaces`, `Balance` next to `Webhooks`.
  Fern's TS generator names resource modules after the tag, so the
  inconsistency surfaces as mixed-case SDK shape:
  `client.tag.getX()` vs `client.tasks.getY()`.
- **Actual behavior:** 5 tag values were unchanged across the
  generator's `TAG_RENAMES` map and produced singular SDK module
  names: `tag`, `client`, `policy`, `approval`, `balance`. All five
  reference collection-shaped resources (multiple records per
  workspace). The brief item 7 calls these out as "an annoying UX
  inconsistency for SDK users."
- **Live evidence:** SDK resource-module directory listings before
  and after the rename:
  - Before: `tag`, `client`, `policy`, `approval`, `balance` (+ 27 others).
  - After: `tags`, `clients`, `policies`, `approvals`, `balances` (+ 27 others).
- **MCP tools affected:** none — `internal/tools/` doesn't depend
  on tag spelling.
- **Open questions:**
  1. ~~`SharedReport` (already PascalCase one-word) becomes module
     `sharedReport`. Should it be `sharedReports` for collection
     consistency?~~ **RESOLVED 2026-05-24 (session 2).** Added
     `"SharedReport" => "Shared Reports"` to `TAG_RENAMES`; the
     two-word string drives Fern's casing to `sharedReports`. Five
     ops covered: public bare GET, list, create, update, delete.
     SDK module now `client.sharedReports.*`.
  2. `Scheduling` is an action category, not a collection. Leaving
     as-is.
- **Status:** `fixed-in-generator-script`. `TAG_RENAMES` in
  `../GOCLMCP/scripts/gen-clockify-openapi` extended with
  five new entries:
  `"Approval" => "Approvals"`,
  `"Balance" => "Balances"`,
  `"Client" => "Clients"`,
  `"Policy" => "Policies"`,
  `"Tag" => "Tags"`.
  After regen, the SDK ships with 32 plural-shaped resource modules
  (was 27 plural + 5 singular). All gates green:
  `make {openapi,catalog,selfinspect,raw-allowlist}-drift → 4× EXIT 0`,
  `go test ./internal/tools/... → ok`, `fern check --warnings
  --from-openapi → All checks passed`, `fern generate --group ts
  --local --force → success`, `tsc --noEmit → EXIT 0`.

### `deferred-list-endpoints.not-paginated-or-not-live` — RESOLVED 2026-05-24 (re-probe)

Re-probed the three list endpoints that the initial 2026-05-24 pass
deferred from `PAGINATED_LIST_OPS` (see
`gen-clockify-openapi.pagination-params-stamped` open question 1).
Conclusion: **none of the three paginate**; none added to
`PAGINATED_LIST_OPS`. Two ignore pagination params; one returns 404
on the bare route (the granular variants — already in
`PAGINATED_LIST_OPS` — are the live equivalents).

| Path                                             | HTTP | Items | `page` honored | `page-size` honored | Decision                            |
| ------------------------------------------------ | ---- | ----- | -------------- | ------------------- | ----------------------------------- |
| `GET /workspaces`                                | 200  | 28    | no             | no (tried all 5)    | not paginated                       |
| `GET /workspaces/{wsId}/balance?policyId=…`      | 404  | n/a   | n/a            | n/a                 | route absent live (use granular)    |
| `GET /workspaces/{wsId}/holidays/in-period`      | 200  | 5     | no             | no                  | not paginated                       |

- **Official claim:** the canonical spec
  (`spec/corrected/clockify.corrected.openapi.yaml`) lists all three
  as first-class `200 OK → array<T>` operations.
- **Actual behavior (live, 2026-05-24, sandbox workspace
  `65b382b606de527a7ee2b60e`):**
  1. `GET /workspaces?page=1&page-size=1` returned **all 28** records
     (200 102 bytes). Also tried `?per_page=1`, `?size=1`, `?limit=1`,
     `?pageSize=1` — every variant returned the full 28-record list
     unchanged. The endpoint is a collection enumerator with no
     server-side paging.
  2. `GET /workspaces/{wsId}/balance?policyId=<real>` returned
     `HTTP 404 {"message":"No static resource v1/workspaces/{wsId}/balance.","code":3000}`.
     The bare `/balance` route does not exist on the live API. The
     granular routes `/workspaces/{wsId}/time-off/balance/policy/{policyId}`
     and `/workspaces/{wsId}/time-off/balance/user/{userId}` are the
     live equivalents and are **already stamped** in
     `PAGINATED_LIST_OPS`.
  3. `GET /workspaces/{wsId}/holidays/in-period?assigned-to=<user>&start=<iso8601>&end=<iso8601>`
     returned 5 records (HTTP 200). Re-probed with
     `&page=1&page-size=2` → still 5 records. Re-probed
     `&page=2&page-size=2` → same 5 records with the same IDs.
     Pagination params are silently accepted and ignored.

- **Live evidence (all `2026-05-24`, ignored by `.gitignore`):**
  - `probes/20260524-deferred-workspaces-paged.{json,hdr}`
  - `probes/20260524-deferred-balance-policy.{json,hdr}`
  - `probes/20260524-deferred-holidays-in-period.{json,hdr}`
  - `probes/20260524-deferred-holidays-paged.{json,hdr}`
  - `probes/20260524-deferred-holidays-p2.{json,hdr}`

- **MCP tools affected:** none.
  `clockify_workspaces_*` lists the user's workspaces without
  pagination today; `clockify_time_off_balance_*` already routes to
  the granular endpoints; `clockify_holidays_in_period_*` (if any)
  works in single-shot mode.

- **Open questions:**
  1. ~~The bare `/workspaces/{wsId}/balance` operation exists in the
     canonical spec but returns 404 live. Should it be marked
     `x-clockify-live-status: live-404` and demoted to
     `probe-documented-only`, or removed entirely in favour of the
     two granular routes?~~ **RESOLVED 2026-05-24 (session 2,
     follow-up).** Added `["get", "/workspaces/{workspaceId}/balance"]`
     and `["patch", "/workspaces/{workspaceId}/balance"]` to
     `PHANTOM_PATHS` in `../GOCLMCP/scripts/gen-clockify-openapi`.
     The merger quarantines both ops on every regen with an audit-trail
     reason. After regen the canonical spec carries **191 operations
     (was 193)** and the raw-write allowlist drops to **134 routes
     (was 136)**. The granular `/time-off/balance/policy/{policyId}`
     and `/time-off/balance/user/{userId}` routes remain the live API
     surface; both are in `PAGINATED_LIST_OPS` and unchanged.
  2. Why does `/workspaces` top-level return the full collection
     unconditionally? It's a self-referential enumeration ("my
     workspaces") so the user typically has ≤ 100; the server may
     have decided pagination is unnecessary. No fix needed in this
     SDK.

- **Status:** `documented-not-paginated` (the holidays + workspaces
  top-level bits) **and** `phantom-path-quarantined` (bare `/balance`,
  GET + PATCH). No change to `PAGINATED_LIST_OPS`. The `wrapper/`
  package's `balances` module now exposes only the granular
  `getBalanceForUser` / `getBalancesForPolicy` / `updateBalance`
  operations.

### `getTimeOffPolicies.sort-order.enum-tightened` — RESOLVED 2026-05-24

- **Official claim:** Clockify's public docs page for `Time Off
  Policies → Get policies on a workspace` declares the `sort-order`
  query parameter as `string` with `default: ASCENDING` — but the
  rendered field carries only two valid values (`ASCENDING`,
  `DESCENDING`), matching the enum on every other `sort-order` param
  in the API. The canonical generator already exposes
  `BalanceSortOrder` with that enum (lines 15079-15084 of
  `docs/openapi/clockify-openapi.yaml`).
- **Actual behavior:** the source-bundle declaration in
  `docs/openapi/sources/realOPENAPI/POLICIESOPENAPI.YAML:74-80`
  modelled `sort-order` as a plain `type: string` with a default, no
  enum. The canonical preserved the looser shape. The Fern-generated
  TS SDK therefore typed
  `GetTimeOffPoliciesRequest['sort-order']` as `string`, losing the
  enum surface that the official docs imply.
- **Live evidence:** verified directly against Clockify's official
  API reference (visible at the policies endpoint section);
  cross-checked against the `BalanceSortOrder` enum reused by the
  balance routes.
- **MCP tools affected:** none — the Go MCP layer doesn't read
  `sort-order` for policies today.
- **Open questions:** none. `BalanceSortOrder` was not reused
  verbatim because its name implies a balance-only scope; an inline
  enum at the param level lets the Fern generator emit a
  semantically-scoped `GetTimeOffPoliciesRequestSortOrder` type next
  to the request. If a future cycle consolidates every
  `sort-order` field, rename `BalanceSortOrder` → `SortOrder` and
  ref both call sites.
- **Status:** `fixed-at-source`. Added the enum + restated default
  in `docs/openapi/sources/realOPENAPI/POLICIESOPENAPI.YAML`,
  refreshed source manifest (28915 → 28976 bytes; sha256
  `1228ecd0ffa99882bbc284b4df517eb05703ce046fc1f5b7eccf96491029f881`).
  `make gen-openapi` clean; all four drift gates pass;
  `go test ./internal/tools/...` passes (10.3s);
  `fern check --warnings --from-openapi` reports "All checks passed"
  modulo the 2 unrelated example-pairing notes;
  `fern generate --group ts --local --force` succeeds; the regenerated
  TS SDK exposes
  `GetTimeOffPoliciesRequestSortOrder = { Ascending: "ASCENDING",
  Descending: "DESCENDING" }` at
  `src/api/resources/timeOffPolicies/types/GetTimeOffPoliciesRequestSortOrder.ts`;
  `tsc --noEmit` clean; `npm pack --dry-run` yields 2899 files /
  331.8 kB (was 2895 / 331.6 kB before — added the enum + its
  declaration + sourcemap + index re-export).

### `getBalanceForUser.page-types.docs-claim-string` — DOCUMENTED 2026-05-24

- **Official claim:** Clockify's public docs render `page` and
  `page-size` on `getBalanceForUser` (`GET
  /workspaces/{wsId}/time-off/balance/user/{userId}`) as
  `string <= 1000` and `string [1..200]`. The same docs page renders
  `page` and `page-size` on the sibling `getBalancesForPolicy`
  endpoint as `integer <int32>`.
- **Actual behavior:** both balance endpoints' source-bundle
  declarations in
  `docs/openapi/sources/realOPENAPI/BALANCEOPEANI.yaml` normalize
  these params to `type: integer, format: int32` with consistent
  min/max constraints (consistent with the broader API where every
  other `page` / `page-size` is int32). The live API accepts integer
  values on both routes.
- **Live evidence:** the source bundle is the local-curated truth;
  the Clockify docs are inconsistent across the two sibling
  endpoints (string for one, integer for the other) which is almost
  certainly a docs-generation artefact rather than a real API
  contract.
- **MCP tools affected:** none.
- **Open questions:** the docs inconsistency is not worth chasing
  upstream — the integer shape ships in both source bundle and
  canonical YAML, and live API calls work fine.
- **Status:** `documented-prefer-source-bundle`. No spec change.
  This entry exists so a future reviewer who reads the official
  docs paste and notices the string-vs-int divergence sees the
  decision already taken.

### `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive` — DOCUMENTED 2026-05-24

- **Official claim:** Clockify's OpenAPI declares two security schemes
  `ApiKeyAuth` (header `X-Api-Key`) and `AddonTokenAuth` (header
  `X-Addon-Token`). The per-operation `security` block is
  `[{ApiKeyAuth: []}, {AddonTokenAuth: []}]` — an OR relationship per
  OpenAPI 3.0.3 §4.8.30.3 (any one of the listed requirements must
  be satisfied).
- **Actual behavior (Fern-generated TS SDK):** the emitted
  `BaseClientOptions` type at `wrapper/src/BaseClient.ts` declares
  **both** auth fields as **required**:
  ```typescript
  export type BaseClientOptions = {
    ...
    addonToken: core.Supplier<string>;   // ← REQUIRED
    ...
  } & HeaderAuthProvider.AuthOptions;    // ← apiKey: core.Supplier<string> REQUIRED
  ```
  Constructing the client with both populated causes Clockify to
  reject the request with HTTP 401 + body `{"message":"Multiple or
  none auth tokens present","code":1000}` — the SDK sends both
  `X-Api-Key` and `X-Addon-Token` headers; Clockify enforces
  exclusivity at the runtime layer that Fern's type system doesn't
  model.

  Workaround in `wrapper/tests/sandbox.test.ts`: pass `addonToken:
  (() => undefined) as unknown as () => string`. The supplier yields
  `undefined`, which the header-merge logic at the request layer
  drops, so only `X-Api-Key` ships.
- **Live evidence:** vitest run 2026-05-24:
  - Without workaround: `ClockifyApiError: Status code: 401` on every call
    (4 of 4 tests failed).
  - With workaround: 4 of 4 tests pass (tag list / round-trip / projects
    pagination / invalid tagId rejection).
- **MCP tools affected:** none — Go MCP layer hand-codes auth.
- **Open questions:**
  1. Can Fern's OpenAPI parser be taught that OR-related security
     schemes should yield two MUTUALLY EXCLUSIVE optional fields in
     `BaseClientOptions` (not two required)? Likely yes via an
     `x-fern-...` annotation — needs investigation. Could be the
     spec, not Fern (e.g. the security blocks may need an `OR`
     marker that Fern doesn't infer from OAS 3.0.3 §4.8.30.3
     semantics).
  2. Should the SDK's `BaseClientOptions.apiKey` field default to
     `process.env.CLOCKIFY_API_KEY` and `addonToken` default to
     `process.env.CLOCKIFY_ADDON_TOKEN`? Useful ergonomic default;
     not yet wired.
- **Status:** `workaround-applied`. The wrapper's published SDK
  shape ships with the required-typed `addonToken` field; the
  README's quick-start example reflects the actual usage pattern
  (apiKey-only) but should also document the addonToken-undefined
  cast until Fern fixes the upstream type. Recommend filing this
  as a Fern issue with the OR-vs-AND security-scheme inference
  question.

## Generator choice — Phase 0 spike for the Stainless/Speakeasy-quality push

### `generator.choice.fern-vs-stainless-vs-speakeasy` — DECIDED 2026-05-24

- **Official claim:** N/A — internal toolchain decision driven by
  the Phase 0 spike of the SDK quality push.
- **Actual behavior:** Three SDK generators were considered for
  emitting the Clockify TypeScript SDK from
  `spec/corrected/clockify.corrected.openapi.yaml`:
  1. **Fern 5.37.9** (current production) — generated 723 TS files,
     0 errors, 0 hints with `fern check --from-openapi`. Synced into
     `wrapper/src/`, type-checked, built, tested.
  2. **Speakeasy 1.763.6** — `speakeasy generate sdk --lang
     typescript --schema spec/corrected/... --out
     experiments/speakeasy --auto-yes` halted with a
     `generator-duplicate-properties` validation error on the `rtl`
     (line 18970) vs `RTL` (line 18963) fields of
     `components.schemas.OpenapiInvoiceExportFields`. Both are real
     Clockify API fields (distinct semantics: `RTL` is `writeOnly`,
     `rtl` is read-write), and the spec is internally conformant —
     Speakeasy's identifier-normalization refuses to emit a TS type
     with two fields of the same identifier. 199 additional spec
     hints (mostly `generator-missing-error-response`,
     `generator-duplicate-inline-schemas`, `generator-pagination`,
     `generator-retries`), 4 style warnings, 4 unused-component
     warnings. No TS files were emitted. Full transcript:
     `experiments/speakeasy.log`.
  3. **Stainless** — not evaluated. SaaS-only (no CLI); evaluating
     requires registering at stainless.com, uploading the spec via
     portal, and downloading the generated ZIP. Deferred per scope
     decision after Speakeasy's hard failure. See
     `generator-comparison.md` "What this comparison does NOT
     answer" for the conditions under which it should be reopened.
- **Live evidence:**
  - `experiments/speakeasy.log` — full Speakeasy transcript.
  - `experiments/speakeasy/.speakeasy/gen.yaml` — Speakeasy's
    scaffolded TypeScript config (78 lines).
  - `generator-comparison.md` (alongside this file) — full rubric
    with per-cell evidence.
- **MCP tools affected:** none directly. The Go MCP layer
  (`internal/tools/...` in GOCLMCP) consumes the canonical spec at
  `../GOCLMCP/docs/openapi/clockify-openapi.yaml`, not the
  Fern-generated TS SDK. Speakeasy's `enableMCPServer` config could
  in principle displace the hand-written Go MCP layer — a separate
  strategic call NOT made by this entry.
- **Open questions:**
  1. Will Clockify upstream the `rtl` vs `RTL` collision (rename
     one of the fields)? If yes, the Speakeasy verdict reopens.
  2. Will Speakeasy ship a `disable-rule` flag for
     `generator-duplicate-properties`? If yes, reopen.
  3. Should we ever evaluate Stainless? Likely same `rtl/RTL`
     collision since Stainless also normalizes identifiers. Only
     worth re-running Phase 0 if a future reviewer disagrees.
- **Status:** `decided-stay-on-fern`. The wrapper-side quality
  plan (Phases 1-8) executes against Fern's existing output.
  Generator decision revisited only if one of the three open
  questions above flips.


