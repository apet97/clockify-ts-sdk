# 03 — PUBLIC API INVENTORY

Externally consumable surfaces. Verified mechanically where noted.

## Package entry points (observed)

| Package | Name | Version | Bins | Exports |
|---|---|---|---|---|
| SDK | `clockify-sdk-ts-115` | 1.0.1 | — | root `.` + 27 named subpaths (dual `import`/`require` conditions, each `{types, default}`) |
| CLI | `@apet97/clockify-cli-115` | 1.0.1 | `clockify115`, `clk115` | root |
| MCP | `@apet97/clockify-mcp-115` | 1.0.1 | `clockify115-mcp` | root, `./server`, `./client` |

Versions coordinated at 1.0.1 (`.release-please-manifest.json`, package
manifests, `wrapper/generated/version.ts` = `PACKAGE_VERSION "1.0.1"`).

## SDK public surface (observed)

- 93 root symbols re-exported from `wrapper/index.ts` (governed by
  `docs/sdk-public-api.json` + `wrapper/scripts/verify-dual-build.sh`
  SURFACE CSV; dual-build smoke asserts ESM+CJS expose them).
- 27 named subpaths + root (governed by `docs/sdk-public-api.json`,
  `package.json` `exports`, tsconfig aliases, `verify-dual-build.sh`):
  `create-client`, `composed-fetch`, `errors`, `deprecation`, `iter`,
  `pagination`, `paginated-list`, `webhooks`, `webhook-events`,
  `with-response`, `scoped-client`, `otel-hooks`, `health`, `rate-limit`,
  `diagnostics`, `request-options`, `operation-receipt`, `money`,
  `invoice-body`, `resolve`, `dates`, `ensure`, `requests`, `reports`,
  `bulk`, `compose`, `expense-list`.
- `ClockifyApiClient` (`wrapper/src/Client.ts`): 30 resource getters
  (tags, clients, projects, tasks, users, userGroups, workspaces, customFields,
  timeEntries, timeOff, timeOffPolicies, holidays, balances, balanceAssignment,
  scheduling, webhooks, invoices, invoiceSettings, invoiceItems, invoicePayments,
  expenses, expenseCategories, approvals, memberProfiles, sharedReports,
  reports, expenseReport, auditLogReport, files, entityChangesExperimental) +
  a `fetch` passthrough.
- Notable hand-written exports: `createClockifyClient`, `ClockifyClient`
  (routing-aware), `composedFetch`, `iterAll`/`iterPages`, `paginate`,
  `verifyClockifyWebhook`, `constructEvent`, `ClockifyWebhookEvent`,
  `Workspace` scoped client, `findOrCreate` (`ensureTag`/`ensureProject`/
  `ensureClient`), `runComposition`/`runBulk`, `getRateLimitFromError`,
  `promoteDateBoundary`, `invoiceUpdateBodyFromExisting`,
  `errorCodeEntry`/`recoveryForCode`/`retryableForCode`,
  `verifyClockifyWebhook`, `classifyClockifyError`, `isRateLimitError` etc.
- Error surface: `ClockifyApiError` hierarchy + status-based guards
  (unsound-by-design narrowing, W-06), `CLOCKIFY_ERROR_CODES` registry (31
  entries; `errorCodeEntry` silently falls back to row 0 for unknown codes,
  W-07).
- Config surface: `createClockifyClient({ apiKey | addonToken, routing:
  region | subdomain | custom, allowCustomHttpsHosts, retryPolicy,
  maxRetries, timeoutMs, … })`; env `CLOCKIFY_API_KEY`, `CLOCKIFY_ADDON_TOKEN`,
  `CLOCKIFY_REGION`, `CLOCKIFY_SUBDOMAIN`.
- Runtime claim: Node `>=22.13.0`; README claims browsers work for read-only
  flows (contradicted by unguarded Node imports, W-04).

## CLI surface (observed)

- 22 top-level groups (`cli/src/index.ts`, pinned by `cli/tests/index.test.ts`):
  `api`, `status`, `doctor`, `start`, `stop`, `log`, `entries`, `projects`,
  `clients`, `tasks`, `tags`, `webhooks`, `invoices`, `expenses`, `timeoff`,
  `scheduling`, `audit-log`, `reports`, `shared-reports`, `users`,
  `approvals`, `completion`.
- 66 documented commands (64 terminal leaves + `help [command]` + `--version`)
  per `docs/cli-commands.json`; leaf risk 29 read / 25 write / 10 destructive
  per `docs/cli-write-safety-contract.json`.
- 9 global flags: `--workspace`, `--base-url`, `--region`, `--subdomain`,
  `--json`, `--output table|json|ndjson`, `--compact`, `--select <dot-path>`,
  `--no-color`.
- Output modes: table/json/ndjson, `--compact`, `--select`; receipts for
  writes (`ok/action/entity/ids/…`).
- Exit codes: 0 success/help/version; 1 runtime/validation error; 2 commander
  usage error (invalid `--output` → 2; invalid `--region` → 1, C-3).
- Config: flags > env > rc (`clockifyrc.json` then `.clockifyrc.json`;
  `CLOCKIFY_HOME` overrides homedir); rc `apiKey` rejected.
- Env: `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, `CLOCKIFY_REGION`,
  `CLOCKIFY_SUBDOMAIN`, `CLOCKIFY_BASE_URL`, `CLOCKIFY_HOME`,
  `NO_COLOR`/color controls.
- Completion: `clk115 completion <shell>` (bash/zsh/fish).
- `clk115 api <method> <path>` — raw passthrough covering all 168 ops.

## MCP surface (observed)

- 162 tools: 22 workflow/orientation + 140 domain across 21 resource groups.
- Risk classes (pinned by `mcp/tests/tool-risk.test.ts`): read 64,
  routine_write 26, business_write 41, external_side_effect 5, privileged 5,
  destructive 21. 72 guarded tools accept `dry_run`/`confirm_token`.
- Workflow tools: daily time tracking (`clockify_status`, `clockify_start_work`,
  `clockify_stop_work`, `clockify_switch_work`, `clockify_log_work`),
  work-package setup, review/fix (`clockify_review_day`, `clockify_review_week`),
  invoices/expenses/time-off/scheduling/webhooks workflows,
  `clockify_demo_seed`/`clockify_demo_cleanup`.
- Orientation tools: `clockify_docs_search`, `clockify_operation_guide`,
  `clockify_sdk_snippet`.
- Envelope shape (all tools): `{ ok, action, data|preview, confirm_token?,
  expires_at?, preview_hash?, risk_class?, meta?, warnings?, changed? }`;
  errors as structured receipts with stable codes (`invalid_request`,
  `clockify_upstream_error`, `connection_error`, …).
- Config: env `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`,
  `CLOCKIFY_REGION`, `CLOCKIFY_SUBDOMAIN` (env-only; no rc file).
- Stdio transport; `manifest.json` for one-click install bundles.
- Tool metadata emitted: `io.github.apet97.clockify115/risk`,
  `/confirmation`, `readOnlyHint`, `destructiveHint`, `openWorldHint`,
  `idempotentHint` (the manifest test asserts all but `idempotentHint`, M-14).

## Documented public behavior (observed)

- SDK: README runtime table (Node/browsers), 29-resource-module claim
  (stale; 30 resources, W-11), retry semantics (RETRY-001), routing matrix,
  webhook verification (shared-secret scheme, not HMAC — documented as
  doc-only evidence), pagination semantics.
- CLI: README command table, exit-code table, config precedence, examples
  pointer (broken example, C-4), "success-only commands emit
  `{ok:true,message}`" (nothing emits it, C-7).
- MCP: README tool table (holidays row missing `list_in_period`, M-03),
  one-click bundle link at 0.8.0 while package is 1.0.1 (M-02), POSITIONING.
- OpenAPI: `docs/openapi-operations.md` (168 rows), `docs/operation-parity.md`,
  `docs/spec-confidence.md`, discrepancy ledger (79 anchors).

## Compatibility-relevant facts (observed)

- `ClockifyRegion` union: `global | eu | us | uk | au | developer`; only
  `global` live-confirmed; others gated by `acknowledgeUnconfirmedRegion`.
- Peer ranges: CLI and MCP declare `^1` SDK peer range (version-consistency
  gate enforces).
- `envContract`/`configPrecedenceContract` gates pin env/config surfaces.
- MCP `clockify_sdk_snippet` promises "URL safety warnings" that the dry-run
  envelope does not carry (M-08).
