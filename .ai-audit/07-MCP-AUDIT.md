# 07 — MCP AUDIT

Slice B findings (M-*). Severity/confidence and full evidence in
`13-FINDINGS-LEDGER.csv`. The slice's overall health is good: 162/162 tool
registry equality, all delegations cross-checked against the generated SDK,
confirmation store and SSRF guard verified sound.

## Correctness

### M-01 (verified by repro) — `switchWork` misreports the no-timer outcome
- `mcp/src/tools/workflows/time-tracking.ts:149`: `stopped =
  (await stopWork(ctx, {})).structuredContent` — the ENVELOPE, not `data`.
- `:168`: `(stopped as { stopped?: boolean }).stopped === false` reads the
  envelope's top-level `stopped` (undefined) → the "no timer was running"
  branch is dead; the "previous timer was stopped" note always wins.
- Repro: fake ctx with `listInProgress → []` and `timeEntries.create` throw
  → `Error: switch_work: the previous timer was stopped, but starting the
  new timer failed: boom`.
- Remediation: read `(stopped as {data?: {stopped?: boolean}}).data?.stopped`;
  add a no-timer-branch test (current test at
  `work-time-tracking.test.ts:162` covers only the stop-succeeded branch).

### M-04 (verified) — demo seed/cleanup window mismatch
- `demo.ts:113`: seed accepts arbitrary `date` (default `2026-01-02`);
  `demo.ts:181-182`: cleanup's default entry window is hard-coded
  `2026-01-01…2026-12-31`. Seeds outside 2026 orphan from default cleanup.
  Also: after 2026-12-31, default seeds write entries dated a year back
  (deterministic-sandbox design, but uncoordinated).
- Remediation: derive cleanup window from the seed date, or reject seed
  dates outside the cleanup window.

## Tool coverage and parity

### M-06 (verified) — 64/168 ops unstamped; ~20 genuinely unexposed
- `docs/operation-parity.json`: 64 rows `tsMcp: null`, every one with
  `overrideReason: null`. Renamed-tool coverage exists but is unstamped
  (`getWorkspaceInfo` → `clockify_workspace_settings`,
  `listProjectCustomFields` → `clockify_project_custom_fields_list`,
  `getBalancesForPolicy` → `clockify_time_off_balances_list`,
  `updateProjectUserHourlyRate` → `clockify_projects_set_member_rate`,
  `updateTaskBillableRate` → `clockify_tasks_set_rate`,
  `createRecurringAssignment` → `clockify_scheduling_assignments_create`).
- Genuinely unexposed: `uploadImage`, `getCurrentUser`, `getAllMyWorkspaces`,
  `addWorkspace`, `getAddonWebhooksOnWorkspace`, `getWebhookLogs`,
  `patch…WebhookToken` (token rotation — the SDK method exists and is
  unexposed), `updateWorkspaceCostRate`, `updateWorkspaceBillableRate`,
  `updateUserCustomFieldValue`, `findUserTeamManagers`,
  `downloadExpenseReceipt`, `getInvoiceSettings`, `updateInvoiceSettings`,
  `duplicateInvoice`, `exportInvoice`, `createProjectFromTemplate`,
  `addLimitedUsersWithInfo`, `deleteMany` (bulk time-entry delete), 5
  user-scoped time-entry routes, `submitApprovalRequestForUser` /
  `resubmitEntriesForApprovalForUser`.
- The Go MCP likewise has `goMcp: null` on most of these — a deliberate
  curation line, but the decision is not recorded in the parity file.

## Schemas and validation

- M-07 (verified): `z.url()` accepts `http://` and non-http schemes at
  schema level; HTTPS enforced only in preview (`assertSafeWebhookUrl`).
  No security gap (guard runs before side effects), but the model-visible
  schema advertises more permissiveness than the tool delivers.
- M-11 (verified): `clockify_holidays_create/update` `color: z.string()`
  unvalidated; projects validate `/^#[0-9A-Fa-f]{6}$/`.
- M-10 (verified): rate tools (`projects_set_member_rate`,
  `tasks_set_rate`, `users_set_member_rate`) skip name→id resolution that
  sibling id-slot tools perform; a pasted name 404s instead of producing the
  `clarification` receipt. Contract-consistent per AGENTS.md §10 list, but
  a UX inconsistency.
- M-13 (verified): `clockify_time_off_requests_get` scans POST search capped
  at 50 pages (10,000 requests) then reports `not_found` without mentioning
  the cap.

## Response shaping

- M-09 (verified): `clockify_scheduling_publish` and `clockify_users_invite`
  emit `changed.*[].id: ""` refs (deliberate; chain-breaking for agents).
- M-16 (verified): `clockify_entries_log` returns `{...entry, ...body}` —
  request body overrides response fields (e.g. derived `start`).
- M-08 (verified): `clockify_sdk_snippet` webhook guidance says "inspect URL
  safety warnings"; the dry-run envelope carries no such field (invalid URLs
  error instead).

## Duplication and drift guards

- M-05 (verified): two 51-event webhook registries
  (`workflows/business.ts:30-82` and `tools/webhooks.ts:64-116`); only
  `business.ts` has a compile-time exhaustiveness guard. A 52nd union member
  compiles fine in `webhooks.ts`.
- M-12 (verified): `approvals_resubmit` inlines
  `z.enum(["WEEKLY","SEMI_MONTHLY","MONTHLY"])` instead of reusing
  `APPROVAL_PERIODS`.
- M-14 (verified): `tool-manifest.test.ts` asserts `readOnlyHint`,
  `destructiveHint`, `openWorldHint`, and `confirmation` but NOT
  `idempotentHint` — the only config-dependent annotation
  (`result.ts:380`).
- M-15 (verified): `errorCodeForMessage` substring matching can mislabel
  status-less 5xx messages containing "invalid"/"missing" as
  `invalid_request` (retryable: false) instead of `clockify_upstream_error`.

## Stale docs (MCP-adjacent)

- M-02 (verified): `mcp/README.md:38-39` links `clockify115-mcp-0.8.0.mcpb`
  while the package is 1.0.1 (and the 0.8.0 bundle predates the 162-tool
  surface). No `mcp-v1.0.1` tag exists in this clone (unknown).
- M-03 (verified): `docs/mcp-tools.json:49` holidays row: count 5, 4 names
  (`list_in_period` missing); the published README domain table is generated
  verbatim from this file (`scripts/update-readme-tables.mjs:40-51`).

## Verified sound (checked, no finding)

- 162/162 registry equality (risk registry ↔ registered set, byte-identical
  diff).
- All delegated SDK methods exist with matching body whitelists
  (incl. `expenseCategories.archive` flat/envelope union forms,
  `timeEntries.listInProgress` shapes, `timeOffPolicies.list` string page,
  `invoices.filter` camel pageSize, `scheduling` camel pageSize,
  `users.addUser` query literal, `balances.update` whitelist, reports
  common/expense field mappers).
- `ConfirmationTokenStore`: one-use, scope-bound, canonical-hash-checked,
  5-minute TTL.
- Webhook SSRF guard incl. IPv6 embedding vectors; authToken redaction.
- `npm run type-check -w @apet97/clockify-mcp-115` passes.

## Unknowns needing live/execution verification

1. `clockify_status` running-timer detection depends on optional `userId` on
   live wire entries.
2. `clockify_demo_seed` custom-date orphan (M-04) live confirmation.
3. `expenses_categories_delete` archive-PATCH on already-archived category.
4. `approvals_submit_with_type` type-in-path-slot quirk live behavior.
5. `z.never().optional()` JSON-schema rendering for `clockify_review_week`
   (cosmetic, unverified against MCP SDK).
6. `clockify_doctor` clock-skew depends on live `serverTime`.
7. `mcpb` bundling build path not executed (needs network).
