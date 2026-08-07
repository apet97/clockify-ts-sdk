# 05 — OPENAPI COVERAGE

Source: `spec/corrected/clockify.corrected.openapi.yaml` (probed
mechanically), `spec/official/`, `spec/evidence/discrepancies.md`,
`docs/operation-parity.json`, and GOCLMCP data tables (via slice D).

## Operation coverage (observed, mechanically verified)

- 168 operations, no duplicate operationIds; 113 paths; 31 tags; methods
  49 GET / 52 POST / 29 PUT / 23 DELETE / 15 PATCH.
- All 168 are generated into the SDK (`docs/operation-parity.json`
  `sdkGenerated: 168`).
- 149 ops carry explicit `x-fern-sdk-group-name` + `x-fern-sdk-method-name`
  (27 groups); 19 are operationId-derived (listed in
  `docs/sdk-operation-naming-classifications.json`; ADR 0006's "14 derived"
  is stale — D-03).
- MCP: 104 ops have an exact `tsMcp` tool stamp; 64 carry `tsMcp: null`
  with `overrideReason: null` on every row (M-06). Of those 64, every row has
  a non-empty `candidateTools` suggestion; ~20 operations genuinely have no
  MCP tool (webhook token rotation, invoice settings/duplicate/export, bulk
  `deleteMany`, 5 user-scoped time-entry routes, `uploadImage`,
  `getCurrentUser`, `getAllMyWorkspaces`, `addWorkspace`, workspace cost/
  billable-rate updates, `updateUserCustomFieldValue`, `findUserTeamManagers`,
  `downloadExpenseReceipt`, `createProjectFromTemplate`,
  `addLimitedUsersWithInfo`, approval submit/resubmit `ForUser` variants).
  Several of the 64 are covered by renamed tools that are not stamped
  (e.g. `getWorkspaceInfo` → `clockify_workspace_settings`,
  `updateProjectUserHourlyRate` → `clockify_projects_set_member_rate`).
- CLI: no per-operation mapping exists (`docs/cli-commands.json` is
  command-level; G-4). Coverage is group-level command files plus the
  universal `clk115 api` raw fallback. See `04-CONTRACT-TRACEABILITY.csv`.
- `x-clockify-mcp-tools` extension: present on all 168 ops but always an
  empty array (S-09) — the spec advertises "MCP mapping" provenance that the
  field does not carry.

## Live-status stamps (observed)

- `x-clockify-live-status`: 161 live-success / 6 probe-documented /
  1 documented. The live-evidence manifest attests only 134 live-success /
  19 probe-documented / 15 documented (S-02). The delta (27 ops) is
  unexplained in-repo; the ledger cites a "156/168" headline that matches
  neither authority (S-10).

## Schemas and types (observed)

- 405 component schemas. 42 `nullable: true` occurrences; 3 combine
  `nullable` with `$ref`: `TimeEntry.costRate` → `OpenapiRateDto`,
  `TimeEntry.hourlyRate` → `OpenapiRateDto`,
  `WeeklyReportResponse.totals.items` → `TimeEntryReportTotals`. The ledger's
  "never combines nullable with $ref (41 uses)" claim is false of the current
  spec (S-04).
- Known schema-shape facts recorded in the ledger (sample):
  `getWorkspaceExpenses` resolves `WorkspaceExpensesDtoV1` →
  `ExpensesWithCountDtoV1` → `ExpenseHydratedDtoV1` (list shape differs from
  `getExpenseById` — expanded `category`/`project`/`task` + `fileName`).
- `TimeEntriesTimeEntry.userId` is optional; MCP `clockify_status` running-
  timer detection depends on it (MCP unknown 3).
- `ListTimeOffPoliciesRequest.page` is typed `string` (generated);
  MCP coerces `String(page)` — consistent.
- `createApprrovalRequest_1` operationId carries an upstream typo + `_1`
  suffix (S-08).

## Requiredness, nullability, enums (observed)

- Enum hygiene: one inline `z.enum(["WEEKLY","SEMI_MONTHLY","MONTHLY"])` in
  MCP `approvals_resubmit` duplicates the shared `APPROVAL_PERIODS` (M-12).
  The CLI `WEBHOOK_LIST_TYPES` and MCP `WEBHOOK_EVENT_TYPES` mirror the
  generated `WebhookType`/`WebhookEventType` unions (51 events; M-05).
- `x-clockify-empty-body-is-valid` extension exists; used to relax
  request-body requiredness for specific ops (e.g. update paths).
- Holiday `color` is unvalidated in MCP schemas while project color carries
  a hex regex (M-11).

## Parameter placement and serialization (observed)

- 21 list ops stamped `page` + `page-size` (inline or via `PageQuery`/
  `pageSizeQuery` refs); 18 ops stamped `x-clockify-last-page-header: true`.
  Both counts match AGENTS.md claims.
- Per-op `servers` overrides: 10 reports ops → `https://reports.api.clockify.me/v1`,
  1 audit-log op → `https://auditlog-api.api.clockify.me/v1`; host split
  api=157 / reports=10 / audit=1 (ADR 0006 says api=152 — stale, D-03).
- `users.addUser` takes `send-email` as a query string-literal "true"|"false";
  `webhooks.getWebhookEventStatusesWithLatestLog` uses `size` not `page-size`;
  `invoices.filter`/`scheduling.listPerProject` use camel `pageSize` in the
  body whitelist while kebab `page-size` is silently ignored — MCP uses camel
  (documented in comments; consistent).
- `money` handling: invoice GET `discount/tax/tax2` (×100 ints) → PUT
  `*Percent` (÷100) via `wrapper/invoice-body.ts` — consistent.

## Errors and authentication (observed)

- Security schemes: `ApiKeyAuth` (X-Api-Key) and `AddonTokenAuth`
  (`components.securitySchemes.AddonTokenAuth.name = "X-Addon-Token"`).
  The `x-clockify-security-aliases` annotation table contradicts the scheme:
  60 ops list `X-Addon-Key`, 5 list `x-addon-token`, 2 list both
  `X-Addon-Key` + `X-Marketplace-Key`, 1 only `X-Marketplace-Key`, 9 empty
  (S-03). The official snapshot's scheme is `AddonKeyAuth`/`x-addon-token`.
  The wire header name is NOT live-probed (unknown).
- SDK auth model: `apiKey` and `addonToken` mutually exclusive (discriminated
  union); no cast workaround (governed).
- Error handling: `ClockifyApiError` classification in the SDK; the MCP
  classifier (`mcp/src/error-codes.ts`) maps status + message tokens;
  substring regex misclassification risk (M-15).

## Pagination (observed)

- `iterAll`/`iterPages` consume Last-Page headers on the 18 stamped ops and
  fall back to the non-full-page heuristic; `paginate` loses the header
  (W-13). `iterPages` documents `pageSize` max 200 but does not enforce it
  (W-08). MCP `clockify_time_off_requests_get` scans capped at 50 pages
  (M-13). CLI clamps `--limit` to 200 except expenses (10,000) and audit-log
  (50) and reports detailed (1,000) — documented in help text.

## Generated-code provenance and drift (observed)

- The corrected snapshot is byte-identical to the GOCLMCP canonical at HEAD
  `7d26f48`, but the source lock + manifest attest commit `1dc0392` with a
  different sha (S-01). `check-live-evidence-manifest.mjs` compares
  manifest↔lock only; nothing compares lock↔shipped bytes.
- `spec/evidence/live-evidence-currentness.json` records the new spec hash
  in `inputHashes` (recorded after the change), so the currentness gate
  matches the tree.
- GOCLMCP `SDK_METHOD_NAMES` has 172 entries; 23 reference method+path pairs
  absent from the shipped spec (S-06). `PHANTOM_PATHS` has 35 entries;
  AGENTS.md says 33 (S-07).
- `info.version: "2026-05-12"` is a hardcoded generator constant (S-05).

## Specification drift vs official (observed)

- `docs/spec-diff-official.md` and `spec-confidence.md` are generated by
  `make official-openapi-report`; `official-openapi-drift` (offline) and
  `official-openapi-fetch` (network, fails closed) gate freshness. Not
  executed in this audit.
- The ledger records 79 anchors; the anchor inventory has 78 (missing
  `errors.400-not-found.regex-breadth-unprobed`, D-11).

## Coverage verdict

- SDK: 168/168 generated (mechanical). MCP: 104 exact + several renamed
  un-stamped + ~20 genuinely unexposed (coverage decision not recorded —
  `overrideReason: null`). CLI: group-level + raw fallback; no per-op
  traceability maintained. Tests: see `04-CONTRACT-TRACEABILITY.csv`
  `testEvidence` column and `10-TEST-AND-GATE-MATRIX.md`.
