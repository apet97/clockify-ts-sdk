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

### `entries.stoptimer.route-404-no-static-resource` — RESOLVED 2026-06-18 (route quarantined; callers on the bound route)

- **What does official documentation claim?** The generated TypeScript SDK exposes
  `timeEntries.stopTimer({ workspaceId, userId, end })`, which issues
  `PATCH /workspaces/{workspaceId}/user/{userId}/time-entries/stop`.
- **What does Clockify actually return?** That `/stop` suffix route is not bound:
  with a real running timer present it returns
  `404 { "code": 3000, "message": "No static resource ...time-entries/stop." }`.
  The bound route is the bare user-scoped PATCH
  (`PATCH /workspaces/{workspaceId}/user/{userId}/time-entries`, the generated
  `timeEntries.updateForUser`), and a minimal `{ end }` body STOPS the timer with
  `200` — **provided the running entry satisfies the workspace's required fields**
  (this sandbox forces a project). The earlier `400` on the bare route was a
  project-less probe entry, not a body-shape problem: `{ end }` alone is sufficient
  for a real running timer.
- **Which live test proves it?** Probed 2026-06-16 (workspace
  `65b382b606de527a7ee2b60e`): `PATCH .../stop` → 404. Re-probed 2026-06-17 with a
  project-bearing running entry: `PATCH .../time-entries` with `{ end }` → **200**
  (timer stopped, `end` applied), `DELETE` cleanup → 204. The `/stop` suffix still
  404s.
- **Which MCP tool depends on it?** `clockify_timer_stop`, `clockify_stop_work`,
  `clockify_switch_work`, and the CLI `clk115 stop`. All now detect a running timer
  via `timeEntries.listInProgress` and stop it via `timeEntries.updateForUser`
  (`{ end }`) — they never call the dead `stopTimer`, and "no timer running" comes
  from an empty in-progress list, not from swallowing a 404. The MCP callers share
  `mcp/src/tools/timer-stop.ts`.
- **Status:** `resolved` (2026-06-18). Callers were migrated to the bound route
  (2026-06-17); the dead `stopTimer` method + `/stop` route are now removed from
  generated output via the GOCLMCP quarantine (added to `PHANTOM_PATHS`, dropped its
  `SDK_METHOD_NAMES` entry, regenerated — live surface 185→184 ops, SDK stamps
  172→171). Tests: `cli/tests/stop.test.ts`,
  `mcp/tests/work-time-tracking.test.ts`, `mcp/tests/server.test.ts`.

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
- `projects.archive` (`PUT /projects/{projectId}/archive`): route is not bound
  on the live API — a real-format projectId returns `404 "No static resource"`.
  Projects are archived through the project update endpoint (`archived:true`),
  which `clockify_projects_update` already exposes; the parity override maps the
  archive operation there. — affects no dedicated tool by design.
- `scheduling.calculateUsersTotals` (`POST /scheduling/assignments/users/totals`):
  route is not bound on the live API — both POST and a GET probe return
  `404 "No static resource"` (vs `405` on the sibling `publish` route that
  exists). The corrected OpenAPI tags it `x-clockify-live-status:
  probe-documented`. No TS MCP tool is exposed; the parity override records it
  as deferred. Revisit if Clockify binds the endpoint. — affects no tool by
  design.

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

### `fern.x-fern-pagination.bare-array-unsupported` — HISTORICAL-FERN-LIMITATION 2026-06-01

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
- **Status (initial):** `documented-blocking-upstream`. `x-fern-pagination`
  is **not** stamped on any Clockify operation. The `page` and
  `page-size` query params are stamped — that's still a real spec
  improvement consumed by callers, MCP tools, and any downstream
  generator (Speakeasy, Stainless, etc.) that doesn't share Fern's
  strict envelope requirement. Re-evaluate when Fern publishes a
  release that documents bare-array pagination support or when an
  overrides-side workaround is discovered.

#### Update 2026-05-25 (session 4) — re-verification + upstream issue drafted

- **Fern CLI version check:** still pinned at `5.37.9`; latest on
  npm is also `5.37.9` (see G.3 update above for the version probe).
- **Docs re-check:** the buildwithfern.com pagination docs page now
  enumerates four pagination schemes (offset / cursor / URI / path);
  all examples show `results` pointing to a property inside a response
  object (`$response.results`, `$response.data`, etc.). Bare-array
  responses are still NOT documented as supported. The page also
  notes auto-pagination is "available only for the Pro and
  Enterprise plans" — a separate concern for OSS consumers, but
  doesn't change the bare-array verdict.
- **Re-reproduction (2026-05-25):** stamped `x-fern-pagination`
  with `offset: $request.page, results: $response` on a single op
  (tags GET) on top of the current G.1 snapshot, ran
  `fern generate --group ts --local --force`. Fern emitted:
  ```
  [error] Pagination configuration for endpoint list must define
          a dot-delimited 'results' property starting with
          $response (e.g. $response.results).
  ```
  Same error with `results: $response[*]`. Test mutation reverted.
- **Fern repo issue search:** searched `github.com/fern-api/fern`
  for issues matching `bare array pagination`, `x-fern-pagination
  results response`, `pagination top-level array`, `auto pagination
  openapi`, `pagination results` — zero hits. No existing upstream
  tracking issue.
- **Action:** drafted a complete issue body at
  `spec/evidence/fern-issues/bare-array-pagination-results-path.md`,
  ready to paste verbatim at `https://github.com/fern-api/fern/issues/new`.
  The body ships a minimal repro spec, lists the three rejected
  `results` variants, explains why the limitation matters (bare-array
  APIs in production like Clockify), points at the
  wrapper-side `paginate<T>` + `iterAll` helpers as the current
  workaround, and proposes either `results: $response` or a sentinel
  syntax as the desired fix.
- **Workaround status:** unchanged. The hand-written
  `paginate<T>` (`wrapper/pagination.ts`), `iterAll` /
  `iterPages` (`wrapper/iter.ts`) + `KNOWN_PAGINATED_METHODS`
  drift assertion remain the supported pagination surface. The
  v1.0.0 cut still ships them.
- **Bump posture:** identical to G.3 — we're already on the latest
  CLI + container. Re-check on every Fern release; the filed issue
  is the discovery channel.

- **Updated open questions:**
  1. ~~Is there a Fern overrides syntax that can wrap a bare-array
     response in a synthetic envelope at SDK-generation time?~~
     **Confirmed no.** Doc-fetch on the current pagination docs
     page shows envelope-only examples. Routed to upstream as a
     drafted issue.
  2. Until Fern adds bare-array offset support, the TS SDK ships
     without auto-pagination — **already true and stable**; the
     wrapper's `iterAll` family is the supported entry point.

- **Filing decision 2026-05-25:** the drafted issue body at
  `spec/evidence/fern-issues/bare-array-pagination-results-path.md`
  is **internal evidence only — not filed upstream**. Maintainer
  call (apet97 2026-05-25): the wrapper-side `paginate` / `iterAll`
  helpers are the supported pagination surface and shipping a
  user-facing upstream tracking discussion isn't a current priority.
  Re-open this status if Fern independently lands bare-array
  support or someone else files the issue and we need to track it.

- **Status (updated):** `awaiting-upstream-fix-issue-drafted-internal-only`.
  The hand-written `paginate` / `iterAll` helpers stay; the
  `KNOWN_PAGINATED_METHODS` drift assertion catches regressions.
  When the upstream fix ships (via any channel):
  1. Re-test stamping `x-fern-pagination` on a single op (tags) and
     confirm successful TS generation with an `AsyncIterable<Tag>`
     method.
  2. Expand stamping to all 18 ops in `PAGINATED_LIST_OPS` (mirror
     of the G.1 bisect cadence: one at a time, regen + gates +
     fern generate, count modules).
  3. Bump `wrapper/CHANGELOG.md` `[Unreleased]` to flag the
     hand-written `paginate` + `iterAll` as deprecated; document
     a removal target (v2.0).
  4. Land as v2.0 with the deprecation removed; `iter.ts` +
     `pagination.ts` deleted; subpath exports removed.

#### Update 2026-06-01 — local generator migration

- **Local generator impact:** the required TypeScript SDK generation path no
  longer uses Fern's `x-fern-pagination` implementation. The repo-owned
  generator reads the corrected OpenAPI snapshot directly, emits list methods
  that accept `page` + `page-size`, and preserves `core.HttpResponsePromise<T>`
  so the wrapper's `paginate`, `iterAll`, and `iterPages` helpers remain the
  supported public pagination surface.
- **Proof:** `make sdk-codegen-drift`, `make generator-comparison`, wrapper
  pagination tests, and the broad `make perfect-full` proof cover the local
  replacement path. Fern's bare-array limitation remains useful historical
  evidence, but it is no longer a blocker for this repo's required TS SDK
  generation.
- **Status:** `historical-fern-limitation-local-generator-owned`. Re-open only
  if maintainers intentionally restore Fern as the active TypeScript generator
  or if the local generator stops preserving the wrapper pagination contracts.

### `fern.x-fern-sdk-method-name.drops-resource-modules` — PARTIALLY-RESOLVED 2026-05-24 (session 3)

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
- **Status (initial):** `deferred-needs-upstream-investigation`. The
  `stamp_sdk_method_name!` call has been removed from the
  generator's per-op finalization loop and the `derive_sdk_method_name`
  + `stamp_sdk_method_name!` function bodies replaced with a NOTE
  comment block at the same location. Re-enable only after the
  drop-modules behavior is reproduced upstream (file an issue at
  fern-api/fern with this repro) or empirically isolated. Until
  then, SDK callers consume the upstream operationId-derived method
  names (e.g. `tags.getWorkspacesWorkspaceIdTags()`) — long but
  stable, and all 32 resource modules are emitted.

#### Update 2026-05-24 (session 3) — root cause + partial fix shipped

- **Root cause identified:** stamping `x-fern-sdk-method-name` **alone**
  hoists the operation to the **root client** (`client.list()` instead
  of `client.tags.list()`) and removes it from the resource module. The
  previous 135-op heuristic stamped every CRUDL op with method-name
  only; each stamped op got hoisted to the root, and the 12 affected
  modules' op-sets emptied out enough that Fern's TS generator skipped
  module emission entirely. There is no IR-level name mangling and no
  type collision — the dropped-modules behaviour is downstream of the
  hoist behaviour, not a separate bug.

- **Fix:** pair `x-fern-sdk-group-name: <resource>` with
  `x-fern-sdk-method-name: <verb>` on every stamped op. With both keys
  present, Fern (a) keeps the method under `client.<resource>.<verb>()`
  and (b) emits all resource modules unchanged. Verified with single-op
  bisect (tags GET → `list`) then full CRUDL on tags (5 ops) then full
  CRUDL + `archive` on clients (6 ops). All three iterations produced
  31 resource modules + `index.ts` (matches baseline) and zero hoisted
  methods on the root client.

- **What shipped (27-module subset, 170 ops):** `SDK_METHOD_NAMES` in
  `../GOCLMCP/scripts/gen-clockify-openapi` maps 170 pairs to
  `{group, name}` entries. The session expanded in eight steps:
  - Step 1 (proof-of-concept): tags × 5 CRUDL; clients × 5 CRUDL + 1
    archive = 11 ops.
  - Step 2 (scale-up): projects, tasks, holidays, sharedReports,
    timeOffPolicies, userGroups, webhooks each × 4-5 CRUDL +
    timeEntries × 4 core CRUD = 37 more ops.
  - Step 3 (next-batch cohort): customFields × 7 scoped, expenses × 5,
    expenseCategories × 5 + archive, invoiceItems × 3, invoicePayments
    × 3, policies × 5 + archive = 29 more ops.
  - Step 4 (workflow-verb cohort): approvals × 6 workflow verbs
    (list/submit/submitForUser/resubmit/resubmitForUser/updateStatus),
    timeOff × 5 (list/get/delete/updateStatus/submit), scheduling × 9
    (CRUDL + publish + copy + recurring CRUD) = 20 more ops.
  - Step 5 (specialised cohort): invoices × 9
    (CRUDL + filter + duplicate + export + updateStatus), reports × 4
    (one entry per family: attendance / detailed / summary / weekly)
    = 13 more ops.
  - Step 6 (action-verb cleanups inside stamped modules):
    projects × 9 (createFromTemplate, archive, updateCostRate,
    updateEstimate, updateHourlyRate, updateMemberships,
    updateTemplate, updateUserCostRate, updateUserHourlyRate),
    tasks × 2 (updateCostRate, updateBillableRate),
    timeEntries × 9 (markInvoiced, markInvoicedBulk, listInProgress,
    listForUser, createForUser, startTimer, updateForUser, stopTimer,
    duplicate), holidays × 1 (listInPeriod), sharedReports × 1
    (view), timeOffPolicies × 1 (updateStatus), userGroups × 3
    (listMembers, addMembers, removeMember), webhooks × 5
    (listForAddon, rotateToken, listLogs, searchLogs, updateToken),
    expenses × 1 (downloadReceipt), scheduling × 6 (listPerProject,
    listOnProject, replaceRecurring, getUsersCapacityFiltered,
    calculateUsersTotals, getUserCapacity), timeOff × 1
    (submitForUser) = 39 more ops.
  - Step 7 (small / read-only module fills): auditLogReport × 1
    (search), balances × 3 (listForPolicy, update, getForUser),
    entityChangesExperimental × 3 (listCreated, listUpdated,
    listDeleted), invoiceSettings × 2 (get, update),
    memberProfiles × 2 (get, update), workspaces × 7
    (list, create, get, update, updateCostRate, updateBillableRate,
    addUser) = 18 more ops. Skipped: `files.uploadImage`,
    `roles.{give,remove}UserManagerRole`, `expenseReport.
    generateDetailedReportV1`, per-user workspaces verbs — each
    is already verb-noun shaped.
  - Step 8 (final domain edge-case fills, 3 ops):
    projects × 1 (`setMembers` for POST /memberships, paired with
    sibling PATCH `updateMemberships`), timeOff × 1 (`withdraw`
    for DELETE on the policy-scoped request path, paired with
    admin workspace-level `delete`), balances × 1 (`listForUser`
    for GET on the plural `/users/{uid}/time-off/balances` route,
    paired with sibling singular `getForUser`). 170/191 = 89%
    coverage.

  After each step, regen + all 4 drift gates + `go test ./internal/tools/...`
  + `fern check --warnings --from-openapi` + `fern generate --group ts
  --local --force` stayed green; the wrapper exposes idiomatic CRUDL
  on every stamped module and 0 ops are hoisted to the root client.

- **What's NOT shipped (~4 modules + a handful of ops):** the remaining
  ~24 unstamped ops live in:
  - `files.uploadImage` — already a clean verb-noun name.
  - `expenseReport.generateDetailedReportV1` — the explicit `V1`
    suffix is load-bearing and a rename would lose that signal.
  - `workspaces.{updateUserStatus, updateUserCostRate,
    updateUserHourlyRate}` — already verb-noun shaped.
  - `balances.{getWorkspacesWorkspaceIdTimeOffRequests,
    getWorkspacesWorkspaceIdUsersUserIdTimeOffBalances}` — the
    `Balances`-tagged "time-off-requests" / "time-off-balances"
    read paths; semantic overlap with timeOff / balances; needs
    domain investigation before a rename.
  - Specialised action verbs inside stamped modules that need
    naming review (e.g. `assignOrRemoveProjectUsers` next to
    `updateMemberships`; the timeOff legacy `/policies/...`
    duplicates; `scheduling.changeRecurringPeriod`). Each is a
    per-module-followup, not blocking the current G.1 milestone.

  Specialised action verbs inside the 10 stamped modules also kept
  their operationId-derived names (e.g.
  `client.projects.putWorkspacesWorkspaceIdProjectsProjectIdArchive`,
  `client.timeOffPolicies.changeTimeOffPolicyStatus`,
  `client.holidays.getWorkspaceHolidaysInPeriod`). Naming them is a
  separate per-module call after CRUDL coverage rolls out.

- **Updated open questions:**
  1. ~~Why does Fern silently drop modules instead of warning?~~
     **RESOLVED.** Modules aren't being dropped — they're being emptied
     by the hoist. Fern just doesn't emit empty modules.
  2. ~~Does an `x-fern-sdk-group-name` annotation alongside
     `x-fern-sdk-method-name` change behavior?~~ **RESOLVED.** Yes,
     it's the required complement.
  3-4. Closed by (1).

- **Status (updated):** `resolved-coverage-90pct-residue-is-deliberate`.
  The proven technique ships in `SDK_METHOD_NAMES` covering 170 ops
  across 27 of 31 modules. Coverage by op count: **170/188 = 90.4%
  of total live operations carry idiomatic stamps** (denominator
  shrank from 191 → 188 after the three legacy `time-off-request`
  paths were quarantined as phantom — see
  `timeoff.legacy-policies-requests.phantom-path-quarantined`
  below). The remaining ~21 ops
  split into:
  - **Already-clean operationId names (don't need a rename)** —
    `files.uploadImage`,
    `expenseReport.generateDetailedReportV1` (the `V1` suffix is
    load-bearing), the per-user `workspaces.updateUser*` family,
    `timeEntries.deleteMany`, `scheduling.changeRecurringPeriod`.
  - **Per-module domain edge cases that need additional research
    before a rename** — the timeOff legacy `/policies/{pid}/
    requests` duplicate trio (POST/DELETE/PATCH that mirror the
    `/time-off/policies/...` family on a deprecated path), the
    timeOff `postWorkspacesWorkspaceIdTimeOffRequestsUsersUserId`
    workspace-scoped admin-creates-for-user variant, the timeOff
    `changeTimeOffRequestStatus` policy-scoped status PATCH, and
    the balances `getWorkspacesWorkspaceIdTimeOffRequests` cross-
    reference (a `Balances`-tagged route living at `/time-off/
    requests`).

  Module count stays at 31 + index.ts across all eight expansion
  steps. The technique covers every naming pattern in Clockify's
  surface: pure CRUDL, CRUDL+action, partial CRUDL, scoped naming,
  workflow verbs, family-name verbs, and ~12 distinct action-verb
  patterns (`mark*`, `start/stopTimer`, `rotateToken`,
  `replaceRecurring`, `listFor*`, `update*Rate`, `listCreated/
  Updated/Deleted`, `setMembers`, `withdraw`, etc.). Each of the
  eight expansion steps preserved the invariant "31 modules +
  index.ts, 0 root hoists".

#### Update 2026-06-01 — local generator migration

- **Local generator impact:** the required TypeScript SDK generator now treats
  `x-fern-sdk-group-name` and `x-fern-sdk-method-name` as legacy naming hints,
  not as Fern-specific runtime dependencies. The local generator consumes the
  paired hints directly and emits 31 resource modules without the historical
  root-hoist/module-drop behavior.
- **Proof:** `make sdk-codegen-drift` verifies reproducible local output and
  `make generator-comparison` verifies the generated method map against the
  OpenAPI naming hints.
- **Status:** `resolved-local-generator-consumes-legacy-hints`. The
  `x-fern-*` extension names remain in the OpenAPI snapshot for continuity;
  rename them only as a separate compatibility cleanup after generator and
  method-map parity pass.

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

### `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive` — CLOSED-BY-LOCAL-GENERATOR 2026-06-01

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
- **Status (initial):** `workaround-applied`. The wrapper's published
  SDK shape ships with the required-typed `addonToken` field; the
  README's quick-start example reflects the actual usage pattern
  (apiKey-only) but should also document the addonToken-undefined
  cast until Fern fixes the upstream type. Recommend filing this
  as a Fern issue with the OR-vs-AND security-scheme inference
  question.

#### Update 2026-05-25 (session 4) — upstream investigation

- **Fern CLI version check:** `npm info fern-api version` returns
  `5.37.9` (latest); confirmed against the full version list — no
  newer release exists since the issue was first documented.
- **TS-SDK generator container check:** Docker Hub's
  `fernapi/fern-typescript-node-sdk` `latest` tag points at
  `3.71.2`, the same version pinned in `spec/fern/generators.yml`.
- **Fern repo issue search:** searched `github.com/fern-api/fern`
  for issues matching `security scheme`, `addonToken`, `multiple auth`,
  `security alternative`, `either security`, `BaseClientOptions required`.
  The single hit (#5707, "Support Multiple Required Headers — OpenAPI
  Security Scheme") is about Fern Docs and the AND-case (both headers
  required); does not cover our OR-case.
- **Action:** drafted a complete issue body at
  `spec/evidence/fern-issues/addonToken-or-security-required-fields.md`,
  ready to paste verbatim. The body cites OAS 3.0.3 §4.8.30.3, ships
  a minimal repro spec, names the affected generator container +
  version, shows the workaround in use, and proposes a discriminated-
  union typing as the desired fix. The user needs to file it via
  `https://github.com/fern-api/fern/issues/new` and capture the
  resulting issue number back here.
- **Workaround status:** unchanged. The `createClockifyClient()`
  factory at `wrapper/create-client.ts` continues to hide the
  `NULL_SUPPLIER` cast behind a discriminated-union options shape;
  this is the documented public API and stays as-is until the
  upstream fix lands.
- **Bump posture:** because the latest container is already on
  `3.71.2` (matching our pin) and the latest CLI is already
  `5.37.9` (matching our pin), there is no version we could bump to
  in order to pick up a fix — we are at the upstream's current
  shipped surface. Re-check on every Fern release; an upstream PR
  comment will arrive on the filed issue once a fix lands.

- **Updated open questions:**
  1. ~~Can Fern's OpenAPI parser be taught that OR-related security
     schemes should yield two MUTUALLY EXCLUSIVE optional fields?~~
     **Routed to upstream as a drafted issue.** No further local
     action until Fern responds.
  2. ~~Should the SDK's `BaseClientOptions.apiKey` field default to
     `process.env.CLOCKIFY_API_KEY` and `addonToken` default to
     `process.env.CLOCKIFY_ADDON_TOKEN`?~~ **DONE (session 4,
     2026-05-25).** `createClockifyClient()` (no args) now reads
     `CLOCKIFY_API_KEY` (preferred) or `CLOCKIFY_ADDON_TOKEN` from
     the environment at construction time. Explicit options always
     win over env vars; empty-string env values are treated as
     absent; both-explicit still throws (the Clockify-runtime
     constraint is enforced unchanged). The TS type adds a third
     `{ apiKey?: never; addonToken?: never }` union branch so `{}`
     is type-valid. Six new vitest cases cover the env-fallback
     matrix. Independent of question (1) — the wrapper-side ergonomic
     ships now without waiting for Fern's upstream typing change.

- **Filing decision 2026-05-25:** the drafted issue body at
  `spec/evidence/fern-issues/addonToken-or-security-required-fields.md`
  is **internal evidence only — not filed upstream**. Maintainer call
  (apet97 2026-05-25): the workaround in the wrapper's
  `createClockifyClient()` factory is stable and the upstream
  discussion isn't a current priority. Re-open this status if the
  Fern team independently lands a fix or someone else files the
  issue and we need to track it.

- **Status (updated):** `awaiting-upstream-fix-issue-drafted-internal-only`.
  The cast-removal path is gated on a Fern release that changes
  `BaseClientOptions` typing; nothing to remove now. When the
  upstream fix ships (via any channel):
  1. Bump `spec/fern/fern.config.json` `version` and
     `spec/fern/generators.yml`'s container tag (AGENTS.md §12 #3
     requires explicit approval for these bumps).
  2. Regenerate; verify the new `BaseClientOptions` shape.
  3. Remove `NULL_SUPPLIER` from `wrapper/create-client.ts`.
  4. Remove the `addonToken: (() => undefined) as unknown as () => string`
     cast from `wrapper/tests/sandbox.test.ts`.
  5. Update `wrapper/README.md` Authentication section to drop the
     cast caveat.
  6. Land as the v1.0.0 cut — typed-correct auth surface is a
     v1.0.0 acceptance-criterion bullet.

#### Update 2026-06-01 — local generator retires the workaround

- **Local generator impact:** `scripts/generate-sdk-from-openapi.mjs` now emits
  mutually exclusive generated auth types for `apiKey` and `addonToken`, and
  `wrapper/create-client.ts` no longer needs the `NULL_SUPPLIER` cast. The
  wrapper-facing `createClockifyClient` API keeps the same XOR behavior and
  environment fallback semantics.
- **Proof:** wrapper auth tests cover api-key/addon-token exclusivity and
  environment precedence, `npm run type-check -w clockify-sdk-ts-115` proves
  the generated types, and live sandbox SDK proof exercises the api-key path
  without an addon-token workaround.
- **Status:** `closed-by-local-generator`. The internal Fern issue draft remains
  historical evidence only; no upstream Fern fix is required for the active
  repo-owned SDK generation path.

## Generator choice — Phase 0 spike for the Stainless/Speakeasy-quality push

### `generator.choice.fern-vs-stainless-vs-speakeasy` — DECIDED 2026-05-24

- **Official claim:** N/A — internal toolchain decision driven by
  the Phase 0 spike of the SDK quality push.
- **Actual behavior:** Three SDK generators were considered for
  emitting the Clockify TypeScript SDK from
  `spec/corrected/clockify.corrected.openapi.yaml`:
  1. **Fern 5.37.9** (historical production before 2026-06-01) — generated 723 TS files,
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
- **Status:** `superseded-by-local-generator`. The wrapper-side quality
  plan initially executed against Fern's output, but the active required TS SDK
  emitter is now the repo-owned local generator.

#### Update 2026-06-01 — final generator choice

- **Decision:** replace Fern as the required TypeScript SDK emitter with
  `scripts/generate-sdk-from-openapi.mjs`, a deterministic repo-owned generator
  that reads `spec/corrected/clockify.corrected.openapi.yaml` and emits
  `output/ts-sdk/**` before `wrapper/scripts/sync-sdk.sh` refreshes
  `wrapper/src/**`.
- **Rationale:** Speakeasy still cannot pass the real `RTL`/`rtl` collision
  without changing API truth, Stainless remains hosted/account-based, and Fern
  adds Docker/vendor-specific generator behavior that this repo no longer needs
  for the required proof path.
- **Status:** `decided-local-repo-owned-generator`. Historical generator
  evidence remains in this ledger so future agents understand why the local
  generator owns the active SDK surface.

## Webhook delivery — signature scheme

### `webhook.signature-scheme.shared-secret-not-hmac-doc-only` — DOCUMENTED 2026-05-24

- **Official claim:** Clockify webhook delivery uses a per-webhook
  `authToken` (32-char shared secret) sent in the
  `Clockify-Signature-Token` HTTP header on every delivery.
  Verification is a constant-time string compare against the stored
  token. Two source citations:
  1. `../../../GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/openapi-fragments/webhooks-a.yaml`:
     `authToken: {type: string, description: "Header value Clockify
     sends as Clockify-Signature-Token; rotate via /token endpoint."}`
  2. `../../../GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/WEBHOOKDOC.md`
     line 340: `Creating a webhook generates a new token which can
     be used to verify that the webhook being sent was sent by
     Clockify, as it will always be present in the header.`
- **Actual behavior:** NOT live-probed yet. The wrapper's
  `verifyClockifyWebhook` and `constructEvent` helpers ship to
  v0.x assuming the documented scheme is accurate. They do
  case-insensitive header lookup, constant-time `Buffer` compare
  via `node:crypto.timingSafeEqual`, and pad-to-equal-length to
  avoid throwing on length mismatch.
- **Live evidence:** none yet. To probe: register a Clockify
  webhook against a test endpoint that logs all incoming headers +
  body; trigger one event; capture the request; confirm the header
  name is exactly `Clockify-Signature-Token` (or a case variant)
  and the value is the unhashed `authToken` (NOT an HMAC over the
  payload). The synced `Webhook.authToken` field docstring says
  "HMAC secret" which conflicts with the probe-lab doc's
  shared-secret-comparison model — one of the two is wrong.
- **MCP tools affected:** none — the Go MCP layer in GOCLMCP does
  not currently expose webhook verification. The wrapper's new
  `clockify-sdk-ts/webhooks` subpath is the first SDK surface that
  enforces this scheme.
- **Open questions:**
  1. Header name: exactly `Clockify-Signature-Token`? Any
     case variation (e.g. `clockify-signature-token` per HTTP
     normalization in Node)? Helpers do case-insensitive lookup so
     this is robust either way, but the canonical form should be
     confirmed.
  2. Value form: bare 32-char token (matches `authToken`) or
     prefixed (`Token <value>`, `Bearer <value>`)? Helpers assume
     bare; a prefix would make them fail-closed.
  3. HMAC-vs-shared-secret: the `Webhook.authToken` docstring
     ("HMAC secret. Treat as a credential; never log.") conflicts
     with the probe-lab doc's plain-token-comparison model.
     Resolve via a live probe; if HMAC, the verifier needs a
     full rewrite (compute HMAC-SHA256 over the canonical payload
     + compare to header).
  4. Replay protection: any timestamp header for tolerance-based
     replay rejection (Stripe-style)? Doc doesn't mention one.
- **Status:** `verifier-shipped-on-doc; live-probe-pending`. The
  wrapper's verifier ships against the documented scheme. If a
  live probe (next time someone configures a Clockify webhook
  end-to-end) shows a different scheme, this entry reopens and the
  helpers update accordingly. Until then, the documented scheme is
  the authoritative source.

## Last-Page header — live audit (G.5)

### `pagination.last-page-header.live-audit-2026-05-25` — DOCUMENTED 2026-05-25

### `pagination.iter-known-set.envelope-and-unpaginated` — FIXED 2026-06-19

`wrapper/iter.ts`'s hand-maintained `KnownPaginatedMethod` union and
`KNOWN_PAGINATED_METHODS` runtime set must contain only methods that
(a) return a bare `readonly TItem[]` and (b) actually honor
`page`/`page-size`. Five entries violated this and were removed
(set size 19 -> 14):

- `balances.getForUser`, `balances.listForPolicy` return
  `BalanceListResponse = {balances, count}` envelopes, not bare
  arrays. Feeding either to `iterAll`/`iterPages` ran
  `for (const item of page.items)` over a non-iterable object.
- `customFields.listForProject`, `customFields.listForWorkspace`,
  `holidays.list` return the full collection on every page and emit
  no `Last-Page` header, so the `items.length === pageSize` fallback
  could yield unbounded duplicates when the collection size equals
  the requested page size.

These routes may remain in GOCLMCP's `PAGINATED_LIST_OPS` because the
query parameters are accepted upstream; the wrapper iterable set is
narrower because it is a runtime safety contract. Regression coverage:
`wrapper/tests/iter.test.ts` ("excludes envelope-returning and
unpaginated methods").

- **Official claim:** the seed-list entry near the top of this file
  (`pagination: most list endpoints return Last-Page header, not a
  total`) had not been quantified per-endpoint. G.5's brief: probe
  each of the 18 ops in `GOCLMCP/scripts/gen-clockify-openapi`'s
  `PAGINATED_LIST_OPS` and split them into "emits Last-Page
  consistently" vs "does not".

- **Actual behaviour (live, 2026-05-25, sandbox workspace
  `65b382b606de527a7ee2b60e`):** each endpoint was probed with
  `?page=1&page-size=2` (results-available) and the paginated
  endpoints additionally with `?page=999&page-size=2` (results-
  exhausted). Result:

  **15 endpoints emit `Last-Page` consistently** (probe captures
  `last-page: false` on page 1 with full results AND `last-page:
  true` on page 999 with 0 items):
  - `GET /workspaces/{wsId}/approval-requests`
  - `GET /workspaces/{wsId}/clients`
  - `GET /workspaces/{wsId}/invoices/{invoiceId}/payments`
  - `GET /workspaces/{wsId}/projects`
  - `GET /workspaces/{wsId}/projects/{projectId}/tasks`
  - `GET /workspaces/{wsId}/scheduling/assignments/all` (requires
    `start` + `end` query params; probe used a 1-year window)
  - `GET /workspaces/{wsId}/tags`
  - `GET /workspaces/{wsId}/time-entries/status/in-progress`
  - `GET /workspaces/{wsId}/time-off/balance/policy/{policyId}`
  - `GET /workspaces/{wsId}/time-off/balance/user/{userId}`
  - `GET /workspaces/{wsId}/time-off/policies`
  - `GET /workspaces/{wsId}/user-groups`
  - `GET /workspaces/{wsId}/user/{userId}/time-entries`
  - `GET /workspaces/{wsId}/users`
  - `GET /workspaces/{wsId}/users/{userId}/managers`

  **3 endpoints do NOT emit `Last-Page`** (and additionally ignore
  `page-size` on the live server, returning the full collection
  regardless of the paging query params):
  - `GET /workspaces/{wsId}/custom-fields` — page-size=2 returned
    25 top-level items.
  - `GET /workspaces/{wsId}/holidays` — page-size=2 returned 31
    top-level items.
  - `GET /workspaces/{wsId}/projects/{projectId}/custom-fields` —
    page-size=2 returned 1 item (small dataset; no Last-Page
    header in response).

  The 3 non-emitting endpoints suggest those routes pre-date
  Clockify's pagination convention or are intentionally
  unpaginated. They remain in `PAGINATED_LIST_OPS` (the params
  are accepted, just ignored) but are NOT in `LAST_PAGE_HEADER_OPS`
  so they don't carry the wrapper-side stop signal.

- **Live evidence:** 22 probe files saved at
  `spec/evidence/probes/20260525-lastpage-*.{json,hdr}` — each
  endpoint has at least one `-p1.{json,hdr}` pair; the 8 confirmed-
  paginated workspace-scoped ones additionally have `-p999.{json,hdr}`
  pairs. All 22 are gitignored per AGENTS.md §5.4. Reproducible
  via the curl invocation in the commit message that introduced
  this entry.

- **MCP tools affected:** none directly today. The Go MCP layer in
  GOCLMCP synthesises a `total_min` lower-bound rather than using
  the header (see seed-list `pagination` entry near the top of this
  file). A future cleanup could route the same `LAST_PAGE_HEADER_OPS`
  set through `internal/tools` and short-circuit the lower-bound
  synthesis when the header is present — out of scope for this
  session.

- **Open questions:**
  1. Should the 3 non-emitting endpoints (`custom-fields`,
     `holidays`, `projects/{projectId}/custom-fields`) be removed
     from `PAGINATED_LIST_OPS` since the server ignores `page-size`?
     **Not now** — the page+page-size param declarations are still
     a real documentation improvement consumed by downstream
     SDK generators and tooling that doesn't probe live API
     behaviour. The wrapper just doesn't get a useful stop signal
     from them. Re-evaluate if a future Clockify API change adds
     server-side paging to these endpoints.
  2. Does the header ever appear case-shifted (`LAST-PAGE`,
     `Last-page`)? Probe used `grep -i ^last-page:` so any casing
     would have matched; observed casing in raw `.hdr` files is
     consistently `last-page:` (HTTP/2 lowercased the field name).
     The wrapper's `Headers#get("Last-Page")` API is
     case-insensitive per the WHATWG spec, so the consumer is safe
     regardless.

- **Status:** `audited-and-shipped`. Two changes ship in this
  session:
  1. **Generator (GOCLMCP):** new `LAST_PAGE_HEADER_OPS` set (15
     entries) + `stamp_last_page_header!` function called in the
     per-op finalization loop. The canonical YAML now carries
     `x-clockify-last-page-header: true` on each of the 15
     audited-emitting operations.
  2. **Wrapper (this repo):** `iterPages` now feature-detects
     `.withRawResponse()` on the fetcher's return, reads the
     `Last-Page` response header via the case-insensitive Headers
     API, and uses `Last-Page: true` as the authoritative stop
     signal — more robust than the legacy
     `items.length === pageSize` heuristic (which fails when a
     final page coincidentally fills). The heuristic remains as a
     fallback for non-emitting endpoints + custom (non-Fern)
     fetchers; the wrapper also stops on a short page even when
     `Last-Page: false` to defend against server-inconsistency
     loops. Six new vitest cases in `tests/iter.test.ts` cover
     the four combinations (header true/false × page full/short)
     plus the case-insensitive parse + the no-`withRawResponse`
     fallback path.

## Time-off request duplicate paths — investigation

### `timeoff.legacy-policies-requests.phantom-path-quarantined` — EXPANDED 2026-05-25 (round 2)

#### Update 2026-05-25 (round 2) — 3 more phantoms quarantined, listForUser stamp removed

Three additional `Time Off` / `Balances`-tagged routes were
probed during the G.1 domain edge-case sweep that was deferred
out of v0.5.0. All three returned HTTP 404 or 405 + Clockify
error code 3000 against sandbox `65b382b606de527a7ee2b60e`:

- `POST /workspaces/{wsId}/time-off/requests/users/{userId}` →
  HTTP 404 "No static resource". Looked like an admin
  "create TOR for a specific user via the workspace-level path"
  but doesn't exist. The live equivalent is the policy-scoped
  `submitForUser` at `/time-off/policies/{pid}/users/{uid}/requests`
  (already stamped in v0.5.0).
- `GET /workspaces/{wsId}/time-off/requests` → HTTP 405
  "Request method 'GET' is not supported". The path exists for
  POST (that's the documented POST-as-list `list` op, kept), but
  GET is not allowed. The canonical's own `x-clockify-notes`
  block on this op already documented the 405 from a prior
  probe-supplement; the quarantine just stops us from generating
  an SDK method that immediately 405s.
- `GET /workspaces/{wsId}/users/{userId}/time-off/balances` →
  HTTP 404 "No static resource". Looked like a per-user time-off
  balances list across all policies, but doesn't exist. The live
  per-user balance read is the singular
  `/time-off/balance/user/{userId}` (already stamped as
  `balances.getForUser` in v0.5.0).

Probe fixtures (gitignored per AGENTS.md §5.4):
- `spec/evidence/probes/20260525-edge-post-tor-users-userid.{json,hdr}`
- `spec/evidence/probes/20260525-edge-get-tor.{json,hdr}`
- `spec/evidence/probes/20260525-edge-get-user-balances.{json,hdr}`

Actions:
- Added all 3 `[method, path]` tuples to `PHANTOM_PATHS` in
  GOCLMCP's `scripts/gen-clockify-openapi` (now 9 entries total).
- Removed the stale `balances.listForUser` entry from
  `SDK_METHOD_NAMES` (it pointed at the third phantom route; the
  live equivalent is already stamped as `balances.getForUser` on
  a different path).
- Updated `tests/doc_parity_test.go` floors (paths 123 → 121,
  ops 188 → 185) and removed
  `GET /users/{userId}/time-off/balances` from the
  required-operations list since quarantined paths must not
  appear there.

Coverage shift: 170/188 → 169/185 = **91.4%** (denominator
shrank by 3 with the quarantine; stamp count dropped by 1 with
the `listForUser` removal). 27 modules unchanged. Wrapper's
`timeOff` module exposes 8 methods (was 9; admin-create-for-user
dropped). Wrapper's `balances` module exposes 4 methods (was 5;
per-user list dropped). Net effect: the SDK no longer pretends 3
routes that return 404/405 live exist.

### `timeoff.legacy-policies-requests.phantom-path-quarantined` — RESOLVED 2026-05-25 (round 1)

- **Official claim:** the upstream
  `clockify-api-probe-lab/openapi-fragments/time-off-b.yaml` source
  declares three time-off-request action operations at the legacy
  unscoped path `/workspaces/{workspaceId}/policies/{policyId}/
  requests` (POST + DELETE + PATCH). The same source ALSO declares
  the scoped variants at `/workspaces/{workspaceId}/time-off/
  policies/{policyId}/requests/*`. Both sets land in the canonical
  YAML under the `Time Off` tag.

- **Actual behaviour (live probe, 2026-05-25, sandbox workspace
  `65b382b606de527a7ee2b60e`):** the three legacy routes all return
  `HTTP 404 + {"message":"No static resource v1/workspaces/{ws}/
  policies/{pid}/requests[/{rid}].","code":3000}`. Probed with
  policyId `696fd7f25dd6c5510bafa772`, fake requestId
  `aaaaaaaaaaaaaaaaaaaaaaaa`:
  - POST `/workspaces/{wsId}/policies/{pid}/requests` with `{}` →
    HTTP 404 "No static resource".
  - DELETE `/workspaces/{wsId}/policies/{pid}/requests/{rid}` →
    HTTP 404 "No static resource".
  - PATCH `/workspaces/{wsId}/policies/{pid}/requests/{rid}` with
    `{}` → HTTP 404 "No static resource".

  The control probe (POST on the scoped path `/workspaces/{wsId}/
  time-off/policies/{pid}/requests` with `{}`) returned `HTTP 400
  {"message":"must not be null","code":501}` — same handler accepts
  POST but rejects an empty body — confirming the scoped routes ARE
  live.

- **Live evidence:**
  - `spec/evidence/probes/20260525-timeoff-legacy-post.{json,hdr}`
  - `spec/evidence/probes/20260525-timeoff-legacy-delete.{json,hdr}`
  - `spec/evidence/probes/20260525-timeoff-legacy-patch.{json,hdr}`
  - `spec/evidence/probes/20260525-timeoff-current-post.{json,hdr}`
    (control showing the scoped path is live)

  All gitignored per AGENTS.md §5.4.

- **MCP tools affected:** none — `internal/tools/` consumes the
  canonical spec, and the MCP tool layer always routes time-off
  requests through the scoped `/time-off/policies/...` paths
  (the operationId-derived tool names are
  `clockify_time_off_request*` and friends, all generated against
  the scoped operations).

- **Open questions:** none. The probe is definitive: the legacy
  paths do not exist on the live API. They are spec ghosts from an
  older source-bundle revision.

- **Status:** `phantom-path-quarantined`. Added three entries to
  `PHANTOM_PATHS` in `../GOCLMCP/scripts/gen-clockify-openapi`:
  `["post", ".../policies/{policyId}/requests"]`,
  `["delete", ".../policies/{policyId}/requests/{requestId}"]`,
  `["patch", ".../policies/{policyId}/requests/{requestId}"]`. After
  regen the canonical OpenAPI carries **188 operations (was 191)**;
  raw-allowlist drops from 134 to 131 routes. All 4 drift gates
  pass; `go test ./internal/tools/...` passes; `fern check` clean;
  `fern generate` clean; `tsc --noEmit` clean; 126/126 vitest.
  The timeOff resource module in the wrapper now exposes 9 methods
  (was 12 — the 3 legacy ops are gone). G.1 coverage metric updates
  from 170/191 = 89% to **170/188 = 90.4%** because the denominator
  shrank with the quarantine.

## Idempotency-Key header — investigation (G.4)

### `clockify.api.idempotency-key.unsupported-noop` — DOCUMENTED 2026-05-25

- **Official claim:** Clockify's public API documentation (probed via
  `https://docs.clockify.me/`) contains **no mention** of an
  `Idempotency-Key` request header, request-deduplication semantics,
  Stripe-style retry safety, or any equivalent feature. None of the
  upstream source bundles (`docs/openapi/sources/{realOPENAPI,AIII,
  clockify-api-probe-lab}` in GOCLMCP) reference idempotency-key
  either; the two `grep -i idempoten` hits in those bundles describe
  endpoint *behaviour* ("DELETE is idempotent-ish: second delete
  returns 400", "add-user-to-group returns 200 with unchanged body
  when user is already a member"), not header support.

- **Actual behaviour (live probe, 2026-05-25, sandbox workspace
  `65b382b606de527a7ee2b60e`):** sent two `POST /workspaces/{wsId}/tags`
  requests with the SAME `Idempotency-Key` header value (a freshly
  minted UUID `3DBEBD67…`) and DIFFERENT bodies
  (`{"name":"sdk-idemp-test-1779660515-a"}` and
  `{"name":"sdk-idemp-test-1779660515-b"}`). Result:
  - Request #1 → `HTTP 201` + tag id `6a1376e4ab8f70cd39f2fd6d`
    (name `sdk-idemp-test-1779660515-a`).
  - Request #2 → `HTTP 201` + tag id `6a1376efab8f70cd39f2fe44`
    (name `sdk-idemp-test-1779660515-b`).
  Two distinct tags created. **Clockify silently ignored the
  `Idempotency-Key` header.** Neither the response status, body,
  nor headers acknowledged the key (no echo-back field, no
  `Idempotency-Key` in response headers, no `X-Idempotency-Replay`
  marker, no dedup-related field anywhere). Both test tags were
  immediately deleted (HTTP 200 on both DELETEs).

- **Live evidence:**
  - `spec/evidence/probes/20260525-idempotency-post1.{json,hdr}` —
    request #1 raw response body + headers.
  - `spec/evidence/probes/20260525-idempotency-post2.{json,hdr}` —
    request #2 raw response body + headers.
  Both pairs gitignored per AGENTS.md §5.4. Reproducible — see
  the curl invocation in the commit message that introduced this
  entry; the only inputs are a fresh UUID and any two distinct
  string names with a shared timestamp slug.

- **MCP tools affected:** none. The Go MCP layer in GOCLMCP doesn't
  emit `Idempotency-Key`; the wrapper's `composedFetch` also doesn't.
  Neither should start, per this finding.

- **Open questions:** none. The probe is definitive: Clockify
  treats `Idempotency-Key` as an unknown header (not 400, not 4xx,
  not echoed) and processes each request independently.

- **Status:** `clockify-feature-absent-skip`. Per the original
  G-track plan: "If no, skip (don't fake idempotency headers;
  they're meaningless without server-side dedup)." Neither
  `x-clockify-idempotency-supported` annotations nor wrapper-side
  `Idempotency-Key` injection should be added. The wrapper's
  `composedFetch` continues to inject only `User-Agent` +
  `X-Request-Id` (the latter is opaque correlation, not dedup).

- **Reopen condition:** if Clockify ships an API changelog
  entry mentioning Idempotency-Key support (or if a future probe
  shows different behaviour — e.g. server echoes the key, or
  request #2 returns the same body as request #1 instead of a new
  tag), re-probe with a longer-lived key (same key over a 24h
  window to test for retention) and a wider op surface (timeEntries
  POST, expenses POST, invoices POST). If still unsupported, this
  entry stays closed.

## Client/project archive update shape split — investigation

### `fern.sdk.clients-update-body-vs-projects-update-top-level` — DOCUMENTED 2026-05-26

- **Official claim:** the generated SDK exposes different request
  shapes for similar-looking update calls:
  `clients.update({ workspaceId, clientId, body })` and
  `projects.update({ workspaceId, projectId, ...fields })`.

- **Actual behaviour (live probe, 2026-05-26, sandbox workspace
  `65b382b606de527a7ee2b60e`):** Clockify accepts client archive
  updates only with the nested client body shape
  (`body: { name, archived: true }`). Sending client update fields
  at the top level returns "Required request body is missing".
  Project archive updates, by contrast, accept the generated
  top-level project fields (`{ name, archived: true }`) and do not
  use a nested `body` wrapper in the generated SDK surface. The
  `archive` helper routes for both clients and projects returned
  404 in this live cleanup path, so archive+delete cleanup must use
  the update methods first.

- **Live evidence:**
  - `mcp/tests/server.test.ts` pins both generated SDK request
    shapes: project update fields at the request top level, client
    update fields inside `body`.
  - `mcp/tests/sandbox.test.ts` and `mcp/src/tools/workflows.ts`
    use the split during live cleanup.
  - 2026-05-26 final sandbox cleanup archived and deleted
    deterministic `DEMO-` projects with project top-level update,
    and deterministic `DEMO-` clients with nested client body
    update, then scanned clients/projects/tags/entries/invoices/
    webhooks to empty arrays for the deterministic prefixes.

- **MCP tools affected:**
  - `clockify_clients_update`
  - `clockify_projects_update`
  - `clockify_demo_cleanup`
  - live sandbox cleanup helpers in `mcp/tests/sandbox.test.ts`

- **Open questions:** whether future Fern versions can normalize
  generated update request shapes without breaking runtime
  behaviour. Until then, do not hand-normalize these two MCP paths.

- **Status:** accepted local SDK shape split. Keep client update
  fields nested under `body`; keep project update fields at the
  request top level. Re-test with live archive+delete cleanup before
  changing either shape.

## Name reserved after archive-then-delete (cross-repo: ai-assistant-addon)

### `entity.name-reserved-after-delete.cross-repo-2026-06-09` — DOCUMENTED 2026-06-09

- **Official claim:** none. The spec describes create
  (`POST /workspaces/{workspaceId}/projects`, `.../tags`,
  `.../clients`) as taking a workspace-unique `name`, but says
  nothing about a name's lifecycle after the entity is deleted.
- **Actual behavior:** a project / tag / client NAME stays
  reserved even after the entity is archived and then deleted.
  Re-creating with the same name returns `... with this name
  already exists` (e.g. `"Project with this name already exists"`)
  even though the name no longer appears in any list — so a
  "list, then reuse the name" recovery never surfaces it. The only
  fix is a distinct name.
- **Live evidence:** discovered live in the sibling
  `../ai-assistant-addon` Clockify work — its live exerciser had to
  switch to unique `AIASSIST_SMOKE_*` names because archived-then-
  deleted names stayed taken (recorded in that repo's `CLAUDE.md`
  planner-quirks section). The conflict wire message is pinned by
  `../GOCLMCP/internal/clockify/errors_test.go`
  (`{"message":"Project with this name already exists","code":501}`).
- **MCP tools affected:** `clockify_projects_create`,
  `clockify_tags_create`, `clockify_clients_create`, and the
  generated SDK `projects.create` / `tags.create` / `clients.create`.
  GOCLMCP now emits a name-reservation recovery hint for these (its
  `internal/tools/firstslice_recovery.go` `recoverable(...)`
  "already exists" branch, with `recovery_test.go` coverage). The
  TS MCP/SDK do not yet surface this.
- **Open questions:** does Clockify ever release a reserved name
  (TTL, or only on workspace reset)? Does the reservation apply to
  tasks (per-project) the same way? Unprobed.
- **Status:** `documented; ts-side-hint-pending`. Recommend the TS
  MCP `clockify_*_create` tools (and the SDK `create` docstrings)
  warn that a previously deleted name may report "already exists"
  and to retry with a distinct name. No spec change — a platform
  behavior, not a shape divergence.

## Per-op host vs client `environment`/`baseUrl` override (add-on consumers)

### `config.per-op-host-vs-environment-override.cross-repo-2026-06-09` — DOCUMENTED 2026-06-09

- **Official claim:** n/a (SDK-internal). Reports run on
  `reports.api.clockify.me/v1` and audit on
  `auditlog-api.api.clockify.me/v1`; the corrected OpenAPI carries
  per-operation `servers` and the generator emits
  `OperationSpec.baseUrl`, so typed methods reach the right host.
- **Actual behavior (by design):** the generated `core/request.ts`
  resolves
  `clientOptions.baseUrl ?? clientOptions.environment ?? operation.baseUrl ?? Default`
  (emitter: `scripts/generate-sdk-from-openapi.mjs`
  `requestRuntimeSourceWithTimeoutAndRetry`). A client-level
  `baseUrl`/`environment` override therefore **wins over** the
  per-op reports/audit host. This is INTENTIONAL per
  `docs/config-precedence-policy.md` ("Base URL override rule":
  `environment`/`baseUrl` are mock/replay/private-gateway levers) —
  it lets one mock host capture ALL traffic, including reports/
  audit (`wrapper/tests/mock-clockify.test.ts` points `environment`
  at a localhost mock). Reordering `operation.baseUrl` ahead of
  `environment` would let reports/audit escape the mock and break
  replay.
- **Cross-repo observation:** the sibling `../ai-assistant-addon`
  is a Clockify ADD-ON whose API host is dynamic per install (read
  from the install-context `apiUrl`), and which derives the reports
  host from the `reportsUrl` claim and the audit host prod-only.
  That "set the api host AND keep per-op reports/audit hosts"
  pattern is NOT expressible through this SDK's single `environment`
  override (setting it clobbers the per-op hosts). A first-pass
  cross-repo audit flagged this precedence as a "bug"; it is not —
  it is the documented mock/replay contract.
- **MCP tools affected:** none directly. Affects SDK consumers that
  are themselves multi-host add-ons.
- **Open questions:** if add-on consumption (dynamic api host +
  derived reports/audit) becomes in-scope, the precedence reorder
  is the wrong fix; the right shape is a separate, explicit
  per-host override map (e.g. `hosts: {api, reports, audit}`) that
  leaves the single mock/replay override semantics intact. Out of
  scope until an add-on consumer is a real target.
- **Status:** `not-a-bug; intentional`. Recorded so a future audit
  does not "fix" the precedence and regress mock/replay. No code
  change.

---

## Live-verified money & wire-shape findings ported from the ai-assistant addon (2026-06-14)

These entries port hard-won, **live-probed** Clockify behaviour from the sibling
`ai-assistant-addon` (its `src/clockify/rest/*` adapter, probe dates 2026-06-10/-11/-12).
That addon hits the real API on every request and found these by probing, not by
reading the spec — so they supersede the spec where they disagree. Some are now
**compensated in this repo's hand-written/MCP layer** (with tests); the rest carry
exact wiring notes and stay `open` until coded + probe-pinned here.

### `invoices.update.replace-and-tax-discount-zeroing` — COMPENSATED 2026-06-14

- **Official claim:** `PUT /invoices/{id}` updates an invoice; the GET and PUT
  share field names.
- **Actual behavior (addon live-probe 2026-06-10):** the PUT **replaces** the
  whole document — a sparse body drops every omitted field (note, subject,
  billFrom, clientAddress, …). AND tax/discount are asymmetric: the GET returns
  `discount`/`tax`/`tax2` as ×100-scaled integers (10% reads back as `1000`),
  but the PUT body wants `discountPercent`/`taxPercent`/`tax2Percent` as plain
  percents. Copying the GET names verbatim **silently ZEROES** tax/discount on
  every update. goclmcp (this repo's spec source) inherits the bug.
- **Live evidence:** addon `tests/unit/rest-invoices.test.ts`
  (`invoiceUpdateBodyFromExisting` / `INVOICE_PERCENT_FIELDS`) and its
  `docs/HISTORY.md` "the big one" post-mortem.
- **MCP tools affected:** `clockify_invoices_update`, `clockify_invoices_create`.
- **Open questions:** none.
- **Status:** `compensated-in-tool-layer`. Shipped here as the pure wrapper
  helper `wrapper/invoice-body.ts` (`invoiceUpdateBodyFromExisting` — editable
  whitelist + name+scale ÷100 map) consumed by `clockify_invoices_update`, which
  now does GET-then-PUT. Tests: `wrapper/tests/invoice-body.test.ts`,
  `mcp/tests/invoices.test.ts`.

### `invoices.create.note-subject-dropped` — COMPENSATED 2026-06-14

- **Official claim:** `POST /invoices` accepts `note`/`subject`.
- **Actual behavior (addon live-probe 2026-06-11):** POST accepts ONLY
  `CreateInvoiceRequest` fields (clientId/currency/dueDate/issuedDate/number);
  `note`/`subject` are **silently dropped** — POST + a follow-up GET both echo the
  workspace placeholder ("INPUT BILL INFO HERE"), never the supplied text.
- **Live evidence:** addon `src/clockify/rest/invoices.ts:219-242` + unit test.
- **MCP tools affected:** `clockify_invoices_create`.
- **Open questions:** none.
- **Status:** `compensated-in-tool-layer`. `clockify_invoices_create` now accepts
  note/subject and applies them via the verified GET-then-PUT path after create.

### `money.amount-units.expenses-major-invoices-minor` — COMPENSATED 2026-06-14

- **Official claim:** money fields use "raw upstream integer units" uniformly.
- **Actual behavior (addon live-verified):** units are NOT uniform — invoices,
  invoice payments, and rates are **minor** (cents) on the wire; **expenses are
  MAJOR** (dollars). An invoice item `unitPrice` is a third scale, minor×100
  (Clockify computes `amount = unitPrice × quantity / 100`).
- **Live evidence:** addon `src/harness/money.ts`, `rest/expenses.ts`,
  `rest/invoices.ts:78-95` + tests.
- **MCP tools affected:** every money-carrying tool (expenses, invoices, reports,
  rates).
- **Open questions:** none for the helper; per-tool adoption tracked below.
- **Status:** `compensated-in-wrapper`. Shipped here as `wrapper/money.ts`
  (`toMinor`/`toMajor`, `CLOCKIFY_AMOUNT_UNITS`, `invoiceItemUnitPrice*`). The
  existing `clockify_expenses_create` already passes major units, consistent with
  this table; rate tools (below) should funnel through `toMinor`. Tests:
  `wrapper/tests/money.test.ts`.

### `holidays.update.replace-and-scope-filter` — COMPENSATED 2026-06-14

- **Official claim:** update a holiday's changed fields.
- **Actual behavior (addon live-verified 2026-06-12):** `PUT /holidays/{id}`
  **replaces** the document (omitted fields 400 "must not be null"), there is **no
  single-GET route** (must list-scan), and the assignment round-trips
  asymmetrically — GET echoes it FLAT as `userIds`/`userGroupIds`, but POST/PUT
  want it as a `{contains:"CONTAINS", ids, status}` filter under `users`/
  `userGroups`. A holiday with no resolvable assignment is rejected.
- **Live evidence:** addon `src/clockify/rest/holidays.ts:62-97` + unit tests.
- **MCP tools affected:** `clockify_holidays_update`, `clockify_holidays_create`.
- **Open questions:** none.
- **Status:** `compensated-in-tool-layer`. `clockify_holidays_update` now
  list-scans, rebuilds the full body, reconstructs the flat assignment into the
  CONTAINS filter, and errors clearly when no assignment can be preserved;
  create accepts `userIds`/`userGroupIds`. Tests: `mcp/tests/holidays.test.ts`.

### `time-off.policies.update.replace-and-scope-filter` — COMPENSATED 2026-06-14

- **Actual behavior (addon live-verified 2026-06-12):** identical class to
  holidays — `PUT /time-off/policies/{policyId}` replaces the doc and wants
  `users`/`userGroups` as `{contains,ids,status}` filters; GET echoes them flat.
  Unlike holidays, policies DO have a single GET (`timeOffPolicies.get`).
- **MCP tools affected:** `clockify_time_off_policies_update`,
  `clockify_time_off_policies_create`.
- **Open questions:** confirm the generated `timeOffPolicies.update` body accepts
  the `users`/`userGroups` filter keys (it lists them in `bodyFromRequest`).
- **Status:** `compensated-in-tool-layer` (2026-06-14). `clockify_time_off_policies_update`
  now GET-then-PUTs via `timeOffPolicies.get`, carries forward the accepted policy
  fields (`POLICY_CARRY_FIELDS`), reconstructs the scope via the shared
  `mcp/src/scope-filter.ts`, and passes the body **FLAT** — the generated method reads
  fields flat and silently dropped the prior nested `body` (a pre-existing bug also
  fixed); create accepts `userIds`/`userGroupIds`. Tests: `mcp/tests/time-off-policies.test.ts`.

### `time-off.policies.scope.status-active-not-all` — COMPENSATED 2026-06-16

- **Official claim:** the `{contains, ids, status}` user/group scope filter on a
  time-off policy is undocumented as to its `status` value.
- **Actual behavior (addon live-verified 2026-06-12):** holiday assignments and
  time-off **policy** scope share the `{contains:"CONTAINS", ids, status}` filter
  shape but use DIFFERENT `status` values — holidays send `status:"ALL"`
  (`ai-assistant-addon/src/clockify/rest/holidays.ts:7`, corroboration only)
  while policies send `status:"ACTIVE"`
  (`ai-assistant-addon/src/clockify/rest/time-off.ts:13`, corroboration only).
  **In-repo source of record:** `docs/live-probe-ledger.json`
  (`getTimeOffRequests`/`getWorkspaceProjects` fixture rows, recorded
  2026-06-18) plus the committed fixture
  `spec/evidence/fixtures/timeoff.requests.search.json`. The
  SDK's shared `mcp/src/scope-filter.ts` previously hard-coded `"ALL"` for both,
  so the policy create/update path sent the wrong status.
- **Live evidence:** addon `src/clockify/rest/time-off.ts:11-14` (`filter()` →
  `status:"ACTIVE"`) vs `src/clockify/rest/holidays.ts:5-8` (`assignment()` →
  `status:"ALL"`); cross-repo unit tests in both modules.
- **MCP tools affected:** `clockify_time_off_policies_create`,
  `clockify_time_off_policies_update` (now pass `"ACTIVE"`);
  `clockify_holidays_create`, `clockify_holidays_update` (unchanged on `"ALL"`).
- **Open questions:** none — the addon proved both values live; whether the API
  silently coerces `"ALL"`→`"ACTIVE"` for policies is unconfirmed but moot since
  we now match the addon's proven value.
- **Status:** `compensated-in-tool-layer` (2026-06-16). `scopeFilter` gained an
  optional `status: "ALL" | "ACTIVE" = "ALL"` parameter; the four policy
  create/update sites in `mcp/src/tools/timeOff.ts` pass `"ACTIVE"`, holiday
  sites keep the default `"ALL"`. Tests: `mcp/tests/time-off-policies.test.ts`
  (policy → ACTIVE), `mcp/tests/holidays.test.ts` (holiday → ALL).

### `rates.put-minor-units-no-get` — PARTIALLY COMPENSATED 2026-06-14

- **Actual behavior (addon live-verified 2026-06-12):** rates are PUTs of an
  integer **minor-unit** `{amount}` body; **GET on a rate path 405s** (discover
  the current value from a membership/project doc). Per-scope endpoints:
  per-project member `…/projects/{p}/users/{u}/{hourly-rate|cost-rate}`;
  Team-section workspace member `…/users/{u}/{hourly-rate|cost-rate}`; task
  `…/projects/{p}/tasks/{t}/{cost-rate|hourly-rate}`. The project **default**
  rate has NO standalone endpoint in the addon's experience — it set
  `hourlyRate`/`costRate` in the project create/update BODY.
- **MCP tools affected:** none yet (the SDK exposes no rate-setting tools).
- **Open questions:** the generated client DOES carry `projects.updateHourlyRate`
  / `updateCostRate` at `PUT /projects/{id}/hourly-rate` (the project-default
  path). The addon found no working default-rate endpoint — so this is a
  spec-vs-live conflict (like the deferred `projects.archive`). **Probe a fake-id
  request (404 vs 405) before shipping a default-rate tool.**
- **Status:** `compensated-in-tool-layer` for the LIVE-VERIFIED member/task rates
  (2026-06-14); the project-DEFAULT rate stays `open`. Shipped three tools — all take
  amount in MAJOR units and `toMinor(amount,"major")` to integer minor:
  `clockify_projects_set_member_rate` (`projects.updateUserHourlyRate`/`updateUserCostRate`),
  `clockify_users_set_member_rate` (`workspaces.updateUserHourlyRate`/`updateUserCostRate`,
  the Team-section workspace-member rate), and `clockify_tasks_set_rate`
  (`tasks.updateBillableRate`/`updateCostRate`). Tests: `mcp/tests/rates.test.ts`. This
  bumped the tool-surface contract to **126** (`docs/mcp-tools.json`, `mcp-contract.json`,
  `mcp-agent-ux-contract.json`, `docs/docs-quality-contract.json`,
  `docs/user-docs-contract.json`, `scripts/check-performance-budgets.mjs`,
  `mcp/tests/server.test.ts`, + README/product-surface/operation-parity regen).
  STILL OPEN: the **project-default** rate — the generated `projects.updateHourlyRate`/
  `updateCostRate` hit `PUT /projects/{id}/hourly-rate`, but the addon found no working
  default-rate endpoint (set `hourlyRate`/`costRate` in the project body instead). Probe
  a fake-id request (404 vs 405) before shipping a default-rate tool.

### `scheduling.project-totals.get-vs-post` — COMPENSATED 2026-06-14

- **Actual behavior (addon live-verified):** a single project's schedule totals
  live at **GET** `…/scheduling/assignments/projects/totals/{projectId}?start&end`.
  The all-projects search is a **POST** whose body has NO `projectId` field —
  sending one was silently dropped and returned ALL projects.
- **MCP tools affected:** the scheduling totals surface
  (`clockify_scheduling_assignments_list_per_project` / `clockify_scheduling_capacity`).
- **Open questions:** the generated `scheduling.listOnProject` (single-project GET)
  carries no `start`/`end` query params; if the live endpoint needs a date range,
  that's a generator gap to widen separately.
- **Status:** `compensated-in-tool-layer` (2026-06-14).
  `clockify_scheduling_assignments_list_per_project` now takes an optional `projectId`
  and routes to the single-project GET (`scheduling.listOnProject`); without it, the
  all-projects POST (`listPerProject`). Tests: `mcp/tests/scheduling-totals.test.ts`.
  Port from addon `src/clockify/rest/scheduling.ts:102-120`.

### `single-gets.404-405-read-from-list` — OPEN

- **Actual behavior (addon live-verified):** several single-GETs are not real
  routes and must read-from-list: `GET /time-off/requests/{id}` 404 ("No static
  resource") → POST-search the requests list and scan; `GET /user-groups/{id}`
  404 → list + scan; `GET /custom-fields/{id}` 405 → list + scan; invoice items
  come from the single-invoice GET (already handled). Holidays/{id} (404) is
  handled by the holidays-update list-scan above.
- **MCP tools affected:** `clockify_time_off_requests_get` (currently a single
  `timeOff.get` — likely 404s live), `clockify_groups_get`.
- **Open questions:** **fake-id probe (404 vs 405) each route before converting** —
  don't convert a route that actually works.
- **Status:** `open`. Port the get-by-scan / POST-search shapes from the addon
  `src/clockify/rest/{time-off,users}.ts`.

### `invoices.items-unit-price-scale` — COMPENSATED-LATENT 2026-06-18 (boundary-guarded)

- **1. What official docs claim:** `AddInvoiceItemRequest.unitPrice`
  (`POST /workspaces/{workspaceId}/invoices/{invoiceId}/items`, operationId
  `addInvoiceItem`) is documented as a plain integer money field, same as every other
  amount; `POST /invoices/{id}/payments` is documented to create a payment. The
  corrected snapshot inherits this — `spec/corrected/clockify.corrected.openapi.yaml`
  carries the blanket note "Invoice item unitPrice/amount fields are preserved in raw
  upstream minor units," which is **wrong for `unitPrice`** (it is a third, ×100 scale).
- **2. What Clockify actually returns (addon live-probe 2026-06-10):** an invoice item's
  `unitPrice` is **minor×100** on the wire (hundredths of a cent), distinct from every
  other money field, because Clockify computes `amount = unitPrice × quantity / 100`.
  Sending plain minor `unitPrice` billed a $1000 item as $10. The sibling `amount` field
  stays plain minor. Separately, `POST /invoices/{id}/payments` returns the updated
  **invoice** document, not the payment — the new payment id must be list-diffed around
  the POST (GET the payments list before and after, take the new id).
- **3. Which test/fixture proves it:** the wrapper helper is unit-tested directly —
  `wrapper/tests/money.test.ts:46-58` and `wrapper/tests/wire-shape.test.ts:126-129`
  pin `invoiceItemUnitPriceToWire(100000) === 10000000` (a $1000 item) and the ÷100
  read-back. The wire scale matches addon `src/clockify/rest/invoices.ts:83`
  (`UNIT_PRICE_WIRE_SCALE = 100`), `:90` (read `/100`), `:254` (write `×100`),
  kept as corroboration only. **In-repo source of record:** committed redacted
  golden `spec/evidence/fixtures/invoice-item.unitprice.json` (`unitPrice:
  10000000`), replayed offline by `make replay-fixtures` asserting
  `invoiceItemUnitPriceFromWire(10000000) === 100000`, plus the unit pin
  `wrapper/tests/wire-shape.test.ts`. Ledgered in `docs/live-probe-ledger.json`.
- **4. Which `clockify_*` tool depends on it:** **none today.** The MCP surface has no
  invoice item-add tool and no payment-create tool — the 8 invoices tools are
  `clockify_invoices_{list,get,create,update,delete,update_status,export,import_time}`
  (`mcp/src/tools/invoices.ts`). `clockify_invoices_import_time` is the only invoice-item
  write and it lets Clockify auto-generate items from time/expenses over a date range, so
  no user-supplied `unitPrice` is ever sent. The wrapper helpers
  `invoiceItemUnitPriceToWire`/`invoiceItemUnitPriceFromWire` are therefore
  **correct-but-unused** — a latent money-corruption trap.
- **5. Which uncertainty remains:** none about the scale itself (live-verified). The open
  question is purely forward-looking: **if** an add-item tool (wiring
  `client.invoiceItems.create`/`addInvoiceItem`) or a payment-create tool is ever added,
  it MUST scale the user-supplied price with `wrapper/money.ts`
  `invoiceItemUnitPriceToWire` (minor → minor×100) before sending and
  `invoiceItemUnitPriceFromWire` on read-back, and a payment-create tool MUST list-diff
  the payments list around the POST to recover the new payment id (the POST response is
  the invoice, not the payment).
- **Boundary guard (2026-06-18):** `make replay-fixtures`
  (`scripts/check-replay-fixtures.mjs`) runs a source-grep tripwire: if any file
  under `mcp/src/` references `addInvoiceItem`, `invoiceItems.create`, or a
  payment-create op, that same file must also reference
  `invoiceItemUnitPriceToWire`. It passes vacuously today (no such tool) and
  reds the day someone wires one without the scale.
- **Status:** `compensated-latent` (2026-06-18 — no tool yet,
  boundary-guarded). When item tools land, port the shapes from addon
  `src/clockify/rest/invoices.ts:249-277` and promote this to a full
  COMPENSATED entry.

### `invoices.payments.post-returns-invoice` — OPEN (no tools yet)

- **Actual behavior (addon live-probe 2026-06-10):** `POST
  /invoices/{id}/payments` returns the updated **invoice** document, not the
  created payment. To recover the new payment id, GET the payments list before
  and after the POST and take the new id (list-diff).
- **MCP tool affected:** none today — the MCP surface has no payment-create
  tool.
- **Status:** `open` (no tools yet — latent only). When a payment-create tool
  lands it must list-diff the payments list around the POST; port from addon
  `src/clockify/rest/invoices.ts:249-277`.

### `time-off.requests.update-status.wrong-method-and-field` — COMPENSATED 2026-06-14

- **Actual behavior (addon live-verified):** the request status endpoint is PATCH
  `/time-off/policies/{policyId}/requests/{requestId}` and the wire field is
  **`status`** (`statusType` only appears in responses). The flat
  `/time-off/requests/{requestId}/status` route 404s.
- **Bug found:** `clockify_time_off_requests_update_status` called the generated
  `timeOff.updateStatus` (the dead flat route) with a `statusType` body — so every
  approve/deny hit the wrong endpoint with the wrong field name.
- **Live evidence:** addon `src/clockify/rest/time-off.ts:187-194` ("the wire field
  is `status`; `statusType` only appears in responses"); generated
  `timeOff.changeTimeOffRequestStatus` (PATCH policy-scoped, body `["note","status"]`)
  vs `timeOff.updateStatus` (PATCH flat, body `["note","statusType"]`).
- **Status:** `compensated-in-tool-layer`. The tool now requires `policyId`, calls
  `changeTimeOffRequestStatus`, and sends `status`. Test: `mcp/tests/sweep-fixes.test.ts`.

### `deletes.archive-first` — COMPENSATED 2026-06-17 (all sub-entities)

- **Actual behavior (addon live-verified):** Clockify rejects DELETE of an ACTIVE
  entity. Projects/clients/expense-categories must be archived first; tasks marked
  DONE first.
- **Live evidence:** addon `rest/projects.ts:54-57`, `rest/clients.ts:35-37`,
  `rest/tasks.ts:44-47`, `rest/expenses.ts` (category archive via PATCH `/status`).
- **MCP tools affected:** `clockify_projects_delete`, `clockify_clients_delete`,
  `clockify_tasks_delete`, `clockify_expenses_categories_delete` (all bare DELETE).
- **Status:** `compensated-in-tool-layer` for expense categories (2026-06-14) —
  `clockify_expenses_categories_delete` now `expenseCategories.archive({archived:true})`
  (the dedicated PATCH `/status`, no replace risk) before delete. Test:
  `mcp/tests/sweep-fixes.test.ts`. Projects/tasks compensated 2026-06-15 and clients
  2026-06-17 (see the sub-entries below) — each archives via GET-then-PUT (carry the
  entity's fields, overlay `archived:true`/`status:"DONE"`) then DELETE, because their
  archive is a **replace-PUT** (`*.update`) where a sparse body risks a 400 on missing
  required fields. The dedicated `/archive` routes (`projects.archive`,
  `clients.archive`) are dead/suspect (`projects.archive` is a known dead 404), so the
  update path is used. All wired through `requireConfirmation`.

### `time-off.requests.get.dead-route` — COMPENSATED 2026-06-15 (live re-probed)

- **Actual behavior (re-probed live 2026-06-15, fake id):** `GET
  /time-off/requests/{id}` → **404** "No static resource" — confirmed dead. The
  requests live behind the POST search `timeOff.list` (`POST
  /time-off/requests`), which returns an envelope `{count, requests}`.
- **NEW live finding:** the search `statuses` filter accepts ONLY
  `[PENDING, APPROVED, REJECTED, ALL]` — it 400s on `WITHDRAWN` (code 501,
  "Value must be from the following set"), even though `WITHDRAWN` IS a valid
  per-request status. So a get-by-scan must filter on `["ALL"]`, not the
  per-request status enum. Guarded 2026-06-18: `clockify_time_off_requests_list`'s
  `statuses` input enum is `REQUEST_SEARCH_STATUSES` = [ALL, PENDING, APPROVED,
  REJECTED], so `WITHDRAWN` is rejected at the input layer before the wire. Test:
  `mcp/tests/time-off-search-statuses.test.ts`.
- **MCP tool affected:** `clockify_time_off_requests_get`.
- **Status:** `compensated-in-tool-layer` (2026-06-15). The tool now searches
  `timeOff.list` with `statuses:["ALL"]`, walks pages (bounded at 50×200), and
  scans by id; errors clearly when the id isn't in the search. Verified live
  end-to-end through the real MCP tool against a real request id. Test:
  `mcp/tests/time-off-get.test.ts`.

### `single-gets.custom-field-get.dead-route` — DOCUMENTED 2026-06-15 (no tool)

- **Re-probed live 2026-06-15 (fake id):** `GET /custom-fields/{id}` → **405**
  "Request method 'GET' is not supported" (confirmed dead). `GET
  /user-groups/{id}` → **405** (already compensated; see
  `user-groups.get.returns-void`).
- **Status:** `documented`. The MCP surface exposes NO custom-field single-GET
  tool (`mcp/src/tools/customFields.ts` has none), so there is nothing to
  convert; recorded so a future custom-field get tool list-scans from the start.

### `deletes.archive-first.projects-tasks` — COMPENSATED 2026-06-15 (live e2e)

- **Live-verified 2026-06-15 on the sacrificial sandbox:** bare DELETE of an
  ACTIVE project → **400 "Cannot delete an active project"**; an ACTIVE task →
  **400 "Cannot delete an active task"**. The dedicated `/archive` route is dead
  (`POST /projects/{id}/archive` → **404**). Archive is a replace-PUT: a project
  via `projects.update({name, archived:true})` (the update whitelist HAS
  `archived`); a task via `tasks.update({name, status:"DONE"})` — both carrying
  the name the replace-PUT requires, GET-then-PUT.
- **Status:** `compensated-in-tool-layer` (2026-06-15). `clockify_projects_delete`
  and `clockify_tasks_delete` now GET-then-PUT (archive / DONE) before DELETE,
  after the confirm gate. Verified LIVE end-to-end through the real MCP tools
  (dry_run → confirm_token → execute): both returned `deleted:true` against a real
  active project + task. Order pinned by `mcp/tests/archive-then-delete.test.ts`.

### `deletes.archive-first.clients-blocked` — COMPENSATED 2026-06-17 (body-envelope path)

- **Live-verified 2026-06-15:** bare DELETE of an ACTIVE client → **400**. The raw
  `PUT /clients/{id}` with `{name, archived:true}` archives it (HTTP 200), then
  DELETE succeeds.
- **Correction (2026-06-17):** the prior "the typed SDK exposes NO way to archive a
  client" conclusion was wrong. The generated `clients.update` FLATTENED form does
  drop `archived` (whitelist `[address, currencyCode, email, name, note]`), and the
  dedicated `clients.archive` route 404s — but the **body-envelope** form
  `clients.update({workspaceId, clientId, body:{name, archived:true}} as never)`
  bypasses the field whitelist: `core.bodyFromRequest` (`wrapper/src/core/request.ts`)
  returns the `body` envelope verbatim when the whitelist has no `"body"` key, so
  `archived:true` reaches the wire. The demo cleanup already uses this path
  (`mcp/src/tools/workflows/demo.ts`).
- **Status:** `compensated-in-tool-layer` (2026-06-17). `clockify_clients_delete` now
  GET-then-PUT (body envelope `{name, archived:true}`) to archive, then DELETE, after
  the confirm gate — mirroring `clockify_projects_delete`. Carries the client `name`
  the replace-PUT requires; errors clearly if the fetched client has no name. Order
  pinned by `mcp/tests/archive-then-delete.test.ts`. The upstream cleanup (type
  `archived` into `UpdateClientsRequestBody` so the cast isn't needed) remains a
  nice-to-have in `../GOCLMCP/` / `spec/corrected`, not a blocker.

### `user-groups.get.returns-void` — COMPENSATED 2026-06-15

- **Actual behavior:** the generated `userGroups.get` is emitted with
  `responseType: "void"`, so `clockify_groups_get` gets nothing back even when the
  group exists; addon reads groups from the list (no single-GET).
- **Why this is offline-verifiable:** the defect is in the GENERATED method
  signature (`core.HttpResponsePromise<void>` at
  `wrapper/src/api/resources/userGroups/client/Client.ts`), not a live-only
  behaviour — the method literally cannot return the group, so the fix needs no
  live probe.
- **Status:** `compensated-in-tool-layer` (2026-06-15). `clockify_groups_get` now
  reads `userGroups.list` and scans by id, erroring clearly on an unknown id
  (never returning void). Test: `mcp/tests/groups-get.test.ts`. The upstream
  generator/spec fix (`../GOCLMCP/`) is still the durable fix.

### `compose.work-package.ensure-repoint-wontfix` — WONTFIX 2026-06-18

- **Rationale:** `createWorkPackage` is already transactional via `runComposition`
  (P1-2). Re-pointing onto `Workspace.ensure*` would (1) drop server-side
  name/page-size:200/clients list filters — breaking `workflows.test.ts:327` and
  forcing unbounded scans, (2) be unable to express `upsert:false` always-create
  (`resolve.ts:13,40,80,121,159`), (3) be unable to carry the per-step `undo`
  closures `runComposition` requires (`compose.ts:151`). `EnsureResult.created`
  exists but is insufficient. `ctx.client` is the unscoped client, not a
  `Workspace`. No SDK count impact. Net regression — not adopted.
- **Status:** `wontfix` (2026-06-18).

### `scheduling.list-per-project.start-end-required-camel-pagesize` — COMPENSATED 2026-06-18

- **Actual behavior (live-probed 2026-06-18):** the all-projects totals search
  **POST** `…/scheduling/assignments/projects/totals` requires `start` AND `end`
  in the body and reads only the **camel** `pageSize` off its whitelist. Probe
  matrix (sandbox WS):
  - omit `start`/`end` → **400** (start+end REQUIRED).
  - `start`+`end` + camel `pageSize` → **200** returning a real
    `ProjectAssignmentsTotal[]` (a 2-item page honored).
  - `start`+`end` + kebab `page-size` → **200** but **21 items** — the kebab key
    is silently IGNORED (page size not applied), confirming the body whitelist
    `["end","page","pageSize","search","start","statusFilter"]` (camel only).
- **Bug found:** `clockify_scheduling_assignments_list_per_project` sent kebab
  `page-size` and omitted `start`/`end` entirely, masked by an `as never` +
  `as unknown[]`. Every all-projects call 400'd (no date range) and the page size
  was never applied.
- **MCP tools affected:** `clockify_scheduling_assignments_list_per_project`
  (all-projects branch only; the single-project GET `listOnProject` is unaffected
  and ignores `start`/`end`).
- **Status:** `compensated-in-tool-layer` (2026-06-18). `start`/`end` are now
  REQUIRED ISO-8601 `z.string()` inputs; the request is typed as
  `ClockifyApi.ListPerProjectSchedulingRequest` with camel `pageSize` and both
  casts dropped; `items` is `ProjectAssignmentsTotal[]`. Test:
  `mcp/tests/scheduling-totals.test.ts` (asserts camel `pageSize`, no `page-size`,
  and input-layer rejection when `start`/`end` are missing).

### `time-off.change-status.union-and-note` — PARTIAL 2026-06-18

- **Actual behavior (status union live-probed 2026-06-18):** the request-status
  PATCH `…/time-off/policies/{policyId}/requests/{requestId}` accepts only
  `APPROVED` / `REJECTED` as the target `status`. `PENDING` and `WITHDRAWN` are
  read-only request states the wire rejects as a target. The generated
  `RequestStatusType` (`PENDING|APPROVED|REJECTED|ALL`) is a search-filter union,
  not the valid set of status TARGETS.
- **Bug found:** `clockify_time_off_requests_update_status` exposed the full
  `REQUEST_STATUSES` (`APPROVED|PENDING|REJECTED|WITHDRAWN`) as a settable
  `statusType`, so an agent could submit a status the wire always rejects.
- **MCP tools affected:** `clockify_time_off_requests_update_status`.
- **Probe-deferred (note-required branch):** the generated
  `ChangeTimeOffRequestStatus` type marks `note` REQUIRED, but the tool sets it
  only when present (`as never` masks the mismatch). Whether the wire actually
  requires `note` was NOT probed — proving it needs creating a PENDING request and
  PATCHing it (a risky multi-step sandbox mutation). The conditional `note` and
  the single `as never` are left exactly as-is, pending a future live probe.
- **Status:** `partial` (2026-06-18). The status union is restricted at the input
  layer to `z.enum(["APPROVED","REJECTED"])`; the note-required branch stays
  probe-deferred. Test: `mcp/tests/sweep-fixes.test.ts` (asserts the input layer
  rejects `PENDING`/`WITHDRAWN` and never reaches the wire).

### `strictness.wrapper-eopt-noimplicitoverride-blocked` — DOCUMENTED 2026-06-18

- **Blocker (offline-verifiable):** `wrapper/tsconfig.json` cannot enable
  `noImplicitOverride` (TS4114 at `wrapper/src/errors/ClockifyApiError.ts` +
  `wrapper/src/errors/ClockifyApiTimeoutError.ts`: `cause` shadows `Error.cause`)
  nor `exactOptionalPropertyTypes` as a package compile flag — exactly 10 EOPT
  errors remain across `wrapper/src/api/errors/*`, `wrapper/src/core/request.ts`,
  and `wrapper/src/errors/ClockifyApiError.ts`. Those files are GENERATED (hard
  stop forbids editing `wrapper/src/**`) and TypeScript reports them even when
  `src` is excluded because the hand-written roots import them transitively.
  Correction: the original note was overstated. The editable root/test files had
  their own EOPT errors too; those are now fixed. The hand-written wrapper
  surface is EOPT-clean and enforced by the differential check in
  `scripts/check-consumer-cast-budget.mjs` (`tsc --exactOptionalPropertyTypes`
  errors outside `src/` and `tests/` == 0).
- **Decision:** both flags stay OFF on wrapper, ON in cli + mcp. The rationale is
  pinned inline in `wrapper/tsconfig.json` `_blockedStrictnessFlags`. The durable
  fix is upstream in `../GOCLMCP/`.
- **Status:** `documented-blocked` (2026-06-18).

### `consumer.cast-budget` — COMPENSATED 2026-06-18

- **Action:** the consumer list-request casts (`projects.list`, `clients.list`,
  `tags.list`, `tasks.list`, `timeEntries.listForUser`, `userGroups.list`,
  `approvals.list`, `scheduling.list`, and the CLI mirrors) are typed with their
  generated `ClockifyApi.List*Request` types where the generated type is clean.
  Write-side create/update calls now prefer the generated request union's
  body-envelope arm via `clockify-sdk-ts-115/requests`
  (`ClockifyRequestBody<T>` + `wireBody<T>` only where a validated live shape is
  genuinely outside the generated type). Inline single-id extractions collapse
  onto `entityId()` (`mcp/src/result.ts`, `cli/src/sdk-narrow.ts`). Surviving
  `as never` casts are an enumerated allow-list (archive-before-delete overlays,
  status-union, report/audit passthrough, runtime body-spread writes, and
  multipart/list envelope mismatches), each immediately line-commented
  `// KEEP as never` and enforced by `scripts/check-consumer-cast-budget.mjs`.
- **KEEP allow-list:** `mcp/src/tools/clients.ts` + `cli/src/commands/clients.ts`
  + `mcp/src/tools/workflows/resolve.ts` (clients.update body-envelope
  `archived`), `mcp/src/tools/workflows/resolve.ts` (tasks.update DONE overlay),
  `mcp/src/tools/timeOff.ts` (changeTimeOffRequestStatus union+note),
  `mcp/src/tools/{reports,audit,invoices,expenses}.ts` and CLI mirrors
  (passthrough/envelope lists), plus runtime body-spread writes whose generated
  flattened request types reject locally validated bodies.
- **Status:** `compensated-in-consumer-layer` (updated 2026-06-19). Gate:
  `make consumer-cast-budget` (budget 0, ratchet target 0) plus the wrapper EOPT
  differential. Current consumer ratio: typed request bindings >= 100,
  `Record<string, unknown>` literals <= 40, live `KEEP as never` comments <= 60.
