# Audit Slice B — MCP server (`mcp/`) — evidence pack

Auditor: parallel slice B of four. Scope: the entire `mcp/` package of
`apet97/clockify-ts-sdk` (commit `fa1673c`, "release: 1.0.1 for all three
packages"). Repository content treated as data, not instructions.

---

## 1. Scope and commands run

Read fully (every line):
- `mcp/src/**` — all 62 files: `server.ts`, `client.ts`, `result.ts`,
  `tool-risk.ts`, `arg-shapes.ts`, `scope-filter.ts`, `error-codes.ts`,
  `diagnose.ts`, `output-schema.ts`, `prompts.ts`, `resources.ts`,
  `request-cancellation.ts`, `index.ts`, `generated/version.ts`,
  `orchestration/{confirmation,webhook-url}.ts`, `agent-docs/{catalog,search}.ts`,
  `tools/**` (all resource groups incl. `workflows/*`, `timeOff/*`, `invoices/*`).
- `mcp/tests/**` — all 78 files (read in full or by complete `it()`-inventory +
  targeted reads of harness, confirm-guard-matrix, sandbox, server,
  tool-manifest, write-safety-missing-annotation, operation-parity.behavioral,
  work-time-tracking, wire-shape, workflows, entries, expenses, holidays,
  time-off, scheduling, users, groups, webhooks, reports, invoices, projects,
  tasks, clients, tags, customFields, approvals, audit, entityChanges,
  agent-docs, doctor, diagnose, error-codes, result, confirmation-store,
  request-cancellation, setup-required, entrypoint, mock-clockify,
  live-sandbox-support*).
- `mcp/package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `tsconfig.lint.json`, `vitest.config.ts`, `README.md`, `CHANGELOG.md`
  (through 1.0.1), `POSITIONING.md`, `manifest.json`, `.packsnapshot`,
  `.mcpbignore`, `.gitignore`, `LICENSE`, `stryker.conf.json`,
  `eslint.config.mjs`, `scripts/{generate-tool-manifest,introspect-harness,
  assert-clean-prefixes}.mjs`, `examples/**`.
- Cross-checks into `wrapper/` (generated SDK): `wrapper/src/api/resources/*/
  client/Client.ts` (method + body-whitelist verification for every delegated
  method), `wrapper/src/api/resources/*/client/requests/*.ts`,
  `wrapper/webhook-url.ts`, `wrapper/resolve.ts`, `wrapper/invoice-body.ts`,
  `wrapper/expense-list.ts`, `wrapper/health.ts`, `wrapper/index.ts` exports.
- Repo docs used as data: `docs/mcp-tool-manifest.json`,
  `docs/mcp-tools.json`, `docs/operation-parity.json`, `docs/error-codes.json`
  (via generated `mcp/src/error-codes.ts`), `AGENTS.md`/`CLAUDE.md` (intent).

Commands run (all read-only or cheap, no heavy gates):
```
find mcp -type f | sort ; wc -l mcp/src/**/*.ts
diff <(grep -oE 'clockify_[a-z_]+' mcp/src/tool-risk.ts | sort -u) \
     <(grep -rnoE '"clockify_[a-z_]+"' mcp/src/tools mcp/src/server.ts | grep -oE 'clockify_[a-z_]+' | sort -u)
node -e "…docs/operation-parity.json missing tsMcp analysis…"
node -e "…docs/mcp-tool-manifest.json vs docs/mcp-tools.json vs live counts…"
npm run type-check -w @apet97/clockify-mcp-115        # PASSES (exit 0, no errors)
npx tsx /tmp/probe/switch-probe.ts                     # M-01 repro (below)
git ls-files / git check-ignore / git tag -l           # packaging/staleness checks
```
`git status --short mcp/` is clean; `mcp/coverage/`, `mcp/reports/`,
`mcp/clockify115-mcp-0.6.*`, `*.mcpb` are ignored untracked artifacts
(root `.gitignore` lines 18/56/57/58).

---

## 2. Inventory observations

### 2.1 Surface (verified)
- **162 tools** registered (`mcp/src/tool-risk.ts` `TOOL_RISK_BY_NAME` has
  162 keys; the registered-name set extracted from `mcp/src/tools/**` +
  `server.ts` is **identical** — verified by diff).
- Risk distribution (pinned by `mcp/tests/tool-manifest.test.ts`):
  read 64, routine_write 26, business_write 41, external_side_effect 5,
  privileged 5, destructive 21 → **72 guarded** (41+5+5+21), 90 unguarded.
- Workflow/domain split: 22/140 (manifest group field).
- `docs/mcp-tool-manifest.json` schemaVersion 2, summary consistent; the
  manifest-name set equals a fresh introspection (`tool-manifest.test.ts`).
- Every guarded tool adds `dry_run`/`confirm_token` to its input schema
  (`mcp/src/result.ts` `defineGuardedTool`); the risk metadata
  (`io.github.apet97.clockify115/risk`, `/confirmation`) is set in
  `registrationConfig` (`mcp/src/result.ts:369-394`).
- Type-check passes (`tsc -p tsconfig.json --noEmit`, strict + exactOptionalPropertyTypes).

### 2.2 Delegation cross-check (verified against generated SDK)
Every SDK method called from `mcp/src` exists in the generated client with a
matching body whitelist:
- `expenseCategories.archive` accepts both flat `{archived}` and
  `body:{archived}` request variants (union type) — `mcp/src/tools/expenses.ts`
  uses both forms correctly (delete-preview flat, archive-tool envelope).
- `timeEntries.listInProgress` → GET `/time-entries/status/in-progress`
  returning `TimeEntriesTimeEntry[]` (`userId?`, `id?` — matches
  `status.ts`/`timer-stop.ts` usage).
- `timeOffPolicies.list` types `page` as **string** (`ListTimeOffPoliciesRequest.ts:7`);
  MCP sends `String(page)` — correct; `resolvePolicyId` passes `String(page)`.
- `webhooks.getWebhookEventStatusesWithLatestLog` takes `size` (not
  `page-size`) and `statuses` — MCP `clockify_webhooks_delivery_diagnose`
  maps correctly.
- `invoices.filter` body whitelist includes camel `pageSize`,
  `invoiceNumber`, `strictSearch`, `sortColumn`, `sortOrder`, `statuses` —
  matches `clockify_invoices_info`.
- `scheduling.listPerProject`/`getUsersCapacityFiltered` read camel
  `pageSize` off the body whitelist; kebab `page-size` is silently ignored —
  MCP uses camel for both (comments document this).
- `users.addUser` takes query `"send-email": "true"|"false"` (string literal)
  + body `email` — MCP sends exactly that.
- `balances.update` body whitelist `[note,userIds,value]`; `timeOff.list`
  body whitelist `[end,page,pageSize,start,statuses,userGroups,users]`;
  `approvals.*` whitelists `[period,periodStart]` / `[note,state]`;
  `holidays.create` flat-vs-envelope union; `sharedReports.*`
  `[filter,isPublic,name,type]`; reports whitelists match the `commonReportFields`
  / `expenseReportFields` mappers. All consistent.
- `requestOptions.queryParams` merge over operation query params
  (`wrapper/src/core/request.ts:54`) — `expenses_categories_list` passing
  `{queryParams:{page,"page-size"}}` as the second arg works.
- `matchByName`/`looksLikeClockifyId`/`resolveUserRef*`/`resolveGroupRefs`/
  `resolveEntityRef` semantics checked in `wrapper/resolve.ts`; id-passthrough
  for `/^[0-9a-f]{24}$/i` values.
- `invoiceUpdateBodyFromExisting` (`wrapper/invoice-body.ts`) maps
  GET `discount/tax/tax2` (×100 ints) → PUT `*Percent` (÷100) — the MCP
  `clockify_invoices_update` preview relies on it correctly.

### 2.3 Test-suite character
- ~75 unit/behavioral test files + 1 env-gated live suite. Genuinely asserts
  wire shapes via fake clients (spy calls), envelope shape, risk metadata,
  token one-use semantics, SSRF guard, cancellation, setup_required path.
- `sandbox.test.ts` (12 flows) is genuinely live: real `loadContext()` +
  `buildServer()` over `InMemoryTransport`, requires governed
  `CLOCKIFY_LIVE_PREFIX`, creates+deletes real objects, skips only on
  wholly-absent credentials, fails closed on 403/404 vs 402.
- Notable gate tests: `tool-manifest.test.ts` (162), `tool-risk.test.ts`
  (162/72/risk totals), `confirm-guard-matrix.test.ts` (33 tools × full
  guard sequence), `write-safety-missing-annotation.test.ts` (root checker),
  `operation-parity.behavioral.test.ts` (stamps resolve).
- Weakness: stryker mutation scope covers only 6 modules
  (`arg-shapes`, `confirmation`, `result`, `scope-filter`, `tool-risk`,
  `tool-registration`) — the 50+ tool modules are not mutation-governed
  (AGENTS.md says mutation is GitHub-gated; scope is a maintained choice).

### 2.4 Packaging
- `package.json` version 1.0.1; `exports` root/`./server`/`./client`; bin
  `clockify115-mcp`; `files: [dist, README.md, LICENSE]`; `.packsnapshot`
  lists exactly the dist tree + README/LICENSE/package.json (no src/).
- `manifest.json` (mcpb) version 1.0.1, env-mapped user config.
- `mcp/src/generated/version.ts` regenerated by every npm script
  (`node ../scripts/generate-package-versions.mjs`) — matches package.json.

---

## 3. Findings table

| ID | Category | Severity | Confidence | Status | One-line claim |
|---|---|---|---|---|---|
| M-01 | correctness (message bug) | medium | high | verified | `switchWork` misreports "previous timer was stopped" when no timer was running |
| M-02 | stale docs | low | high | verified | README one-click bundle link points at 0.8.0 while package is 1.0.1 |
| M-03 | stale docs | low | high | verified | `docs/mcp-tools.json` holidays row omits `list_in_period` (count 5, 4 names) |
| M-04 | correctness (data-loss-adjacent) | low | high | verified | `demo_seed` custom `date` orphans entries from default `demo_cleanup` window |
| M-05 | duplication / drift guard asymmetry | low | medium | verified | Two webhook-event registries; only one has a compile-time exhaustiveness guard |
| M-06 | tool coverage gap / parity | medium | high | verified | 64/168 ops lack tsMcp stamps; ~20 ops genuinely unexposed incl. webhook token rotation, invoice settings/duplicate/export, bulk entry delete |
| M-07 | schema/UX | low | high | verified | `z.url()` accepts http:// at schema; https enforced only in preview |
| M-08 | stale doc snippet | low | medium | verified | `clockify_sdk_snippet` webhook/mcp text promises "URL safety warnings" the envelope does not carry |
| M-09 | response shaping | low | medium | verified | `scheduling_publish` and `users_invite` emit `changed.*[].id: ""` refs (deliberate but chain-breaking) |
| M-10 | discoverability | low | medium | verified | Rate tools (`projects/tasks/users_set_member_rate`) skip name→id resolution unlike sibling id-slot tools |
| M-11 | schema inconsistency | low | high | verified | `clockify_holidays_create.color` accepts any string; projects color has hex regex |
| M-12 | duplication | very low | high | verified | `clockify_approvals_resubmit` re-inlines `APPROVAL_PERIODS` enum |
| M-13 | bounded scan | low | high | verified | `clockify_time_off_requests_get` silently reports not-found past 50 pages (10k requests) |
| M-14 | weak test | low | high | verified | `tool-manifest.test.ts` never asserts `idempotentHint` against live metadata |
| M-15 | error classification | low | medium | verified | `errorCodeForMessage` substring regex misclassifies messages containing "invalid"/"missing" tokens when status is absent |
| M-16 | response shaping | low | medium | verified | `clockify_entries_log` returns request body merged over the created entry in `data` |

---

## 4. Detailed findings

### M-01 (verified) — `switchWork` misreports the no-timer outcome
- **Claim**: `clockify_switch_work`'s failure note claims "the previous timer
  was stopped" even when no timer was running.
- **Evidence**: `mcp/src/tools/workflows/time-tracking.ts:149`
  `stopped = (await stopWork(ctx, {})).structuredContent;` — `structuredContent`
  is the **envelope** `{ok:true, action, data:{stopped:false, reason:"no timer
  running"}, …}` (stopWork returns `successResult(…, { stopped: false, reason: "no timer running" }, …)`
  at `time-tracking.ts:125`). The check at `time-tracking.ts:168`
  `(stopped as { stopped?: boolean }).stopped === false` reads the envelope's
  top-level `stopped`, which is `undefined` — the branch at line 169 is dead;
  line 170 always wins.
- **Reproduction**: probe with a fake ctx where `listInProgress` → `[]` and
  `timeEntries.create` throws:
  ```
  npx tsx /tmp/probe/switch-probe.ts
  → Error: switch_work: the previous timer was stopped, but starting the new timer failed: boom
  ```
  Expected: "no timer was running".
- **Impact**: wrong recovery message on the only failure path of a workflow
  tool; an agent is told a timer was stopped when none was (it then searches
  for a stopped timer). Misleading-hint class, not data corruption.
- **Remediation**: read `(stopped as {data?: {stopped?: boolean}}).data?.stopped`.
- **Verification**: probe above; `mcp/tests/work-time-tracking.test.ts:162`
  covers only the "stop succeeded" branch (asserts the "previous timer was
  stopped" text), so no test contradicts.
- **Contradictory evidence**: none.

### M-02 (verified) — README one-click bundle points at 0.8.0
- **Claim**: The "One-click" install path of `mcp/README.md` links
  `clockify115-mcp-0.8.0.mcpb` from release `mcp-v0.8.0`, while the package is
  at 1.0.1 ("Current release: 1.0.1", README line ~13; `package.json` 1.0.1;
  `manifest.json` 1.0.1).
- **Evidence**: `mcp/README.md:38-39`. `git tag -l` shows `mcp-v0.8.0` exists,
  no `mcp-v1.0.1` tag in this clone (only `mcp-v1.0.0`). `CHANGELOG.md` 1.0.0
  says the 162-tool surface froze at 1.0.0; 0.10.0 took the surface 153→162,
  so the 0.8.0 bundle predates the current 162-tool surface and the guarded
  write features shipped after 0.8.0 (invoice items/payments, estimates,
  templates, workspace settings).
- **Impact**: a user following the recommended install gets an outdated server
  (~9-18 tools fewer, older guard behavior).
- **Remediation**: link the 1.0.1 bundle (or the latest tag) after the release
  exists; add a drift check that the README bundle version equals
  `PACKAGE_VERSION`.
- **Verification**: `git tag -l | grep mcp-v`; `mcp/CHANGELOG.md` 0.10.0/1.0.0
  entries.
- **Contradictory evidence**: the tag `mcp-v0.8.0` exists, so the link is not
  dead; the clone may simply not carry a 1.0.1 tag (see §5 unknowns).

### M-03 (verified) — holidays row omits `list_in_period`
- **Claim**: `docs/mcp-tools.json:49` declares `holidays` count 5 but lists
  only 4 tool names (`list/create/update/delete`); `list_in_period` is missing.
  The published `mcp/README.md` domain table is generated verbatim from this
  file by `scripts/update-readme-tables.mjs` (lines 40-51), so the README
  carries the same gap.
- **Evidence**: `docs/mcp-tools.json:49`;
  `mcp/README.md` "Domain Tools" holidays row (same string). The manifest
  (`docs/mcp-tool-manifest.json`) correctly contains all 5 holiday tools.
- **Impact**: documentation under-describes the surface; an agent that trusts
  the table won't discover `clockify_holidays_list_in_period`.
- **Remediation**: fix the row string (or generate it from the manifest).
- **Verification**: `node -e` comparison of the row vs manifest holiday tools.
- **Contradictory evidence**: none.

### M-04 (verified) — demo seed/cleanup window mismatch
- **Claim**: `clockify_demo_seed` accepts an arbitrary `date`
  (`mcp/src/tools/workflows/demo.ts:113` `str(args.date) || "2026-01-02"`), but
  `clockify_demo_cleanup`'s default entry window is a hard-coded
  `2026-01-01…2026-12-31` (`demo.ts:181-182`). A seed with `date` outside 2026
  (e.g. `"2027-05-01"`) is invisible to default cleanup → orphaned entries.
  Conversely, the default seed date is pinned to 2026-01-02, so after
  2026-12-31 default seeds still write entries dated in the past year
  (deterministic-sandbox design, but the `date`/`start`/`end` args are
  uncoordinated).
- **Impact**: demo data can outlive cleanup (the exact class the cleanup
  contract exists to prevent); only low because it requires an explicit custom
  `date` and the objects are still prefix-discoverable.
- **Remediation**: derive cleanup's default window from the seed date (or
  reject seed dates outside the cleanup window).
- **Verification**: `demo.ts:113,181-182`; no test seeds a custom date and
  then runs default cleanup.
- **Contradictory evidence**: none.

### M-05 (verified) — duplicated webhook event registry with asymmetric drift guards
- **Claim**: Two static registries of the same 51-event set:
  `WEBHOOK_EVENTS` (`mcp/src/tools/workflows/business.ts:30-82`, used by
  `clockify_setup_webhook`) and `WEBHOOK_EVENT_TYPES`
  (`mcp/src/tools/webhooks.ts:64-116`, used by `clockify_webhooks_create/
  _update/_events`). Only `business.ts` carries a compile-time exhaustiveness
  guard (`_MissingWebhookEvent`, `business.ts:85-90`); `webhooks.ts` uses only
  `as const satisfies readonly ClockifyApi.WebhookEventType[]`, which is
  **not** exhaustive — a 52nd union member compiles fine there.
- **Evidence**: sets verified identical today (51/51, diff script); union
  `wrapper/src/api/types/WebhookEventType.ts` has 51 members.
- **Impact**: on the next SDK regen that adds an event, `business.ts` fails
  type-check (good) but `webhooks.ts` silently keeps 51 — the two tools then
  disagree about which events are valid, and the domain create/update enum
  rejects a valid event while the workflow tool accepts it.
- **Remediation**: add the same `Exclude<…> extends never` guard to
  `webhooks.ts`, or derive one registry from the other.
- **Verification**: static; diff of both arrays vs the generated union.
- **Contradictory evidence**: none today.

### M-06 (verified) — operation-parity gaps: 64/168 unstamped, ~20 genuinely unexposed
- **Claim**: `docs/operation-parity.json` lists 168 operations; **64 carry
  `tsMcp: null`**. Of those, several are covered by renamed tools that are not
  stamped (e.g. `getWorkspaceInfo` → `clockify_workspace_settings`,
  `listProjectCustomFields` → `clockify_project_custom_fields_list`,
  `getBalancesForPolicy` → `clockify_time_off_balances_list`,
  `filterWorkspaceUsers` → used by `clockify_groups_list_members`,
  `updateProjectUserHourlyRate` → `clockify_projects_set_member_rate`,
  `updateTaskBillableRate` → `clockify_tasks_set_rate`, `createRecurring
  Assignment` → `clockify_scheduling_assignments_create`), but a genuine set
  has **no MCP tool at all**:
  - `uploadImage` (files), `getCurrentUser`, `getAllMyWorkspaces`,
    `addWorkspace`
  - `getAddonWebhooksOnWorkspace`, `getWebhookLogs`,
    `patch…WebhooksWebhookIdToken` (webhook **token rotation** — notable: the
    SDK's `webhooks.updateToken` exists and is unexposed)
  - `updateWorkspaceCostRate`, `updateWorkspaceBillableRate`,
    `updateUserCustomFieldValue`, `findUserTeamManagers`
  - `downloadExpenseReceipt` (expense receipt file), `getInvoiceSettings`,
    `updateInvoiceSettings`, `duplicateInvoice`, `exportInvoice`,
    `createProjectFromTemplate`, `addLimitedUsersWithInfo`
  - `deleteMany` (bulk time-entry delete), the 5 user-scoped time-entry
    routes (covered by `entries_list`/`timer` paths only in part),
    `submitApprovalRequestForUser`/`resubmitEntriesForApprovalForUser`
    (only the `WithType` variants are exposed).
- **Impact**: parity doc under-reports renamed coverage (agent discoverability)
    and the unexposed ops are real API surface gaps. The README's "full domain
    CRUD" claim (README line ~15, "140 domain tools across Clockify's major
    resources") is defensible ("major resources") but the parity table
    contradicts a "broad CRUDL coverage" reading.
- **Remediation**: stamp renamed coverage in `operation-parity.json` (or
  document the mapping); consider tools for webhook token rotation,
  invoice settings/duplicate/export, and `deleteMany` (all guarded).
- **Verification**: `node -e` over `docs/operation-parity.json` (list in §1).
- **Contradictory evidence**: the Go MCP likewise has `goMcp: null` for most
  of these, so this is a deliberate curation line, not an oversight — but the
  parity file is the place where the decision should be recorded and it
  carries `overrideReason: null` for them.

### M-07 (verified) — http:// URLs pass the schema, fail only in preview
- **Claim**: `clockify_webhooks_create` and `clockify_setup_webhook` accept
  `url: z.url()` (any scheme) at schema level; HTTPS enforcement happens in
  `preview` via `assertSafeWebhookUrl` (`mcp/src/tools/webhooks.ts` create
  preview; `workflows/business.ts` `setupWebhook`). An `http://` callback URL
  therefore produces a `preview_token`-stage `invalid_request` error rather
  than a schema-stage rejection, and `dry_run` is required to learn the
  scheme is invalid.
- **Impact**: minor UX; the schema the model sees advertises `url()` with no
  scheme constraint. `z.url()` also accepts non-http schemes (e.g. `ftp://`),
  which are likewise only caught in preview.
- **Remediation**: `z.string().url().refine(u => u.startsWith("https://"))`
  or keep as-is with a description note.
- **Verification**: zod4 `z.url()` semantics; preview code path.
- **Contradictory evidence**: the error is still a correct, stable-coded
  `invalid_request` — no security gap (the guard runs before any side effect).

### M-08 (verified) — `clockify_sdk_snippet` promises URL-safety warnings that do not exist
- **Claim**: `mcp/src/tools/agent-docs.ts` SNIPPETS.webhook.mcp:
  "Call clockify_setup_webhook with dry_run: true and inspect URL safety
  warnings." The dry-run envelope (`result.ts` defineGuardedTool success
  payload) contains `preview`, `confirm_token`, `expires_at`, `preview_hash`,
  `risk_class` — no URL-safety warnings field; invalid URLs error instead.
- **Impact**: agent guidance mismatch (an agent will look for a field that
  never appears).
- **Remediation**: reword to "the URL is validated before preview; invalid
  URLs error".
- **Verification**: grep of `result.ts` dry-run payload vs snippet text.

### M-09 (verified) — empty-id EntityRefs in two receipts
- **Claim**: `clockify_scheduling_publish` (`mcp/src/tools/scheduling.ts`
  execute) and `clockify_users_invite` (`mcp/src/tools/users.ts` execute)
  emit `changed.updated[].id: ""` / `changed.created[].id: ""` refs
  (via `writeReceipt(..., "")` / name-only refs). `hasChangeSet` keeps them
  because the arrays are non-empty.
- **Impact**: an agent chaining on `changed.*[].id` gets `""` and cannot
  follow up; the output schema (`output-schema.ts` entityRef `id: z.string()`)
  accepts it. Documented as deliberate in comments ("same precedent as the
  workspace-member create receipt") — contract-consistent, but a consumer
  trap.
- **Remediation**: omit the ref (or the changed bucket) when the id is empty,
  or emit a warning field.
- **Verification**: `scheduling.ts` publish execute; `users.ts` invite
  execute; `result.ts:hasChangeSet`.
- **Contradictory evidence**: none.

### M-10 (verified) — rate tools skip name→id resolution
- **Claim**: `clockify_projects_set_member_rate`, `clockify_tasks_set_rate`,
  `clockify_users_set_member_rate` accept raw `userId`/`projectId`/`taskId`
  strings and pass them to the wire untouched (no resolution, no verification),
  while sibling tools (`users_set_status`, all time-off/group/holiday tools,
  `projects_memberships_update`) resolve names via `resolveUserRef` /
  `resolveEntityRef`. The AGENTS.md §10 governed list of id-slot resolvers
  does **not** include the rate tools, so this is contract-consistent, but a
  user id pasted as a name 404s instead of getting the `clarification`
  receipt other tools give.
- **Impact**: discoverability/UX inconsistency; a 24-hex-shaped name is
  treated as an id (same as everywhere else).
- **Remediation**: extend the governed resolver list (needs maintainer
  decision per AGENTS.md).
- **Verification**: `projects.ts` set_member_rate preview; `tasks.ts`
  set_rate preview; `users.ts` set_member_rate preview.
- **Contradictory evidence**: none.

### M-11 (verified) — holidays color unvalidated
- **Claim**: `clockify_holidays_create`/`_update` accept `color: z.string()`
  without format check; `clockify_projects_create`/`_update` validate
  `/^#[0-9A-Fa-f]{6}$/`.
- **Impact**: a bad color reaches the wire as an opaque 400 (upstream
  validation) instead of a local `invalid_request`.
- **Remediation**: reuse the hex regex.
- **Verification**: `mcp/src/tools/holidays.ts` schemas vs `projects.ts`
  `PROJECT_COLOR_SCHEMA`.

### M-12 (verified) — inline enum duplication in approvals_resubmit
- **Claim**: `clockify_approvals_resubmit` uses
  `z.enum(["WEEKLY","SEMI_MONTHLY","MONTHLY"])` inline
  (`mcp/src/tools/approvals.ts`) while the other four approval tools use the
  `APPROVAL_PERIODS` constant. A wire change to periods updates four tools
  and silently misses the fifth.
- **Remediation**: reuse `APPROVAL_PERIODS`.
- **Verification**: grep.

### M-13 (verified) — `clockify_time_off_requests_get` bounded scan
- **Claim**: the get-by-id fallback scans the POST search in pages of 200,
  capped at 50 pages (10,000 requests) and then returns a `not_found` error
  (`mcp/src/tools/timeOff/requests.ts` `clockify_time_off_requests_get`).
- **Impact**: a real request past page 50 is reported as missing; message
  says "not found in the workspace search" (true, but silent about the cap).
- **Remediation**: mention the scan cap in the error message.
- **Verification**: code read; no test exercises the cap.
- **Contradictory evidence**: none.

### M-14 (verified) — manifest test skips `idempotentHint`
- **Claim**: `mcp/tests/tool-manifest.test.ts` "records the governed runtime
  risk and confirmation contract" asserts `readOnlyHint`, `destructiveHint`,
  `openWorldHint` and `confirmation`, but **not** `idempotentHint` — yet
  `idempotentHint` is the only annotation that is config-dependent
  (`idempotent ?? risk === "read"`, `result.ts:380`).
- **Impact**: a tool whose `idempotent` flag flips (e.g. a write incorrectly
  marked idempotent) is not caught by this gate; the root
  `check-mcp-write-safety.mjs` may catch some cases, but this test is the
  manifest-vs-live gate and it has a hole.
- **Remediation**: assert `annotations.idempotentHint === (expectedRisk === "read" || <config flag>)`.
- **Verification**: test source.
- **Contradictory evidence**: none.

### M-15 (verified) — substring regex classification risk
- **Claim**: `errorCodeForMessage` (`mcp/src/error-codes.ts`) classifies by
  substring tokens: any message containing `invalid`, `missing`, `required`,
  `provide`, etc. → `invalid_request`; containing `network|fetch failed|…` →
  `connection_error`. This fallback only runs when the SDK classifier and the
  HTTP status map both miss (status absent), so real upstream errors with a
  status are safe; but a status-less 5xx whose body text contains "invalid"
  or "missing" (e.g. proxy errors, TimeoutError messages) is mislabeled
  `invalid_request` with `retryable: false` instead of `clockify_upstream_error`.
- **Impact**: wrong recovery hint (tells the agent to fix request fields for
  what is a transient upstream failure); the codebase itself works around the
  same class of problem elsewhere (comments in `result.ts`/`switchWork` about
  preserving error classes so retryability survives).
- **Remediation**: order message matchers so network/upstream markers are
  checked before generic validation tokens, or gate validation tokens on
  absence of transport markers.
- **Verification**: static; e.g. `errorCodeForMessage("fetch failed: upstream returned invalid response")`
  → `connection_error` (network first) but
  `errorCodeForMessage("upstream gateway error: invalid gateway")` → `invalid_request`.
- **Contradictory evidence**: deliberate ordering tests exist
  (`error-codes.test.ts`) for the specific documented cases; this is a
  residual false-positive class, not a regression.

### M-16 (verified) — `clockify_entries_log` merges request over response
- **Claim**: success `data` is `{ ...entry, ...body }`
  (`mcp/src/tools/entries.ts` `clockify_entries_log`) — the **request body**
  overrides the created entry's fields. For normal fields this is harmless,
  but any response-only field the body also names (e.g. `start` when derived)
  reflects the request, and the merged object is not the wire entity an agent
  might expect to re-query.
- **Impact**: cosmetic/contract-consistency (other create tools return the
  raw entity); low.
- **Remediation**: return the entry as-is (or add the derived `start` in
  `meta`).
- **Verification**: `entries.ts` log handler.

---

## 5. Contradictions / unknowns

1. **README version claims vs tags**: README says "Current release: 1.0.1"
   and links a 0.8.0 bundle; CHANGELOG documents 1.0.1 (2026-08-06); the
   clone has `mcp-v1.0.0` but no `mcp-v1.0.1` tag. Either the 1.0.1 release
   was made without a tag (unlikely per the release workflow) or the clone's
   tag list is incomplete — cannot distinguish offline. M-02 stands either
   way (the link is not the current release).
2. **`docs/operation-parity.json` `overrideReason: null`** on all 64
   unstamped ops: the file does not record *why* each op is uncovered
   (renamed-tool coverage vs deliberate exclusion vs oversight). The
   behavioral test only checks that non-null stamps resolve; nothing verifies
   that a null stamp is justified.
3. **`clockify_status` running-timer detection** depends on
   `listInProgress` entries carrying `userId` — typed optional
   (`TimeEntriesTimeEntry.userId?`); a live response omitting `userId` would
   silently report "no running timer". Not exercised offline (sandbox suite
   asserts only `data.user.id`). Needs live execution to close.
4. **`expenses_categories_delete` archive-then-delete**: archive is skipped
   only when `body.archived === true` is known; for an already-archived
   category the PATCH `archived:true` may or may not be accepted — unknown,
   needs live.
5. **`clockify_demo_cleanup` task/project/client sweep** relies on list rows
   carrying `billable`/`public`/`name` (projects) or fetch-time GETs
   (tasks/clients); `demoProjectUpdateRequest` fails closed on sparse list
   rows — behavior correct, but the archive path for a project whose GET
   shape differs from the list row is unproven offline.
6. **`errorCodeForError`** consults `classifyClockifyError` first; the
   comment in `result.ts` claims blast radius "exactly 402" for the
   fall-through — verified by code shape (`errorCodeForStatus` only differs
   from the SDK map for status 402), but not by an exhaustive test.
7. **`tool-manifest.test.ts` introspection** uses the private
   `server._registeredTools` map with `MIN_REGISTERED_TOOLS = 134` floor —
   an SDK upgrade renaming that field fails the floor check loudly (fail
   closed), but a rename that still yields ≥134 tools would emit a
   silently-short manifest and the drift test would then fail on the name
   equality — OK, closed.
8. **`mcpb` bundling** (`scripts/build-mcpb.mjs`) needs network; the bundle
   build path itself was not executed (allowed: no heavy gates).
9. **`clockify_approvals_submit_with_type`** sends the request *type* in the
   `approvalRequestId` path slot (documented quirk); correctness depends on
   the generated path being `/approval-requests/{approvalRequestId}` with the
   type as the value — matches the generated client, but live behavior was
   not re-verified in this audit (no credentials).
10. **`z.never().optional()`** for the week review's `date` slot — zod-to-
    json-schema output for `z.never()` is untested against the MCP SDK; the
    model-visible schema for `clockify_review_week` may contain a
    `{"not": {}}`-style entry. Cosmetic; unverified.
11. **`clockify_doctor` clock-skew** depends on `client.health()` returning
    `serverTime` — verified by test mocks, not by live headers.

## 6. Verification queue (execution needed)

1. Live: `clockify_status` on a workspace where another user has a running
   timer and the current user does not — confirm the `runningEntry` null path
   (entry `userId` presence on the live wire).
2. Live: `clockify_demo_seed` with `date: "<outside 2026>"` then default
   `clockify_demo_cleanup` — confirm the entry survives (M-04).
3. Live: `clockify_expenses_categories_delete` on an already-archived
   category (archive-PATCH on archived entity).
4. Live: `clockify_approvals_submit_with_type` round trip to confirm the
   type-in-path-slot quirk.
5. Run `mcp/tests/work-time-tracking.test.ts` + a new boundary test for
   M-01's no-timer branch (message text).
6. Regenerate `docs/operation-parity.json` (root `make operation-parity`) and
   confirm the 64 null stamps are stable / reviewed.
7. `mcpb` smoke for the current version to confirm the 1.0.1 bundle is
   buildable and the README 0.8.0 link is the only stale reference (M-02).
8. `git fetch --tags` then re-check for `mcp-v1.0.1` (unknown #1).

---

## Final assessment

The MCP slice is in unusually good health for an audited surface: the 162-tool
registry and the live registered set are provably identical; every delegated
SDK method, request shape, and body whitelist I cross-checked matches the
generated client; the dry_run→confirm_token store is one-use, scope-bound,
canonical-hash-checked, and TTL'd; the webhook SSRF guard is deep (IPv4/IPv6
embeddings, NAT64/6to4/SIIT, special-purpose ranges, trailing-dot vectors) and
heavily tested; and the test suite genuinely asserts wire shapes rather than
implementation trivia. Type-check passes.

The confirmed defects are concentrated in three areas: (1) one real message
bug in `switchWork` (M-01) that an uncovered branch lets through; (2) stale
docs (M-02, M-03, M-08) where the packaging/parity story has drifted a release
or a tool behind; (3) small contract inconsistencies (M-04–M-16) — duplicated
registries with asymmetric guards, empty-id receipts, an enum inlined once,
and a manifest gate that skips `idempotentHint`. The largest structural gap is
M-06: ~20 OpenAPI operations with no MCP tool and 64 unstamped parity rows
with `overrideReason: null`, i.e. the coverage decision is not recorded where
the repo's own gate reads it.

No critical or high-severity defects were confirmed. Nothing in the slice
indicates data-loss, credential leakage (webhook `authToken` redaction is
correct and tested), or a bypass of the confirmation/SSRF guarantees.
