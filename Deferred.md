# Deferred Items — Implementation Plan

Both repos are green and pushed. `clockify-ts-sdk` is at the current `main` HEAD
(`c1029d8`, 46/184 live-success in the corrected-OpenAPI snapshot, 92 public SDK
names, 26 subpaths, 58 CLI commands, 134 MCP tools). The canonical generator repo
`../GOCLMCP` is at v0.4.5. Every item that was actually actionable for the 10/10
push is done. This file is the single source of truth for what remains deliberately
deferred: structural ceilings, generator-gap WONTFIX cases, and live-key-gated
campaigns. Each item below has a real plan to close it — including the honest cases
where "closing it" means an upstream GOCLMCP spec PR, a rotating sandbox key, or a
documented decision not to chase a zero-value kill.

## Status legend

- **STRUCTURAL-CEILING** — the surface is correct; the residual is a budget/score
  floor that only moves with real, bounded follow-up work.
- **WONTFIX-WITH-RATIONALE** — investigated, left as-is on purpose; closing it would
  assert an implementation accident, regress behavior, or 404.
- **NEEDS-LIVE-KEY** — blocked on a fresh sacrificial-sandbox Clockify key (keys
  rotate); no progress possible without one.
- **GENERATOR-CHANGE** — only closeable by editing the GOCLMCP OpenAPI generator and
  re-snapshotting `spec/corrected/clockify.corrected.openapi.yaml`; out of scope for
  an in-repo `clockify-ts-sdk` change (the snapshot is a hard-stop no-hand-edit file).

---

## 1. Kill the generator-forced `as never` request-body casts (type-safety ceiling)

Status: **STRUCTURAL-CEILING** (reducible subset) + **GENERATOR-CHANGE** (irreducible subset).

### What & why it's deferred

The deferred title is partly stale. The generator already emits a body-envelope
union arm (`X = XFlattened | XBodyEnvelope`) for every operation with a request body,
and `wrapper/requests.ts` already exports `ClockifyRequestBody<T>` plus a typed
`wireBody<T>()` escape hatch. The unannotated-cast budget is already ratcheted to 0
(`docs/consumer-cast-budget-contract.json` `allowedRequestCastBudget: 0`), so there
is no type-safety hole today: every residual cast is a documented `KEEP as never`.

This item is therefore not "fix a leak" but "convert ~26 documented KEEP casts into
real typed bindings." About half are reducible in-repo with zero codegen change; the
rest are irreducible without an upstream GOCLMCP spec-shape change, and a few are
genuinely WONTFIX. The plan is the reducible subset now, the rest recorded as
WONTFIX-by-spec-gap.

### Where it lives

- Budget gate: `scripts/check-consumer-cast-budget.mjs` (counts unannotated `as never`
  in `cli/src` + `mcp/src`; budget from `docs/consumer-cast-budget-contract.json`,
  currently `0`; `result.ts`/`output-schema.ts` exempt by suffix). Make target
  `consumer-cast-budget` (Makefile:488). It does not count `KEEP`-annotated casts, so
  converting them is a quality improvement the gate neither forces nor rewards.
- Request-shape codegen: `scripts/generate-sdk-from-openapi.mjs` —
  `requestTypeSource()` (line 649) emits the `XFlattened | XBodyEnvelope` union plus
  `XBody` (lines 654–659); `operationSpecSource()` (line 675) emits the runtime body
  assembly `body: core.bodyFromRequest(request as unknown as Record<string,unknown>,
  [bodyKeys])` (line 688) accepting either arm.
- Runtime envelope handling: `wrapper/src/core/request.ts:224` `bodyFromRequest()` —
  if the source has a `body` key not in the whitelist, returns `source.body` verbatim
  (envelope arm); otherwise `pickDefined` (flattened arm). Both arms work.
- Helpers: `wrapper/requests.ts` — `ClockifyRequestBody<T>` (line 23), `wireBody<T>()`
  (line 32), exported via the `clockify-sdk-ts-115/requests` subpath
  (`wrapper/package.json:260`).

### Three buckets (root cause per site)

**Bucket A — REDUCIBLE: consumer builds an untyped `Record<string,unknown>` body and
never binds the typed arm.** The envelope arm already exists and is wire-correct; the
cast is pure typing laziness.
- `mcp/src/tools/entries.ts:212-217` — passes `{ workspaceId, timeEntryId, body }`,
  which is exactly `UpdateTimeEntriesRequestBodyEnvelope`
  (`wrapper/src/api/resources/timeEntries/client/requests/UpdateTimeEntriesRequest.ts:23-41`).
  Cast only because `body` is declared `Record<string, unknown>` (line 205) instead of
  `ClockifyRequestBody<UpdateTimeEntriesRequest>`.
- `mcp/src/tools/timeOff.ts:436-440` (`timeOffPolicies.create`) — spreads `...body`
  flat into the envelope; `CreateTimeOffPolicyRequestFlattened` carries all those
  fields, so a typed `body` satisfies the flattened arm without a cast.
- `mcp/src/tools/invoices.ts:126-131` (`invoices.update` rebuilt from live GET) — same
  pattern; bind the envelope `body` to the typed `UpdateInvoiceRequestBody`.
- Likely also reducible: `mcp/src/tools/timeOff.ts:541`, `:572`;
  `mcp/src/tools/expenses.ts:188`, `:238` (multipart — verify); `mcp/src/tools/users.ts:236`;
  `cli/src/commands/users.ts:77`; `cli/src/commands/expenses.ts:154`.

**Bucket B — REDUCIBLE: scalar/shape mismatch the typed arm already expresses.**
- `mcp/src/tools/workflows/resolve.ts:570-579` (`timeOffPolicies.list`) — passes
  `page: 1` (number) but `ListTimeOffPoliciesRequest.page` is typed `string`
  (`page-size` stays numeric). Cast vanishes by passing `page: "1"`. Pure coercion bug.

**Bucket C — IRREDUCIBLE in-repo (upstream GOCLMCP spec-shape gap) / WONTFIX.** The
generated request/response type genuinely cannot express the live wire shape because
the OpenAPI snapshot under-specifies the operation. Only a spec edit in
`../GOCLMCP/scripts/gen-clockify-openapi` + re-snapshot fixes these.
- `mcp/src/tools/invoices.ts:43` (`invoices.list`) — `ListInvoicesRequest` is
  `{ workspaceId }` only, but the live API accepts a `statuses` filter and returns an
  `{ invoices, total }` envelope the generated response type doesn't model. Gap on
  both request query param and response.
- `mcp/src/tools/workflows/resolve.ts:560-567` (`expenseCategories.list`) —
  `ListExpenseCategoriesRequest` is `{ workspaceId }` only; live accepts `page`/`page-size`
  pagination the spec omits.
- Response-envelope reads (trailing `as { ... }` after the call):
  `cli/src/commands/webhooks.ts:29`, `cli/src/commands/expenses.ts:71`,
  `cli/src/commands/timeoff.ts:59`, `mcp/src/tools/invoices.ts:43`,
  `mcp/src/tools/timeOff.ts:149`, `mcp/src/tools/workflows/review.ts:33` — cast the
  response because the generated response type is `unknown`/wrong-shape. Irreducible
  without spec response-schema work; even then a runtime `as` narrow is reasonable.
- `mcp/src/tools/invoices.ts:365` (import-time filter), `:275` (status PATCH body),
  `mcp/src/tools/timeOff.ts:266` (`changeTimeOffRequestStatus` status/note mismatch) —
  each KEEP names a specific generated-narrowness bug needing a spec field added
  upstream, not a consumer typing change.

### What killing Bucket C requires (upstream, out of in-repo scope)

For each Bucket-C operation the GOCLMCP Ruby generator must add the missing
`parameters` (e.g. `statuses` on list-invoices; `page`/`page-size` on
list-expense-categories) and the missing response `schema` (e.g. the `{invoices,
total}` envelope), then re-emit the spec and refresh
`spec/corrected/clockify.corrected.openapi.yaml` + re-run `make sdk-codegen`. That is a
GOCLMCP PR gated by `make perfect-full`'s `goclmcp-drift` + `sdk-codegen-drift`, not a
`clockify-ts-sdk` change.

### Detailed implementation plan (in-repo, Bucket A + B only)

1. `make sdk-codegen` first (`output/ts-sdk` + `wrapper/src` are gitignored; required
   before any type-check).
2. For each Bucket-A site, replace the untyped `Record<string, unknown>` body +
   trailing `as never` with a typed binding. Exemplar (`mcp/src/tools/entries.ts`):
   - Import `ClockifyRequestBody` and `UpdateTimeEntriesRequest` from
     `clockify-sdk-ts-115/requests`.
   - Change `const body: Record<string, unknown> = { start: args.start };` to
     `const body: ClockifyRequestBody<UpdateTimeEntriesRequest> = { start: args.start };`.
   - Change the call from `{ workspaceId, timeEntryId, body } as never` to
     `{ workspaceId, timeEntryId, body } satisfies UpdateTimeEntriesRequest` (drop the cast).
   - Incremental `if (...) body.foo = ...` assignments stay valid (fields optional).
3. For Bucket B (`resolve.ts:570-579`), change `page: 1` to `page: "1"`, bind
   `ListTimeOffPoliciesRequest` directly, drop the cast. Verify `"page-size"` quoting survives.
4. Leave every Bucket-C site as a `KEEP as never`, tighten the comment to cite the
   exact spec gap, and add a `TODO(GOCLMCP): add <param/response> to operation <id>`
   so the WONTFIX reason is auditable. Optionally move body (not response) narrows to
   the typed `wireBody<T>()`; response narrows stay plain `as { ... }`.
5. Only if you want regrowth protection: extend
   `docs/consumer-cast-budget-contract.json` with an `allowedKeepCastBudget` and ratchet.
   The current gate ignores KEEP casts. This is a contract change — bump `schemaVersion`,
   update the checker, and edit the file in lockstep (the checker self-tests its
   annotation regex at lines 28-31).

### Verification

```bash
make sdk-codegen
make consumer-cast-budget                 # stays green (budget 0 unannotated)
npm run type-check -w @clockify115/cli
npm run type-check -w @clockify115/mcp-server
npm test -w @clockify115/cli && npm test -w @clockify115/mcp-server
npm run lint -w @clockify115/mcp-server   # eslint only runs here / in perfect-fast
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast   # final solo proof
```

Runtime is unchanged (both arms route through `bodyFromRequest` identically), so the
existing MCP/CLI suites are the regression net; no new fixtures.

### Effort & risk

Reducible subset (Buckets A+B, ~10-14 sites): about half a day, mechanical, behavior-
neutral. Add ~1-2h if you also extend the cast-budget contract to track KEEP casts.
Bucket C is a separate, larger GOCLMCP effort, not estimable here. Risk: low for A+B
(type-only). Traps: `make sdk-codegen` must run first or type-checks fail spuriously;
the final `perfect-fast` must run SOLO with blanked creds (load-sensitive startup
budgets); the cast-budget gate won't catch a botched conversion (rely on type-check +
tests). Do not attempt Bucket C in this repo — editing `spec/corrected/**` or
`wrapper/src/**` is a hard-stop.

### Honest ceiling note

There is no live type-safety hole today; the work converts documented KEEP casts to
typed bindings. Only ~half are closeable without an upstream spec PR. Buys cleaner,
self-documenting consumer code and a smaller KEEP-cast surface — not a behavior or
correctness change.

---

## 2. Live-capture campaign: promote probe-documented ops to live-success (correctness ceiling)

Status: **NEEDS-LIVE-KEY** + **STRUCTURAL-CEILING** (diminishing returns; some ops are permanently gated).

### What & why it's deferred

The canonical spec `GOCLMCP/docs/openapi/clockify-openapi.yaml` stamps every operation
with an `x-clockify-live-status` evidence tier. Current snapshot (grepped on the live file):

| Tier | Count | Meaning |
|---|---|---|
| `live-success` | 46 | A real 2xx was captured against the sacrificial workspace; shape verified against the typed Go model. |
| `probe-documented` | 124 | Path/shape from probe-lab evidence + upstream OpenAPI, but no live 2xx ever captured. |
| `documented` | 14 | Documentation-only; no probe fixture. |
| **Total** | **184** | |

So the real ratio is 46/184 live-success with 124 probe-documented (the brief's "138
probe-documented" is the non-live total: 124 probe + 14 documented). Probe-documented
ops have plausible-but-unconfirmed response schemas, so their typed models and MCP
receipts are the least-trustworthy surface. Each promotion is a real-response
schema-diff that either confirms the model or surfaces an unknown field
(`assertNoUnknownFields`, `GOCLMCP/tests/e2e_live_schema_test.go:950`).

### Where it lives (the promotion mechanism — already wired)

The pipeline is built; the campaign is "exercise more ops through it," not "build infra."

1. **Capture.** A live test calls `logFindingsRow(t, method, host, templatePath, status,
   fixture)` (`tests/e2e_live_schema_test.go:752`), emitting a copy-pasteable markdown row.
2. **Record.** Paste that row into the matching
   `docs/openapi/sources/clockify-api-probe-lab/findings/<domain>.md` table (5-cell
   `| Method | Host | Path | Status | Fixture |`; see `findings/clients.md:13-19`).
3. **Parse.** `discover_findings` (`scripts/gen-clockify-openapi:560`) reads every
   `findings/*.md`, skips `TODO-live` scaffold rows (`pending_live_finding_row?`, ~555),
   computes a bucket via `status_bucket` (line 427): any 2xx → `live-success`.
4. **Promote.** `choose_live_status` (line 1660) takes the max-evidence bucket;
   `live-success` wins. `make gen-openapi` (Makefile:71) regenerates the YAML.
5. **Gate.** `make openapi-drift` (Makefile:74) re-runs the generator and diffs.

The delete-status capture pattern is `cleanupDeleteRaw`
(`e2e_live_schema_test.go:698-711`): it now captures the teardown DELETE status and,
given `findingsDelete{templatePath,fixture}` metadata, emits a promotable row — the
template to mirror for every op group.

### The -v auditability fix (do this FIRST — it is the real blocker)

`logFindingsRow` uses `t.Logf` (`e2e_live_schema_test.go:752-755`). `go test` only
prints `t.Log` output with `-v` or on failure. The `live-contract-local` target
(`Makefile:148-157`) runs `go test ... ./tests/...` without `-v`, so on a green run the
captured rows are silently swallowed and the operator has nothing to paste. This is why
the campaign stalls even after a successful run.

Fix (pick one):
- Minimal: add `-v` to the `go test -tags=livee2e` invocations (Makefile:148 and 154),
  then `make live-contract-local 2>&1 | tee live-run.log` and
  `grep -E '^\| (GET|POST|PUT|PATCH|DELETE) \|' live-run.log` to harvest rows.
- Better: have `logFindingsRow` also append to a deterministic file
  (`CLOCKIFY_LIVE_FINDINGS_OUT`) so capture survives without `-v` and is diffable. Keep
  the `t.Logf` for inline visibility.

Document the grep in `docs/live-tests.md` ("What To Run" section, after line 80).

### Detailed implementation plan (batches, hot-ops-first)

- **Batch 1 — read-side promotions, no new calls.** Add `logFindingsRow` to the 10 GET
  subtests in `TestLiveRawClockifyWriteSideSchemaDiff` (`e2e_live_schema_test.go:173-307`)
  plus the read-side test GETs (current user, workspaces, projects/clients/tags/tasks/
  time-entries lists). `liveGetRaw` returns only `error`, not status — switch those probes
  to `liveJSONRaw`/`liveJSONAtBase` (which return `(int, error)`, line 587) and emit the
  row. ~15-20 ops promoted. Lowest risk.
- **Batch 2 — read singletons needing a GET probe.** `getInvoiceSettings`,
  `getWorkspaceInvoices`, `getMemberProfile/{userId}`, `findWorkspaceUsers`,
  `findUserTeamManagers`, `getApprovalRequests`, `getBalancesForPolicy`,
  `getBalanceForUser`, `getTimeOffPolicy`, `getUserCapacityTotal`,
  `getAllSchedulingAssignments`, `findAllGroupsOnWorkspace` + `/users`,
  `listProjectCustomFields`, `.../webhooks/{webhookId}/logs`. Each a single GET; many
  already have a subtest body missing only the row emit. ~30 read ops total after this.
- **Batch 3 — write/delete on already-exercised CRUD domains.** Pass `findingsDelete`
  metadata into the existing `cleanup*Raw` calls for projects/tags/tasks/time-entries
  (mirror the clients DELETE promoted 2026-06-20). ~5 destructive ops.
- **Batch 4 — rarer-domain write happy paths** (invoices create/finalize, expenses
  multipart create, scheduling assignment create, time-off policy/request create,
  user-group create + add-member, custom-field create, webhook create). Each needs a new
  mutate+capture+teardown subtest under `CLOCKIFY_LIVE_HAPPY_PATH_CAMPAIGNS`. Highest
  effort, real blast radius. Many (invoice finalize, payments, exports) are paid-plan /
  permission-gated and will land as `permission-gated`, not `live-success`, even when run
  — that is correct, not a failure. Stop here unless a consumer actually needs that
  domain's typed shape.

By-domain probe-documented counts: invoices 16, projects 13, scheduling 13, time-off 13,
users 10, expenses 8, user-groups 8, policies 6, webhooks 6, user 5, workspace 4,
approval-requests 4, custom-fields 3, member-profile 3, shared-reports 3, time-entries 3,
plus singletons. 121/124 are on `api.clockify.me/api/v1`; only 3 on `reports.api.clockify.me`.

Harness extensions mirror the delete-status capture: read-side row emit (Batch 1/2),
teardown row emit via `findingsDelete` (Batch 3), and new `t.Run` mutate subtests under
`requireLiveWriteShapeGate` with `assertNoUnknownFields` + `t.Cleanup` teardown (Batch 4;
the reports subtest at `e2e_live_schema_test.go:502-567` is the non-default-host template).

### Safe run procedure (sacrificial workspace, prefix, cleanup, confirm gates)

```sh
export CLOCKIFY_API_KEY='<sacrificial sandbox key>'      # ROTATES — preflight /api/v1/user first
export CLOCKIFY_WORKSPACE_ID='<sacrificial ws id>'
export CLOCKIFY_RUN_LIVE_E2E=1
export CLOCKIFY_LIVE_PREFIX="MCP-LIVE-$(date +%Y%m%d)"   # unique per run, used by cleanup sweep
# Batch 3/4 (mutating write-shape oracle) only:
export CLOCKIFY_LIVE_HAPPY_PATH_CAMPAIGNS=1
export CLOCKIFY_LIVE_WORKSPACE_CONFIRM="$CLOCKIFY_WORKSPACE_ID"   # must equal ws id (requireLiveWriteShapeGate:570)
export CLOCKIFY_LIVE_OPTIONAL_DOMAINS=1                  # broad domain campaign (Makefile:152)
# Some rarer domains also need CLOCKIFY_LIVE_ADMIN_ENABLED / _BILLING_ENABLED / _SETTINGS_ENABLED.
```

Run from GOCLMCP root so env is inherited:

```sh
make live-contract-local 2>&1 | tee /tmp/live-run.log          # after the -v fix
grep -E '^\| (GET|POST|PUT|PATCH|DELETE) \|' /tmp/live-run.log  # harvest promotable rows
make live-clean-prefix                                          # MANDATORY teardown sweep
```

Cleanup is twofold: per-test `t.Cleanup` archives-then-deletes each created object
(`cleanup*Raw`, lines 633-679, archive-first because deleting an ACTIVE project/client
400s), and `make live-clean-prefix` (Makefile:163) sweeps anything whose name starts
with `CLOCKIFY_LIVE_PREFIX` (also requires `CLOCKIFY_LIVE_WORKSPACE_CONFIRM`).
`perfect-live` (Makefile:189) = `live-contract-local` + `live-clean-prefix`. Never point
at a personal/production workspace; do not defeat `redactLiveText` (line 925).

### Verification (per batch)

```sh
make gen-openapi        # regenerate clockify-openapi.yaml with new live-success stamps
make openapi-drift      # MUST be green: committed YAML == regen output (Makefile:74)
make perfect-local      # full deterministic gate set (Makefile:182)
```

A promotion flips counts that `coverage-dashboard-drift` and the live-tests selfinspect
asset track — expect to regen those too (`make sync-selfinspect-assets` if
`selfinspect-drift` complains, Makefile:100-108).

### Sync to the SDK (clockify-ts-sdk)

GOCLMCP is canonical; the SDK consumes a frozen snapshot.
1. `spec/corrected/clockify.corrected.openapi.yaml` snapshots GOCLMCP's
   `docs/openapi/clockify-openapi.yaml` (hand-copied, not auto-pulled).
2. `make goclmcp-drift` confirms the upstream is self-consistent before trusting its spec.
3. Copy the regenerated YAML into the snapshot (the one allowed write to that path — a
   refresh-from-canonical, not a hand-author).
4. `make sdk-codegen` then `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`
   (run SOLO).
5. Live-status changes mostly affect provenance/notes, not method signatures, so SDK
   regen is usually a typed-surface no-op UNLESS a promotion surfaced an unknown field —
   then both the Go and regenerated TS models change (the high-value correctness win).
   `make generator-comparison` cross-checks stamps vs generated TS methods.

### Effort & risk

Effort: large overall, front-loaded value. The -v fix ~30 min. Batch 1 ~2-3h code + one
live run. Batch 2 ~half a day + one live run. Batch 3 ~1-2h. Batch 4 open-ended (~0.5-1
day per domain, mostly permission-gated, low payoff). Realistic high-value scope (fix +
Batch 1+2+3, ~50 ops toward live-success) ~2-3 focused days plus live-key availability.

Risk: medium-high operationally, low-medium structurally. The infra is proven (clients
full CRUD incl. DELETE promoted 2026-06-20). Real risks: every batch needs real mutating
calls against a live workspace (wrong workspace is destructive — mitigated by the
`CONFIRM == ws-id` gate, unique prefix, archive-first cleanup, and the mandatory sweep,
but operator discipline is load-bearing); the campaign is hard-blocked on a rotating
key; the -v swallow bug means a "successful" run can produce zero harvestable rows (fix
first); a surfaced unknown field forces a typed-model change in both GOCLMCP and the SDK,
cascading through `openapi-drift`, `generator-comparison`, and `perfect-fast`. Read
batches are genuinely low-risk (GET-only); risk concentrates in write/delete batches.

### Honest ceiling note

The read tier (30 ops) is cheap and worth completing — that alone reaches ~76/184 and
covers every op an MCP/SDK consumer actually reads. Past that, write/destructive
promotions on rarely-used domains are real-blast-radius mutations almost no consumer
depends on. Several probe-documented ops will never become `live-success` and that is
correct: paid-plan/permission ops resolve to `permission-gated`, workspace-state ops to
`workspace-state-limited`, phantom routes are quarantined (`PHANTOM_PATHS`,
gen-clockify-openapi ~580: `/scheduling/capacity`, `/balance`). The 14 `documented` ops
plus these gated buckets are the structural floor. Do not pursue 100% live-success.

---

## 3. Surviving / equivalent mutants in the mutation suite (testing ceiling)

Status: mostly **WONTFIX-WITH-RATIONALE**; a small named subset is **STRUCTURAL-CEILING** (genuinely killable).

### What & why it's deferred

Floors live in `docs/mutation-score-contract.json` (monotonic-up ratchet, enforced by
`scripts/check-mutation-score.mjs` / `make mutation`). Stryker mutates only the
hand-written wrapper/MCP modules; generated `wrapper/src/**` is excluded. Current per-file
state vs floor (all PASS, verified 2026-06-20):

| File | Floor | Score (covered) | Killed/Survived/NoCov |
|---|---|---|---|
| `wrapper/composed-fetch.ts` | 82 | 84.1 | 254 / 48 / 51 |
| `wrapper/dates.ts` | 84 | 86.9 | 279 / 42 / 6 |
| `wrapper/errors.ts` | 80 | 82.0 | 309 / 68 / 1 |
| `wrapper/iter.ts` | 95 | 97.5 | 78 / 2 / 0 |
| `wrapper/money.ts` | 98 | 100.0 | 12 / 0 / 0 |
| `wrapper/webhook-url.ts` | 80 | 81.8 | 266 / 59 / 18 |
| `mcp/.../confirmation.ts` | 77 | 77.0 | 47 / 12 / 2 |
| `mcp/.../confirm-guard.ts` | 70 | 72.9 | 35 / 13 / 0 |
| `mcp/src/result.ts` | 68 | 69.9 | 72 / 30 / 1 |

`composed-fetch.ts` and `webhook-url.ts` carry large NoCoverage buckets (51 and 18).
NoCoverage is not equivalence — those are real coverage gaps tracked separately (the
reason `scoreAll` 72.0/77.6 trails `score(covered)`), not the equivalent-mutant problem.

### Where the equivalent survivors live (WONTFIX, with the precise reason)

- **A1 `errors.ts` L81-84 — conditional spreads** (`...(opts.x !== undefined ? {x} : {})`).
  Four `ConditionalExpression→true` survivors. The built options object is passed to the
  base `ClockifyApiError` constructor which assigns `this.statusCode = opts.statusCode`
  unconditionally, so `{statusCode: undefined}` and `{}` produce an identical instance.
  Killing it would require asserting `Object.hasOwn(err, "statusCode") === false`, which
  the SDK contract does not promise. Equivalent.
- **A2 `composed-fetch.ts` timing arithmetic** — `Date.now() - start` → `+ start`
  (L351/356/388, and L404/427 `attempt - 1`). `durationMs` feeds only spied observability
  hooks; elapsed wall-time is ~0ms in test, so both forms are "some non-negative number"
  no assertion constrains. Killing it needs a flaky duration band asserting the clock.
  Equivalent under any deterministic test.
- **A3 deep always-true defensive conditionals** — `dates.ts` L195/L221 quarter-rollover
  guards (dead per-quarter by construction), `webhook-url.ts` L106-195 IPv6 fine-grained
  bounds (most collapse to the same outer accept/reject verdict), `errors.ts`
  L124/137/147/157/192/236/269 `Error.captureStackTrace ?` guards (`→true` equivalent on
  Node). A subset is killable (B2/B3/B4).
- **A4 `iter.ts` L205/L219** — terminator guards in 100%-covered loops where the other
  exit condition makes the outcome identical. Already 97.5 vs floor 95. Marginal.
- **A5 MCP `result.ts` / `confirm-guard.ts` `ObjectLiteral→{}` / string survivors** —
  mutate optional receipt fields (`changed`, `warnings`, `next`) to empties; the
  receipt-shape tests assert presence/structure, not exact prose. Pinning every string
  over-fits tests to copy.

### Detailed implementation plan (killable subset only)

- **B1 `dates.ts` L33-37 month-name string literals.** `wrapper/tests/dates.test.ts`
  skips August/October/November/December. `parseMonthNameDay` does
  `MONTHS.findIndex(name => name === word || name.startsWith(word))`, so `"august"→""`
  breaks the match. Add cases parsing `"August 15"`, `"October 3"`, `"November 9"`,
  `"December 25"` (and weekday `"saturday"` for the L22 array). ~6 assertions.
- **B3 `dates.ts` quarter-rollover.** Freeze the clock to a Q1 date (`vi.setSystemTime`)
  so `qm < 0` is live, assert the returned `last_quarter`/`next_quarter` range crosses the
  year boundary; repeat for a Q4 date. ~4 assertions across 2 frozen clocks. Cross-quarter
  dead branches stay equivalent — accept those.
- **B4 `webhook-url.ts` IPv6 bound checks that change the verdict.** A subset (L189
  `first < 0xfebf` link-local; L161 `missing <= 0` `::` expansion) flips accept↔reject.
  Add fixtures: link-local `[fe80::1]` (must reject) and a malformed `::`-overflow address.
  ~3 fixtures. The rest of the IPv6 internals stay equivalent.
- **B2 (optional) `errors.ts` `captureStackTrace` `→false` companions.** Assert the thrown
  subclass `.stack` does not include the constructor frame. Moderate value, slightly
  brittle on stack format.
- **B5 (optional, insurance) `confirmation.ts` token-store survivors.** This file sits
  exactly at floor 77.0 with zero headroom, so any future edit risks a red gate. Mint a
  token, advance a fake clock past TTL, assert rejection — kills the two expiry-comparison
  survivors and buys headroom on a safety-critical guard.

After landing B1+B3+B4, ratchet the affected floors up in
`docs/mutation-score-contract.json` (dates.ts 84→~88, webhook-url.ts 80→~83) to lock the
gain — the contract is monotonic-up by design.

### Verification

```bash
cd wrapper && npx stryker run            # regenerates reports/mutation/mutation.json
node scripts/check-mutation-score.mjs    # or: make mutation (from repo root)
# Confirm targeted mutants flipped to Killed, e.g. dates.ts lines 33-37:
node -e 'const r=require("./wrapper/reports/mutation/mutation.json");
  for(const m of r.files["wrapper/dates.ts"].mutants)
    if([33,34,35,36,37].includes(m.location.start.line)) console.log(m.location.start.line,m.status);'
make mutation                            # prove the raised floors still pass
```

### Effort & risk

Effort: low. The equivalent analysis is WONTFIX (no code). B1+B3+B4 is ~1-2h (~12-15 short
assertions in `wrapper/tests/dates.test.ts` and the webhook-url test, re-run stryker, then
one-line floor bumps). B2/B5 add ~30 min. Risk: low; test-and-config only, never touches
generated `wrapper/src/**` or the spec. Main risk is over-chasing — most survivors are
genuinely equivalent and forcing kills would assert implementation accidents (own-property
absence, exact `Date.now()` deltas, dead quarter branches, exact receipt prose). Floors are
monotonic-up, so only ratchet after a stryker re-run confirms the targets are Killed.

### Honest ceiling note

The bulk of the survivor delta is structurally equivalent. The killable handful is real
coverage where one short assertion each kills a mutant and documents behavior; everything
else is accept-with-rationale. Separately, the larger latent test-debt is the NoCoverage
buckets (composed-fetch 51, webhook-url 18), not equivalence — that is where `scoreAll`
points live if anyone wants to move them.

---

## 4. Cross-repo deferred loose ends

Status: mixed — one **STRUCTURAL-CEILING** lead item (4a), and **WONTFIX-WITH-RATIONALE** /
**GENERATOR-CHANGE** / **NEEDS-LIVE-KEY** parked items.

### 4a. GOCLMCP projects-list GET left at `TODO-live-2xx` — REAL, mechanically closeable

**What.** Every Clockify list GET except projects was promoted from `TODO-live-2xx` to live
`200`. The projects-list row alone was skipped — a clerical omission, not a technical block.

**Where.**
- `GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/findings/projects.md:12` still reads
  `TODO-live-2xx`; sibling `clients.md:13`/`tags.md`/`tasks.md`/`time-entries.md` all read `200`.
- `GOCLMCP/docs/openapi/clockify-openapi.yaml`: `getWorkspacesWorkspaceIdClients` (line 1179)
  carries `x-clockify-live-status: live-success` (line 1256), but `getWorkspaceProjects`
  (line 4813) has no live-status stamp (defaults to `probe-documented`).
- The same test already validates the projects list: `tests/e2e_live_schema_test.go:71-75`
  (`TestLiveRawClockifyReadSideSchemaDiff` GETs `…/projects` and runs
  `assertNoUnknownFields[clockify.Project]`). List GETs are not auto-logged (`logFindingsRow`
  fires only for create/update/get/delete). Commit `77bd2a7` promoted the other four lists
  ("37 to 41") and omitted projects.

**Plan.**
1. Re-run `cd GOCLMCP && CLOCKIFY_RUN_LIVE_E2E=1 CLOCKIFY_LIVE_PREFIX=<prefix> go test ./tests
   -run TestLiveRawClockifyReadSideSchemaDiff -v` with valid sandbox creds; confirm the
   projects-list 2xx body still decodes into `clockify.Project` with no unknown fields.
2. Promote in two files together (mirror `77bd2a7`'s diff shape): `findings/projects.md:12`
   `TODO-live-2xx` → `200` (update the prose header like the siblings), and add
   `x-clockify-live-status: live-success` to the `getWorkspaceProjects` block (~line 4813,
   matching the clients placement at 1256).
3. Optional hardening: add `logFindingsRow(t, GET, host, "/workspaces/{workspaceId}/projects",
   200, "fixtures/live-shape/projects-list.json")` after line 75 (and the analogous lines for
   the other lists) so future list promotions are copy-pasteable.
4. Verify: `go test ./tests -run TestGeneratedOpenAPIIgnoresPendingLiveFindingRows`
   (`tests/doc_parity_test.go:261`) + the doc-parity suite, then the SDK-side
   `make perfect-full` GOCLMCP-drift gate.

Effort: S (2 files + 1 live re-run). Risk: low — already live-schema-validated by the same
test on the same run; reversible, guarded by `doc_parity_test.go:261` and the perfect-full
drift gate. Ceiling note: buys one more accurate `live-success` stamp and closes a known
clerical gap; no behavior change.

### 4b. vitest major-version skew: wrapper on 4.x, cli+mcp on 2.x — latent consistency item

**What.** `wrapper/package.json` pins `vitest ^4.1.4` / `@vitest/coverage-v8 ^4.1.9`; `cli`
and `mcp` both pin `vitest ^2.1.0` / coverage `^2.1.9`. Installed: wrapper resolves `4.1.9`
(nested), cli+mcp resolve `2.1.9` (hoisted). The major split forces a duplicate vitest tree
in the single workspace install. Not a correctness blocker — each suite passes under its own
runner — but a maintenance/DX smell, and coverage-reporter behavior can differ across majors.

**Plan.** Bump cli + mcp to `vitest ^4` + `@vitest/coverage-v8 ^4`, `npm ci` at root, then
per-package `npm test` and `npm run test -- --coverage`. If the v8-reporter v4 shifts measured
lines/branches, re-pin thresholds in each `vitest.config.ts` AND `docs/coverage-contract.json`
in lockstep (dual-authority with `scripts/check-coverage-floor.mjs`). Then a full solo
`make perfect-fast` plus `make changelog-drift`. Effort: S-M (risk is entirely in
coverage-threshold re-calibration). Risk: medium (threshold drift; re-pin in lockstep).

### 4c. time-off `note`-required branch — genuinely probe-deferred (NEEDS-LIVE-KEY)

**What.** `spec/evidence/discrepancies.md:2302-2310` (`time-off.change-status.union-and-note`,
status `partial`). The generated `ChangeTimeOffRequestStatus` marks `note` REQUIRED, but
`clockify_time_off_requests_update_status` sets it only when present, with a single `as never`
masking the mismatch. The status-union half was fixed (`z.enum(["APPROVED","REJECTED"])`, test
`mcp/tests/sweep-fixes.test.ts`); only the note branch is left.

**Plan.** In a sacrificial sandbox: create a PENDING time-off request, PATCH status with and
without `note`, record the 4xx-vs-2xx, then either make `note` required in the Zod input or keep
it conditional and drop the `as never`. Record the probe under `probes/` and flip the
discrepancy from `partial` to compensated. Effort: M (live probe + write-safety re-test). Risk:
medium — requires a real time-off mutation. Defensible to keep deferred until a time-off campaign
runs.

### 4d. `scheduling.calculateUsersTotals` + `projects.archive` — WONTFIX (upstream 404)

`spec/evidence/discrepancies.md:336-347`. Both routes return live `404 "No static resource"`.
No TS MCP tool is shipped; parity is carried by `docs/operation-parity-overrides.json:29` and
`docs/operation-parity.md:134`. `projects.archive` is covered via
`clockify_projects_update({archived:true})`. Plan: watch item only — re-probe with a fake-id
(404 vs 405) on each upstream refresh; if it flips to 405/2xx, promote in GOCLMCP first. Effort:
none until upstream changes.

### 4e. `compose.work-package.ensure-repoint` — WONTFIX (documented, do not reopen)

`spec/evidence/discrepancies.md:2252-2262`, status `wontfix` (2026-06-18). Re-pointing
`createWorkPackage` onto `Workspace.ensure*` is a net regression: drops server-side
name/page-size:200/clients filters (breaks `workflows.test.ts:327`), cannot express
`upsert:false` always-create, and cannot carry the per-step `undo` closures `runComposition`
needs (`compose.ts:151`). Listed only so this file is exhaustive. Effort: none.

### 4f. wrapper `noImplicitOverride` / `exactOptionalPropertyTypes` — DOCUMENTED (GENERATOR-CHANGE)

`spec/evidence/discrepancies.md:~2330` (`strictness.wrapper-eopt-noimplicitoverride-blocked`).
wrapper cannot enable these flags because the errors are in generated `wrapper/src/**`
(no-edit hard-stop). Flags stay OFF on wrapper, ON in cli+mcp; rationale pinned in
`wrapper/tsconfig.json` `_blockedStrictnessFlags`; the hand-written surface is EOPT-clean and
enforced by `scripts/check-consumer-cast-budget.mjs`. Durable fix is upstream in GOCLMCP's
generator (emit `override` keywords / EOPT-clean optionals), then regenerate. Effort: M, lives
in GOCLMCP. Keep deferred-to-upstream.

### Non-issues (investigated, discarded)

- **W1 live-log `-v` teardown-status auditability gap — RESOLVED.** `cleanupDeleteRaw`
  (`GOCLMCP/tests/e2e_live_schema_test.go:698`) now captures the DELETE status and emits a
  promotable row via `findingsDelete{templatePath,fixture}`; the projects/clients/tags/tasks/
  time-entries findings files record the real DELETE 200/204 captured 2026-06-20. (Note: this is
  distinct from the separate `-v` swallow on the *make target* covered in Item 2, which is still
  open.) Do not list as deferred.
- **`deferred-list-endpoints.not-paginated-or-not-live`** (`discrepancies.md:972`) — explicitly
  RESOLVED 2026-05-24 by re-probe. Discard.

---

## Sequencing & realism

Recommended order:

1. **Item 1 reducible subset (Buckets A+B) first.** Cleanest win, no live key, no codegen change,
   behavior-neutral, covered by existing tests. It removes ~half the documented KEEP casts and
   makes the consumer surface self-documenting.
2. **Item 3 killable subset (B1+B3+B4) next.** Cheap, low-risk, real coverage, then ratchet the
   two floors. Optionally B5 for headroom on the floor-pinned `confirmation.ts`.
3. **Item 4a opportunistically** — clerical, fully evidenced, rides one read-side live run.
4. **Item 2 only when a fresh sandbox key is in hand, and do the -v make-target fix FIRST.** Then
   Batch 1 + Batch 2 (the read tier, ~30 ops, low risk, high correctness payoff → ~76/184). Treat
   Batch 3 as opportunistic. Defer Batch 4 to on-demand-only, driven by a consumer needing a
   specific domain's verified shape.
5. **Item 4b** as a low-priority consistency cleanup; **4c** only inside a time-off live campaign.
6. **Items 1-Bucket-C, 4d, 4e, 4f** are not in-repo work: Bucket C and 4f are GOCLMCP generator
   PRs, 4d is an upstream-404 watch item, 4e is closed by decision.

What a literal 10/10 would require vs what is worth doing: a literal 10/10 would need every
operation at `live-success` (124 promotions, multi-week, key-gated, with a long tail of
permission/plan-gated ops that can never reach `live-success` and are correctly tiered today),
zero KEEP casts (requires upstream spec params + response schemas added in the GOCLMCP generator,
re-snapshot, re-codegen), and zero surviving mutants (most of which are structurally equivalent,
where a kill would assert an implementation accident and make tests brittle). That literal target
is not worth pursuing. What is worth doing: Item 1 A+B, Item 3 B1/B3/B4 + floor ratchet, Item 4a,
and — given a key — Item 2 read tier (Batches 1-2). That set closes every cheap, real-value gap and
leaves the rest accurately recorded as WONTFIX-with-rationale, upstream-generator, or key-gated
diminishing-returns work.
