# Spec & live-API reality

Repo gotchas extracted from `CLAUDE.md`. The canonical contract is
[`AGENTS.md`](../../AGENTS.md); this file carries the situational detail so
`CLAUDE.md` can stay an index. Indexed from [`docs/README.md`](../README.md).


- **Host routing is two layers, not one.** (a) Per-operation: some operations
  live on non-default hosts (reports → `reports.api.clockify.me/v1`, audit-log
  → `auditlog-api.api.clockify.me/v1`, shared/expense reports); the corrected
  OpenAPI carries a `servers` override and the generator emits
  `OperationSpec.baseUrl`. (b) Client-level (0.13.0): a typed `routing`
  profile on `createClockifyClient` selects a region, workspace subdomain, or
  per-service custom host. Full dispatch precedence is `suppliedBaseUrl >
  suppliedEnvironment > serviceBaseUrl > operationBaseUrl > default`, so a
  `custom` profile naming only `regular` never erases another operation's own
  route. `routing` is mutually exclusive with `environment`/`baseUrl` and is
  validated synchronously at construction. Only `global` is live-confirmed —
  every other profile needs `acknowledgeUnconfirmedRegion: true`; do not remove
  that gate, no regional sacrificial workspace exists. `pto.api.clockify.me` is
  no longer allowlisted (H02-ROUTING: zero backing operations). Hand-written
  code must not assume the default host. See AGENTS.md §1 → *Service routing*.
- **RETRY-001: retries are read-only by default.** Both retry layers (the
  generated request runtime and `composedFetch`'s `DEFAULT_RETRY_POLICY`)
  auto-retry only `GET`/`HEAD`/`OPTIONS`. A network failure or retryable 5xx
  after a mutation is ambiguous — the server may already have applied it.
  `PUT`/`DELETE` opt back in via `retryMutationMethods: true` or
  `retryPolicy.retryableMethods`; `POST`/`PATCH` are excluded from both layers
  and cannot be opted in. Do not "fix" this back to retrying mutations.
- **Generated response types must match the live wire, not just the official spec.**
  The GOCLMCP generator resolves schema-name collisions *first-writer-wins*, so a thin
  hand-authored schema in `clockify-api-probe-lab/openapi.yaml` shadows richer fragments
  and silently drops live fields. This dropped `Client.ccEmails`/`currencyId`, broke the
  `SharedReport` response shape (it used `public`/`url`; the wire is `isPublic`/`link`),
  and dropped `Webhook.deliveryEnabled`/`planEnabled`. The same `SharedReport` mismatch
  made the CLI/MCP `--public`/`public` a silent no-op (the wire field is `isPublic`).
  The same race hit `ExpenseHydratedDtoV1` (fixed 2026-07-29): the `realOPENAPI`
  fragment defines it as a bare `allOf: [ExpenseDtoV1]`, and because `real-openapi`
  outranks `aiii-openapi` in `SOURCE_PRIORITIES` that stub won the name while the
  richer AIII definition was renamed away by `merge_components`. It dropped 16 live
  paths from the workspace-expenses list *and* declared three flat ids the list wire
  never returns. **The lesson beyond the fix: check which schema the operation
  actually resolves to.** `getWorkspaceExpenses` goes
  `WorkspaceExpensesDtoV1 → ExpensesWithCountDtoV1 → ExpenseHydratedDtoV1`, not
  `ExpenseDtoV1` — and `getExpenseById` DOES return the flat ids with no expanded
  objects, so the two operations have genuinely different shapes and one schema
  cannot mirror both.
  When adding or auditing a schema, diff the generated type against the **live wire**.
  `make spec-sync-drift` (perfect-full only; skips if `../GOCLMCP` absent) now guards that
  `spec/corrected` stays byte-identical to the GOCLMCP canonical — no other gate compared
  the two.
- **`make live-differential` currently has zero open `knownDrift` records**
  (both were closed 2026-07-29). It is credentialed and NOT in any aggregate;
  run it with `CLOCKIFY_LIVE_WORKSPACE_CONFIRM="$CLOCKIFY_WORKSPACE_ID"`. It fails
  BOTH ways: on new drift, and when a recorded record stops reproducing — so after
  fixing one upstream you must remove its entry. Over-declaration is warn-only, so
  read the receipt's `schemaOnlyCount` too; a widened schema that now claims fields
  the wire never sends will not red the gate.
- Not every documented operation is live. Some routes return HTTP 404
  ("No static resource") and are deferred, not shipped as tools
  (`scheduling.calculateUsersTotals`, `projects.archive` — archiving is done via
  project update). Probe a write route's existence with a fake-id request (404
  vs 405) before adding a tool; record dead endpoints in
  `spec/evidence/discrepancies.md`.
- **Probe the live wire before promoting/paginating.** The corrected spec's
  `x-clockify-live-status: live-success` count is evidence-gated: **135/163**,
  each op promoted only by a real sandbox probe that finished `Leftovers:0`.
  `make docs-counts` derives that headline from the spec itself, so a
  re-snapshot that moves it reds the gate until the prose is updated. The
  promotion history is not repeated here — per-op wire facts, the evidence for
  every promotion, and the reasoning behind each quarantine live in
  `spec/evidence/discrepancies.md`; AGENTS.md §8 → *Live-success coverage*
  carries the one-sentence summary. Before adding a list op to GOCLMCP's
  `PAGINATED_LIST_OPS`, confirm the live wire honors `page`/`page-size`: expenses
  and invoices DO (added); the **webhooks list IGNORES them** (non-paginated
  envelope — left out on purpose). Creating a time-off request is policy-unit
  dependent: a DAYS-unit policy wants `period:{start,days}` (a `start`/`end` span
  400s "number of days is not allowed"), an HOURS-unit policy wants
  `period:{start,end}` (RFC3339, non-millisecond). The submit tool + CLI now make
  `end` optional and require one of `{end, days}` (see
  `time-off.submit.period-shape-is-policy-type-dependent`). A REJECTED time-off
  request is terminal (no API delete path), so live status-PATCH probes leave a
  residue. `changeTimeOffRequestStatus`'s `note` is live-verified OPTIONAL and, as
  of 2026-06-21, the generated type marks it `note?` (GOCLMCP
  `apply_live_overrides!` drops it from `required[]`), so the tool binds the clean
  body-envelope form — the `wireBody<T>()` escape was dropped.
