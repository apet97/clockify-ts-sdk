# Deferred / structural work — clockify-ts-sdk

This file tracks ONLY deferred and structural work. Everything actionable for
the last push is already done and committed. Both repos are green:
`clockify-ts-sdk` at SDK HEAD **`4323b1b`**, `../GOCLMCP` at **v0.4.5**
(`6f3cd2c`). There is no correctness or type-safety hole open here — these items
buy cleaner code, more verified live shapes, and dead mutants, not behavior
fixes. Do not treat any of this as a bug.

---

## ⟶ For the implementing session — read this first

Current verified surface: **46/184 live-success** (124 probe-documented + 14
documented), **92 public SDK names**, 26 subpaths, 58 CLI commands, 134 MCP
tools, `allowedRequestCastBudget: 0` (zero unannotated `as never`). Ground all
"current state" claims on SDK HEAD `4323b1b` / GOCLMCP v0.4.5.

### Prerequisites

- **Fresh branch off `main`** before any edit:
  `git checkout main && git pull && git checkout -b deferred/<item>`. Never
  commit deferred work onto `main` directly.
- A **LIVE Clockify sandbox key is required ONLY for the NEEDS-LIVE-KEY items**
  (Item 2, Item 4a's live re-run, Item 4c). The key **rotates** — the one in
  `CLOCKIFY_API_KEY` is likely dead. **Preflight before any live run** and expect
  HTTP `200`:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: $CLOCKIFY_API_KEY" https://api.clockify.me/api/v1/user
  ```
  A non-200 means the key is dead — stop, get a fresh **sacrificial sandbox**
  key, do not proceed. Optional offline shape check: `make sandbox-key-health`
  (exits 0 on blank creds, never prints the key). Items 1, 3, and 4b are fully
  offline and need **no key**.

### Order to do things (easiest win → defer key-gated)

1. **Item 4a** (XS, cosmetic) — single FIND-AND-REPLACE of one findings-md row
   plus two regen/drift commands in GOCLMCP. The `live-success` promotion already
   landed upstream; the YAML must not move. ~5 min, zero risk. Start here.
2. **Item 1, Buckets A+B only** — cleanest real win: no key, no codegen-shape
   change, behavior-neutral, covered by existing tests. Removes ~half the
   documented KEEP casts. Leave Bucket C alone (upstream GOCLMCP).
3. **Item 3, killable subset B1+B4** — cheap, offline, real coverage; then
   ratchet the two floors in `docs/mutation-score-contract.json`. The rest of
   Item 3 is WONTFIX (equivalent mutants).
4. **Item 2** — **only when a fresh sandbox key is in hand**, and do the `-v`
   make-target fix (Step 0) FIRST (a green run otherwise harvests zero rows).
   Then read-tier Batches 1+2 (~30 ops, low risk → ~76/184). Batch 3
   opportunistic; Batch 4 on-demand only.
5. **Item 4b** (vitest skew) low-priority offline cleanup; **Item 4c** only
   inside a real time-off live campaign.

### Hard stops

- **No hand-edits to generated/snapshot paths**: `wrapper/src/**`,
  `output/ts-sdk/**`, `spec/corrected/**`. Regenerate via `make sdk-codegen`. The
  only sanctioned write to those is a refresh-from-canonical guarded by
  `CLOCKIFY_ALLOW_GENERATED_DIFF=1` (enforced by
  `scripts/check-no-generated-edits.mjs`); `make sdk-codegen` must run first or
  type-checks fail spuriously.
- **Spec-shape changes go through GOCLMCP**, never this repo. Bucket C (Item 1),
  4f, and any new param/response schema are GOCLMCP generator PRs, then
  re-snapshot.
- **Run BOTH `make perfect-fast` AND `make perfect-full` SOLO with blanked
  creds** for the final proof:
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` (then
  `perfect-full`). They flake under CPU contention (startup-time budgets) and the
  dead key 401s if creds are set — run nothing else concurrently. Capture make's
  exit code directly, not via a `; echo $?` compound.
- **Plain commit messages.** No `npm publish`, no `git push --force`, no live
  tests against personal/production workspaces.
- **Release reality**: the SDK **does not release** on a spec/live change. On a
  spec change, **GOCLMCP cuts a patch release**; this repo only refreshes the
  snapshot + re-codegens.

### How to know each item is done

Each item below carries its own **Done when:** acceptance line and a per-step
**Verify:**. Treat those as the gate — do not declare an item done until its
Done-when passes and the final solo `perfect-fast` + `perfect-full` are green
with blanked creds.

### WONTFIX — do NOT chase these (skip on sight)

Item 1 Bucket C (spec-gap response/param casts), Item 3 equivalent mutants
A1–A5, **4d** `scheduling.calculateUsersTotals` + `projects.archive` (upstream
404), **4e** `compose.work-package.ensure-repoint` (net regression, closed by
decision), **4f** wrapper `noImplicitOverride`/`exactOptionalPropertyTypes`
(errors in generated code — upstream generator fix). Non-issues already
resolved: W1 teardown-status capture,
`deferred-list-endpoints.not-paginated-or-not-live`.

---

## Status legend

- **STRUCTURAL-CEILING** — reducible only so far; a residual subset is inherent.
- **GENERATOR-CHANGE** — fix lives in the GOCLMCP generator, not this repo.
- **WONTFIX-WITH-RATIONALE** — verified not worth changing; reason recorded.
- **NEEDS-LIVE-KEY** — blocked on a fresh, rotating sacrificial sandbox key.
- **QUICK WIN** — small, offline, fully evidenced.

---

## 1. Kill the generator-forced `as never` request-body / response casts (type-safety ceiling)

Status: **STRUCTURAL-CEILING** (reducible subset) + **GENERATOR-CHANGE** (irreducible subset) + **WONTFIX-WITH-RATIONALE** (response-envelope narrows).

Effort: ~0.5 day mechanical for the reducible subset; Bucket C is a separate GOCLMCP PR (not estimable here).
Risk: low (type-only; runtime unchanged — both union arms route through `bodyFromRequest` identically).
Done when: every Bucket-A/B site below either drops the `as never` (clean union bind) or converts to a documented `wireBody<T>()`; `make consumer-cast-budget`, both `type-check`s, and both test suites stay green.

### Ground truth (re-validated at SDK HEAD `4323b1b`, GOCLMCP v0.4.5)

- The generator already emits `X = XFlattened | XBodyEnvelope` for every body op (`generate-sdk-from-openapi.mjs:659`), and `wrapper/requests.ts` exports `ClockifyRequestBody<T>` (line 23) + `wireBody<T>()` (line 32) via the `clockify-sdk-ts-115/requests` subpath (`wrapper/package.json:260`).
- `docs/consumer-cast-budget-contract.json` `allowedRequestCastBudget: 0`. **The gate counts only `as never` lines that lack a `KEEP as never` comment on the same OR immediately-preceding line; `result.ts`/`output-schema.ts` are path-exempt.** Replicating the gate now yields **0 unannotated offenders** — there is no type-safety hole. This item converts documented KEEP casts into typed bindings; the gate neither forces nor rewards it.
- There are **24 KEEP'd cast sites** today (`grep -rn "as never" cli/src mcp/src | grep -v result.ts`). Most are response narrows or genuine spec gaps; only a handful are clean request-body binds.

**Verify (current state, before any change):**
```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk
make consumer-cast-budget   # => "Consumer cast budget passed (0 unannotated `as never`, budget 0)."
```

### Where it lives (anchors validated)

- Budget gate: `scripts/check-consumer-cast-budget.mjs` (annotation self-test at lines 28-31); make target `consumer-cast-budget` at `Makefile:488`.
- Codegen: `scripts/generate-sdk-from-openapi.mjs` — `requestTypeSource()` at **line 649**, union/`Body` interface emit at **lines 654-659**, `operationSpecSource()` at **line 675**, runtime body assembly `body: core.bodyFromRequest(<req> as unknown as Record<string,unknown>, [bodyKeys])` at **line 688**.
- Runtime: `wrapper/src/core/request.ts:224` `bodyFromRequest()` — returns `source.body` verbatim when a `body` key is present and not in the whitelist (envelope arm); else `pickDefined` (flattened arm). Both arms wire-correct.

### Per-site classification (corrected against the real generated types)

| Site | Generated type | Bucket | Fix |
|---|---|---|---|
| `mcp/src/tools/entries.ts:217` | `UpdateTimeEntriesRequestBodyEnvelope` has `{workspaceId,timeEntryId,body}` | **A-clean** | type `body` as `ClockifyRequestBody<UpdateTimeEntriesRequest>`, drop cast |
| `mcp/src/tools/users.ts:237` | `AddUserWorkspacesRequestFlattened` = exactly `{workspaceId,"send-email","email"}` | **A-clean** | drop cast — the KEEP comment ("query/body split too narrow") is wrong; the flattened arm matches verbatim |
| `mcp/src/tools/invoices.ts:131`, `:207` | `UpdateInvoicesRequestBody` (required `currency`,`number`,…) | **A-wireBody** | source is `invoiceUpdateBodyFromExisting() => Record<string,unknown>`; bind envelope `body` via `wireBody<UpdateInvoicesRequestBody>(...)`, not a clean union |
| `mcp/src/tools/timeOff.ts:440` | `CreateTimeOffPolicyRequestFlattened` requires `approve` (consumer omits it) | **A-wireBody / quirk** | `body` is already typed; flat `...body` spread won't satisfy Flattened (missing required `approve`). Either bind envelope `body: wireBody<CreateTimeOffPolicyRequestBody>(body)` or leave KEEP citing the partial-create `approve` quirk |
| `mcp/src/tools/timeOff.ts:542`, `:573` | `UpdateTimeOffPolicy*`/archive body | **A-wireBody** | same pattern (live-carryforward record) → `wireBody<…Body>()` |
| `mcp/src/tools/expenses.ts:189`, `:238` | `ExpenseCreateRequestFlattened`/`UpdateExpensesRequestFlattened` DO model `file?` | **A-typing** | the KEEP ("omits multipart file") is wrong; cast comes from untyped `fields`/`extra` locals. Type those locals or `wireBody<ExpenseCreateRequestBody>()` |
| `cli/src/commands/users.ts:78`, `cli/src/commands/expenses.ts:155` | invite / expense create | **A-typing** | same as their MCP twins |
| `mcp/src/tools/workflows/resolve.ts:578` | `ListTimeOffPoliciesRequest.page` is `string`, `"page-size"` is `number` | **B-coercion** | change `page: 1` → `page: "1"`, bind `ListTimeOffPoliciesRequest`, drop cast |
| `mcp/src/tools/workflows/resolve.ts:566` | `ListExpenseCategoriesRequest` = `{workspaceId}` only | **C-spec** | live accepts `page`/`page-size` the spec omits — irreducible in-repo |
| `mcp/src/tools/invoices.ts:43` | `ListInvoicesRequest` = `{workspaceId}` only; response untyped | **C-spec** | live accepts `statuses`, returns `{invoices,total}` envelope — irreducible |
| `mcp/src/tools/invoices.ts:276` (status PATCH), `:366` (import filter), `mcp/src/tools/timeOff.ts:267` (`changeTimeOffRequestStatus`) | generated body too narrow | **C-spec** | each needs an upstream field; leave KEEP |
| Response narrows: `cli/src/commands/webhooks.ts:29`, `cli/src/commands/expenses.ts:71`, `cli/src/commands/timeoff.ts:59`, `mcp/src/tools/timeOff.ts:149`, `mcp/src/tools/workflows/review.ts:33`, `mcp/src/tools/workflows/resolve.ts:370` | response type `unknown`/wrong | **WONTFIX** | the `as never` is on a list/search *request*, and the trailing `as {…}` narrows an `unknown` response; even after a spec response-schema fix a runtime `as` narrow is reasonable. Leave KEEP |

### Mechanized steps (in-repo, Bucket A + B only)

**Step 0 — codegen first.** `output/ts-sdk/**` and `wrapper/src/**` are gitignored; type-check fails spuriously without them.
```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk && make sdk-codegen
```
Verify: `ls wrapper/src/api/resources/timeEntries/client/requests/UpdateTimeEntriesRequest.ts` exists (exit 0).

**Step 1 — entries.ts (A-clean exemplar).**
- Add import near the top of `mcp/src/tools/entries.ts`, after the last existing `import` line:
  ```ts
  import type { ClockifyRequestBody, ClockifyApi } from "clockify-sdk-ts-115/requests";
  ```
- FIND (line 205):
  ```ts
            const body: Record<string, unknown> = { start: args.start };
  ```
  REPLACE:
  ```ts
            const body: ClockifyRequestBody<ClockifyApi.UpdateTimeEntriesRequest> = { start: args.start };
  ```
- FIND (lines 212-217):
  ```ts
            const updated = await ctx.client.timeEntries.update({
                workspaceId: ctx.workspaceId,
                timeEntryId: args.timeEntryId,
                body,
                // KEEP as never: time-entry update body is a partial live patch.
            } as never);
  ```
  REPLACE:
  ```ts
            const updated = await ctx.client.timeEntries.update({
                workspaceId: ctx.workspaceId,
                timeEntryId: args.timeEntryId,
                body,
            });
  ```
  Verify: `npm run type-check -w @clockify115/mcp-server` (exit 0) and `grep -c "as never" mcp/src/tools/entries.ts` => `0`.

**Step 2 — users.ts:237 invite (A-clean, KEEP comment was wrong).**
- FIND (lines 232-237 in `mcp/src/tools/users.ts`):
  ```ts
            const workspace = await ctx.client.workspaces.addUser({
                workspaceId: ctx.workspaceId,
                "send-email": (args.sendEmail ?? true) ? "true" : "false",
                email: args.email,
                // KEEP as never: invite query/body split is generated too narrowly.
            } as never);
  ```
  REPLACE:
  ```ts
            const workspace = await ctx.client.workspaces.addUser({
                workspaceId: ctx.workspaceId,
                "send-email": (args.sendEmail ?? true) ? "true" : "false",
                email: args.email,
            });
  ```
  Verify: `npm run type-check -w @clockify115/mcp-server` (exit 0). If it errors, the flattened arm did not match — revert and re-tag KEEP.

**Step 3 — resolve.ts:578 (B-coercion).**
- FIND (lines 573-578 in `mcp/src/tools/workflows/resolve.ts`):
  ```ts
        ctx.client.timeOffPolicies.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        } as never),
  ```
  REPLACE:
  ```ts
        ctx.client.timeOffPolicies.list({
            workspaceId: ctx.workspaceId,
            page: "1",
            "page-size": 200,
        }),
  ```
  Verify: `npm run type-check -w @clockify115/mcp-server` (exit 0). `"page-size": 200` stays numeric (its generated type is `number`).

**Step 4 — wireBody conversions (A-wireBody: invoices.ts:131/207, timeOff.ts:440/542/573, expenses.ts:189/238).** These build the body from a `Record<string,unknown>` / loosely-typed locals, so they cannot drop to a clean union bind. Convert the bare `as never` to the documented typed escape so intent is explicit and the budget gate still passes. Pattern, e.g. `mcp/src/tools/invoices.ts:126-131`:
- Add import (after existing imports in the file):
  ```ts
  import { wireBody } from "clockify-sdk-ts-115/requests";
  import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
  ```
- FIND (lines 126-131):
  ```ts
                await ctx.client.invoices.update({
                    workspaceId: ctx.workspaceId,
                    invoiceId: created.id,
                    ...invoiceUpdateBodyFromExisting(existing, patch),
                    // KEEP as never: invoice replace body is rebuilt from live GET fields.
                } as never);
  ```
  REPLACE:
  ```ts
                await ctx.client.invoices.update({
                    workspaceId: ctx.workspaceId,
                    invoiceId: created.id,
                    body: wireBody<ClockifyApi.UpdateInvoicesRequestBody>(
                        invoiceUpdateBodyFromExisting(existing, patch),
                    ),
                });
  ```
  Apply the analogous edit at `invoices.ts:206-207` (same `UpdateInvoicesRequestBody`). For `timeOff.ts:440/542/573` use `wireBody<ClockifyApi.CreateTimeOffPolicyRequestBody>` / the matching update body type; for `expenses.ts:189/238` use `wireBody<ClockifyApi.ExpenseCreateRequestBody>` / `UpdateExpensesRequestBody`.
  Verify per file: `npm run type-check -w @clockify115/mcp-server` (exit 0); `grep -c "as never" <file>` decreases.
  Note: `wireBody` only asserts non-null-object at runtime, so this is a documented escape, not full type-safety — but it removes the opaque `as never` and names the wire type.

**Step 5 — leave Bucket-C + WONTFIX sites as `KEEP as never`, sharpen each comment.** For the spec-gap sites tighten the comment to name the missing param/response and add a TODO so the WONTFIX reason is auditable. Examples:
- `mcp/src/tools/invoices.ts:42` FIND `// KEEP as never: generated list/search/view request or response envelope does not match this wire shape.` REPLACE `// KEEP as never: ListInvoicesRequest is {workspaceId} only; live accepts a statuses filter and returns {invoices,total}. TODO(GOCLMCP): add statuses param + invoices-list response schema to listInvoices.`
- `mcp/src/tools/workflows/resolve.ts:560` FIND the same generic comment REPLACE `// KEEP as never: ListExpenseCategoriesRequest is {workspaceId} only; live accepts page/page-size. TODO(GOCLMCP): add pagination params to listExpenseCategories.`
  Verify: `make consumer-cast-budget` still green (KEEP comments remain on/above each `as never`).

### Bucket C — what closing it requires (upstream, OUT of in-repo scope)

For each Bucket-C op the GOCLMCP generator must add the missing request `parameters` (`statuses` on list-invoices; `page`/`page-size` on list-expense-categories) and response `schema` (`{invoices,total}` envelope), re-emit the spec, refresh `spec/corrected/clockify.corrected.openapi.yaml`, then `make sdk-codegen` here drops the casts. That is a `../GOCLMCP` PR gated by `make perfect-full`'s `goclmcp-drift` + `sdk-codegen-drift`. **Do not** attempt it in this repo — editing `spec/corrected/**` or `wrapper/src/**` is a hard-stop. Generator file to change upstream: `../GOCLMCP/scripts/gen-clockify-openapi` (param/response synthesis); the in-repo emit seam that consumes it is `generate-sdk-from-openapi.mjs:649` (`requestTypeSource`) / `:693` (`responseType`).

### Verification (full, run SOLO with blanked creds)

```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk
make sdk-codegen
make consumer-cast-budget                       # stays green (budget 0 unannotated)
npm run type-check -w @clockify115/cli
npm run type-check -w @clockify115/mcp-server
npm test -w @clockify115/cli && npm test -w @clockify115/mcp-server
npm run lint -w @clockify115/mcp-server         # eslint only runs here / in perfect-fast
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast   # final solo proof
```
Runtime is unchanged (both union arms route through `bodyFromRequest`), so the existing CLI/MCP suites are the regression net — no new fixtures. The cast-budget gate will NOT catch a botched conversion (it only counts annotations); rely on `type-check` + tests.

### Honest ceiling note

There is no live type-safety hole today (gate = 0 unannotated). Realistically only **2 sites drop to a clean union bind** (entries.ts:217, users.ts:237); the rest reduce to a documented `wireBody<T>()` (still a runtime assert, not real safety) or stay KEEP'd. Bucket C (3-4 sites) is irreducible without an upstream GOCLMCP spec PR; the response-narrow WONTFIX set (6 sites) stays as-is by design. Value: cleaner, self-documenting consumer code and a smaller opaque-`as never` surface — not a behavior or correctness change. If you want regrowth protection, add an `allowedKeepCastBudget` to `docs/consumer-cast-budget-contract.json` (bump `schemaVersion`, update the checker + its self-test at lines 28-31 in lockstep) — a separate contract change, optional.

---

## 2. Live-capture campaign: promote probe-documented ops to live-success (correctness ceiling)

Status: **NEEDS-LIVE-KEY** + **STRUCTURAL-CEILING** (diminishing returns; some ops are permanently gated).

**Effort:** large overall, front-loaded value. `-v` fix ~30 min; Batch 1 ~2-3h + 1 live run; Batch 2 ~half a day + 1 live run; Batch 3 ~1-2h; Batch 4 open-ended (mostly permission-gated, low payoff). High-value scope = fix + Batch 1+2+3 (~50 ops) ~2-3 focused days + live-key availability.
**Risk:** read batches low (GET-only); write/delete batches medium-high operationally (real mutations on a live workspace; mitigated by CONFIRM==ws-id gate, unique prefix, archive-first cleanup, mandatory sweep). Hard-blocked on a rotating sandbox key.
**Done when:** the `-v`/findings-out fix is merged so a green `make live-contract-local` emits harvestable rows, AND ≥1 batch's rows are pasted into `findings/*.md` + `make gen-openapi && make openapi-drift` stay green with a higher `live-success` count, AND the SDK snapshot is refreshed (`make sdk-codegen` + `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` green).

> WORK SPLITS ACROSS TWO REPOS. Steps prefixed **[GOCLMCP]** run in `/Users/15x/Downloads/WORKING/addons-me/GOCLMCP` (canonical generator + live harness). Steps prefixed **[SDK]** run in `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`. The SDK consumes a frozen hand-copied snapshot of GOCLMCP's spec.

### Current evidence ratio (re-counted on `docs/openapi/clockify-openapi.yaml`, GOCLMCP v0.4.5)

| Tier | Count | Meaning |
|---|---|---|
| `live-success` | 46 | A real 2xx captured against the sacrificial workspace; shape verified against the typed Go model. |
| `probe-documented` | 124 | Path/shape from probe-lab + upstream OpenAPI; no live 2xx ever captured. |
| `documented` | 14 | Documentation-only; no probe fixture. |
| **Total** | **184** | |

Verify the ratio before starting:
```sh
cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP
for t in live-success probe-documented documented; do printf '%s: ' "$t"; grep -c "x-clockify-live-status: $t" docs/openapi/clockify-openapi.yaml; done
```
**Verify:** prints `live-success: 46` / `probe-documented: 124` / `documented: 14`. (If the key rotated and a prior run already promoted ops, these may be higher — that is fine, just note the new baseline.)

### The promotion pipeline (already wired — campaign is "exercise more ops", not "build infra")

1. **Capture.** A live test calls `logFindingsRow(t, method, host, templatePath, status, fixture)` (`tests/e2e_live_schema_test.go:752`), printing a copy-pasteable markdown row via `t.Logf`.
2. **Record.** Paste the row into `docs/openapi/sources/clockify-api-probe-lab/findings/<domain>.md` (5-column table `| Method | Host | Path | Status | Fixture |`; see `findings/clients.md:13-19`).
3. **Parse.** `discover_findings` (`scripts/gen-clockify-openapi:560`) reads every `findings/*.md`, skips `TODO-live` scaffold rows (`pending_live_finding_row?`, `:423`), buckets via `status_bucket` (`:427`): any 2xx → `live-success`.
4. **Promote.** `choose_live_status` (`:1660`) takes the max-evidence bucket. `make gen-openapi` (`Makefile:71`) regenerates the YAML.
5. **Gate.** `make openapi-drift` (`Makefile:74`) re-runs the generator and diffs against the committed YAML.

Delete-status capture template: `cleanupDeleteRaw` (`e2e_live_schema_test.go:698`, `type findingsDelete` at `:685`) — given `findingsDelete{templatePath, fixture}` metadata it captures the teardown DELETE status and emits a promotable row. The clients/projects/tags/tasks `cleanup*Raw` helpers (`:633`/`:649`/`:665`) already pass it.

---

### Step 0 — [GOCLMCP] The `-v` auditability fix (DO THIS FIRST — it is the real blocker)

`logFindingsRow` (`tests/e2e_live_schema_test.go:752-755`) uses `t.Logf`. `go test` only prints `t.Log` output with `-v` or on failure. `live-contract-local` (`Makefile:142-159`) runs `go test` WITHOUT `-v`, so on a green run every captured row is silently swallowed — the operator has nothing to paste. This is why the campaign stalls after a "successful" run.

Pick ONE fix:

**Option A (minimal — add `-v` to both live `go test` invocations).** Two FIND-REPLACEs in `Makefile`:

FIND (Makefile:148):
```
	go test -tags=livee2e -count=1 -timeout 5m \
```
REPLACE:
```
	go test -tags=livee2e -count=1 -timeout 5m -v \
```

FIND (Makefile:154, inside the `CLOCKIFY_LIVE_OPTIONAL_DOMAINS` branch — note leading tab+tab indent):
```
		go test -tags=livee2e -count=1 -timeout 10m \
```
REPLACE:
```
		go test -tags=livee2e -count=1 -timeout 10m -v \
```
**Verify:** `grep -n 'go test -tags=livee2e.* -v ' Makefile` returns exactly 2 lines (148, 154).

**Option B (better — also append rows to a deterministic file, survives without `-v`, diffable).** FIND-REPLACE the whole `logFindingsRow` body in `tests/e2e_live_schema_test.go:752-755`.

FIND:
```
func logFindingsRow(t *testing.T, method, host, path string, status int, fixture string) {
	t.Helper()
	t.Logf("| %s | %s | %s | %d | %s |", method, host, path, status, fixture)
}
```
REPLACE:
```
func logFindingsRow(t *testing.T, method, host, path string, status int, fixture string) {
	t.Helper()
	row := fmt.Sprintf("| %s | %s | %s | %d | %s |", method, host, path, status, fixture)
	t.Logf("%s", row)
	if out := strings.TrimSpace(os.Getenv("CLOCKIFY_LIVE_FINDINGS_OUT")); out != "" {
		f, err := os.OpenFile(out, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			t.Logf("CLOCKIFY_LIVE_FINDINGS_OUT open %s: %v", out, err)
			return
		}
		defer f.Close()
		if _, err := fmt.Fprintln(f, row); err != nil {
			t.Logf("CLOCKIFY_LIVE_FINDINGS_OUT write %s: %v", out, err)
		}
	}
}
```
(`fmt`, `os`, `strings` are already imported in this file — confirm with `grep -nE '"(fmt|os|strings)"' tests/e2e_live_schema_test.go`. If `os` is missing, add it to the import block.) Then `export CLOCKIFY_LIVE_FINDINGS_OUT=/tmp/findings.md` before the run.
**Verify:** `cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP && go build -tags=livee2e ./tests/... 2>&1 | head` compiles clean (no output).

**Recommended: do BOTH** (A for inline visibility, B so capture survives a green non-`-v` run).

Then document the harvest grep in `docs/live-tests.md`. Insert this block immediately before the `## Nightly drift detection` heading (`docs/live-tests.md:84`):
```
### Harvesting promotable findings rows

A green run prints findings rows via `-v` (and, if set, appends them to
`$CLOCKIFY_LIVE_FINDINGS_OUT`). Harvest with:

```sh
make live-contract-local 2>&1 | tee /tmp/live-run.log
grep -E '^\| (GET|POST|PUT|PATCH|DELETE) \|' /tmp/live-run.log
# or, with CLOCKIFY_LIVE_FINDINGS_OUT set:
sort -u "$CLOCKIFY_LIVE_FINDINGS_OUT"
```

Paste each 2xx row into the matching
`docs/openapi/sources/clockify-api-probe-lab/findings/<domain>.md` table, then
run `make gen-openapi && make openapi-drift`.
```
**Verify:** `grep -n 'Harvesting promotable findings rows' docs/live-tests.md` returns one line.

---

### Step 1 — [GOCLMCP] Run the live campaign (NEEDS-LIVE-KEY; key ROTATES)

Set env from a fresh sacrificial-sandbox key. **Preflight first** — the key rotates and a dead key 401s the whole run:
```sh
cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP
export CLOCKIFY_API_KEY='<fresh sacrificial sandbox key>'   # used VERBATIM, never decoded
export CLOCKIFY_WORKSPACE_ID='<sacrificial ws id>'
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: $CLOCKIFY_API_KEY" https://api.clockify.me/api/v1/user
```
**Verify:** prints `200`. If `401`, the key is dead/rotated — STOP, get a new key. Never print the key value.

Then the run env (read batches only need the first block; mutating batches add the second):
```sh
export CLOCKIFY_RUN_LIVE_E2E=1
export CLOCKIFY_LIVE_PREFIX="MCP-LIVE-$(date +%Y%m%d-%H%M)"        # unique per run; cleanup sweeps by this
export CLOCKIFY_LIVE_FINDINGS_OUT=/tmp/findings.md                  # only if Step-0 Option B applied
# Mutating batches (3/4 — write/delete) ONLY:
export CLOCKIFY_LIVE_HAPPY_PATH_CAMPAIGNS=1
export CLOCKIFY_LIVE_WORKSPACE_CONFIRM="$CLOCKIFY_WORKSPACE_ID"     # MUST equal ws id (requireLiveWriteShapeGate, e2e_live_schema_test.go:570)
export CLOCKIFY_LIVE_OPTIONAL_DOMAINS=1                             # broad ^TestLive campaign (Makefile:152)
```

Run + harvest + MANDATORY teardown:
```sh
: > /tmp/findings.md                                                # if using Option B
make live-contract-local 2>&1 | tee /tmp/live-run.log
grep -E '^\| (GET|POST|PUT|PATCH|DELETE) \|' /tmp/live-run.log
make live-clean-prefix                                             # MANDATORY sweep (Makefile:163; needs CLOCKIFY_LIVE_WORKSPACE_CONFIRM)
```
Cleanup is twofold: per-test `t.Cleanup` archives-then-deletes each created object (`cleanup*Raw`, `:633-679`; archive-first because deleting an ACTIVE project/client 400s) and `make live-clean-prefix` sweeps anything whose name starts with `$CLOCKIFY_LIVE_PREFIX`. `perfect-live` (`Makefile:189`) = `live-contract-local` + `live-clean-prefix`. Never point at a personal/production workspace; do not defeat `redactLiveText` (`e2e_live_schema_test.go:925`).
**Verify:** `make live-contract-local` exits 0 and the `grep` prints ≥1 row of the form `| GET | api.clockify.me | /workspaces/{workspaceId}/... | 200 | fixtures/... |`. `make live-clean-prefix` exits 0.

> If the run env vars are unset, `live-contract-local` self-aborts with `set CLOCKIFY_RUN_LIVE_E2E=1, ...` (Makefile:143-147) — that exit-1 is the guard, not a failure.

---

### Batches (hot-ops-first; widen the live harness as needed, then run Step 1)

The Makefile `-run` filter (`Makefile:149`) runs `TestLiveOneUserWorkflowMCP` + `TestLiveRawClockifyReadSideSchemaDiff` (`tests/e2e_live_schema_test.go:27`); the broad `^TestLive` campaign (`Makefile:155`, gated by `CLOCKIFY_LIVE_OPTIONAL_DOMAINS=1`) also picks up `TestLiveRawClockifyWriteSideSchemaDiff` (`:147`) and `TestLiveRawClockifyWriteCRUDShapeOracle` (`:310`).

- **Batch 1 — read-side promotions, no new calls (lowest risk, ~15-20 ops).** The GET subtests in `TestLiveRawClockifyWriteSideSchemaDiff` (`e2e_live_schema_test.go:147`, subtests from ~173) call `liveGetRaw` (`:885`) via the local `get(...)` closure, which returns only `error` — no status. Switch those probes to `liveJSONRaw` (`:587`, returns `(int, error)`) and add `logFindingsRow(t, http.MethodGet, "api.clockify.me", "<templatePath>", status, "fixtures/live-shape/<op>.json")` after each. Also emit rows for the read-side list GETs in `TestLiveRawClockifyReadSideSchemaDiff` (`:27`; current user, workspaces, projects/clients/tags/tasks/time-entries lists).
- **Batch 2 — read singletons needing a GET probe (~30 read ops total after this).** `getInvoiceSettings`, `getWorkspaceInvoices`, `getMemberProfile/{userId}`, `findWorkspaceUsers`, `findUserTeamManagers`, `getApprovalRequests`, `getBalancesForPolicy`, `getBalanceForUser`, `getTimeOffPolicy`, `getUserCapacityTotal`, `getAllSchedulingAssignments`, `findAllGroupsOnWorkspace` + `/users`, `listProjectCustomFields`, `.../webhooks/{webhookId}/logs`. Each a single GET; several already have a subtest body missing only the row emit.
- **Batch 3 — write/delete on already-exercised CRUD domains (~5 destructive ops).** Pass `findingsDelete{templatePath, fixture}` into the existing `cleanupDeleteRaw` calls for projects/tags/tasks/time-entries (mirror the clients DELETE promoted 2026-06-20 in `TestLiveRawClockifyWriteCRUDShapeOracle`, `:310`). The clients call (`:645-646`) is the exemplar.
- **Batch 4 — rarer-domain write happy paths (highest effort, low payoff, mostly gated).** invoices create/finalize, expenses multipart create, scheduling assignment create, time-off policy/request create, user-group create + add-member, custom-field create, webhook create. Each needs a new `t.Run` mutate+capture+teardown subtest under `requireLiveWriteShapeGate` (`:570`) with `assertNoUnknownFields` (`:950`) + `t.Cleanup` teardown. The reports subtest (non-default-host template: `logFindingsRow` for reports at `:564`, helper `liveReportsJSONRaw` at `:583` calling `liveJSONAtBase` at `:591`) is the pattern for ops on `reports.api.clockify.me`. Many resolve to `permission-gated` / `workspace-state-limited` even when run — that is CORRECT (`status_bucket`, `:427`), not a failure.

By-domain probe-documented counts (124): invoices 16, projects 13, scheduling 13, time-off 13, users 10, expenses 8, user-groups 8, policies 6, webhooks 6, user 5, workspace 4, approval-requests 4, custom-fields 3, member-profile 3, shared-reports 3, time-entries 3, plus singletons. 121/124 on `api.clockify.me/api/v1`; only 3 on `reports.api.clockify.me`.

---

### Step 2 — [GOCLMCP] Record findings rows + regenerate

For each captured 2xx, paste a row into `docs/openapi/sources/clockify-api-probe-lab/findings/<domain>.md` (under the `| Method | Host | Path | Status | Fixture |` header). Exact format (verbatim from `findings/clients.md:14-19`):
```
| GET | api.clockify.me | /workspaces/{workspaceId}/clients | 200 | fixtures/live-shape/clients-list.json |
| POST | api.clockify.me | /workspaces/{workspaceId}/clients | 201 | fixtures/live-shape/clients-create.json |
| DELETE | api.clockify.me | /workspaces/{workspaceId}/clients/{clientId} | 200 | fixtures/live-shape/clients-delete.txt |
```
Rules: path uses `{workspaceId}` / `{clientId}` template placeholders (NOT real ids); status is the real captured 2xx; fixture is the recorded body path. Do NOT paste `TODO-live` scaffold rows (the generator skips them via `pending_live_finding_row?`, `:423`).

Then:
```sh
cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP
make gen-openapi      # regenerate clockify-openapi.yaml with new live-success stamps (Makefile:71)
make openapi-drift    # MUST be green: committed YAML == regen output (Makefile:74)
```
**Verify:** `make openapi-drift` exits 0, and `grep -c 'x-clockify-live-status: live-success' docs/openapi/clockify-openapi.yaml` is higher than the Step-0 baseline. A promotion may also flip `coverage-dashboard-drift` / `selfinspect-drift` — if so, `make sync-selfinspect-assets` (`Makefile:97`) and re-run.

Then run the full deterministic GOCLMCP gate set:
```sh
make perfect-local    # Makefile:183 (perfect + golangci-lint + bench-baseline-check)
```
**Verify:** `make perfect-local` exits 0.

---

### Step 3 — [SDK] Sync the snapshot to clockify-ts-sdk

GOCLMCP is canonical; the SDK consumes a frozen, hand-copied snapshot. `spec/corrected/clockify.corrected.openapi.yaml` is a hard-stop no-hand-edit file EXCEPT this one refresh-from-canonical copy.

```sh
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk
make goclmcp-drift                                                          # confirm upstream self-consistent before trusting its spec
cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml spec/corrected/clockify.corrected.openapi.yaml
make sdk-codegen                                                           # output/ts-sdk + wrapper/src are gitignored; required before type-check
make official-openapi-report                                               # refresh the official-vs-corrected provenance report
```
**Verify:** `git -C /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk diff --stat spec/corrected/clockify.corrected.openapi.yaml` shows the snapshot changed (only `x-clockify-live-status` lines unless a promotion surfaced an unknown field).

Live-status changes mostly affect provenance/notes, not method signatures, so SDK regen is usually a typed-surface no-op — UNLESS a promotion surfaced an unknown field, in which case both the Go and regenerated TS models change (the high-value correctness win) and `make generator-comparison` will flag it. The codegen-drift gate requires an explicit ack for a regenerated diff:
```sh
CLOCKIFY_ALLOW_GENERATED_DIFF=1 make sdk-codegen-drift   # acknowledge the regenerated-output diff
make generator-comparison                                # cross-check corrected-OpenAPI stamps vs generated TS methods
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast   # final SOLO proof (blanked creds; load-sensitive startup budgets)
```
**Verify:** `make perfect-fast` exits 0 (capture `make ...; echo $?` separately — a compound masks make's real status). Run it SOLO; no other agents/heavy commands concurrently.

Then commit (only when asked — branch first if on `main`):
```sh
git -C /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk add spec/corrected/clockify.corrected.openapi.yaml docs/
git -C /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk commit -m "spec: refresh corrected-OpenAPI snapshot — +N live-success promotions"
```
**Verify:** commit lands; `make perfect-fast` re-runs green.

---

### Honest ceiling note (STRUCTURAL-CEILING — do NOT chase 100% live-success)

The read tier (~30 ops, Batches 1+2) is cheap, GET-only, and worth completing — that alone reaches ~76/184 and covers every op an MCP/SDK consumer actually reads. Past that, write/destructive promotions on rarely-used domains are real-blast-radius mutations almost no consumer depends on. Several probe-documented ops will NEVER become `live-success` and that is correct: paid-plan/permission ops resolve to `permission-gated`, workspace-state ops to `workspace-state-limited`, phantom routes are quarantined (`PHANTOM_PATHS`, `scripts/gen-clockify-openapi:450` — e.g. `/scheduling/capacity`, per-user `/balance`). The 14 `documented` ops plus these gated buckets are the structural floor. Stop at the read tier (and Batch 3 deletes on already-exercised CRUD domains) unless a consumer actually needs a specific write domain's typed shape.

---

## 3. Surviving / equivalent mutants in the mutation suite (testing ceiling)

Status: **WONTFIX-WITH-RATIONALE** for the bulk; one genuinely-killable item (**B1**, month/weekday literals) and one partially-killable item (**B4-link-local**). The older B3/B5 ideas are reclassified to WONTFIX-equivalent (verified below — the proposed tests already exist and the mutants still survive because the code is equivalent).

### Ground truth (verified against the live report)

Report: `wrapper/reports/mutation/mutation.json` (regenerated 2026-06-20) and `mcp/reports/mutation/mutation.json`. Floors: `docs/mutation-score-contract.json` (`scripts/check-mutation-score.mjs` / `make mutation`, monotonic-up). Stryker mutates only hand-written modules; generated `wrapper/src/**` is excluded.

Survivor counts pulled from the live report:

| File | Floor | Survived (from report) |
|---|---|---|
| `wrapper/dates.ts` | 84 | 42 |
| `wrapper/webhook-url.ts` | 80 | 59 |
| `wrapper/errors.ts` | 80 | 68 |
| `mcp/src/orchestration/confirmation.ts` | 77 | 12 |

Reproduce the survivor list for any file:

```bash
cd wrapper && node -e 'const r=require("./reports/mutation/mutation.json");
const k=Object.keys(r.files).find(x=>x.endsWith("dates.ts"));
for(const m of r.files[k].mutants.filter(m=>m.status==="Survived"))
  console.log("L"+m.location.start.line+":"+m.location.start.column,m.mutatorName,JSON.stringify(m.replacement));'
```

**Verify:** the command prints lines including `L22:39 StringLiteral`, `L33:5`…`L37:5 StringLiteral`, `L195:17`/`L221:17` (the quarter guards), confirming the report matches this plan.

---

### KILLABLE — do these

#### B1. `dates.ts` month-name + weekday string literals (REAL kills)

Survivors (verified, line→string mapping computed from `wrapper/dates.ts`):

- `MONTHS` array (`dates.ts:25-38`): `L33 "august"`, `L34 "september"`, `L35 "october"`, `L36 "november"`, `L37 "december"` — `StringLiteral→""`. Untested as parse inputs (only "September"/"December" appear in test prose).
- `WEEKDAYS` array (`dates.ts:22`): col 39 `"tuesday"`, col 63 `"thursday"`, col 85 `"saturday"` — `StringLiteral→""`. Untested (tested: sunday/monday/wednesday/friday).

Mutating any of these to `""` makes `parseMonthNameDay` / the weekday `indexOf` fail that name; no current test parses those words, so the mutant survives. Each assertion below parses the exact word and pins the result.

**Edit** — append a new `it` block. Anchor: the closing `});` of the `"rejects abbreviations…"` test in `wrapper/tests/dates.test.ts` (the `it` block at lines 67-76). Find this exact block end:

FIND:
```
        // A bare 3-letter prefix that uniquely matches still resolves.
        expect(resolveRelativeDay(NOW, { date: "Mar 9" })).toBe("2026-03-09");
    });
```

REPLACE:
```
        // A bare 3-letter prefix that uniquely matches still resolves.
        expect(resolveRelativeDay(NOW, { date: "Mar 9" })).toBe("2026-03-09");
    });

    it("parses every month name (kills MONTHS literal mutants Aug–Dec)", () => {
        // NOW year is 2026; these months are all valid days-of-month.
        expect(resolveRelativeDay(NOW, { date: "August 15" })).toBe("2026-08-15");
        expect(resolveRelativeDay(NOW, { date: "September 7" })).toBe("2026-09-07");
        expect(resolveRelativeDay(NOW, { date: "October 3" })).toBe("2026-10-03");
        expect(resolveRelativeDay(NOW, { date: "November 9" })).toBe("2026-11-09");
        expect(resolveRelativeDay(NOW, { date: "December 25" })).toBe("2026-12-25");
    });

    it("matches every weekday name (kills WEEKDAYS literal mutants tue/thu/sat)", () => {
        // NOW is Monday 2026-06-15. Bare weekday = the next occurrence on/after today.
        expect(resolveRelativeDay(NOW, { date: "tuesday" })).toBe("2026-06-16");
        expect(resolveRelativeDay(NOW, { date: "thursday" })).toBe("2026-06-18");
        expect(resolveRelativeDay(NOW, { date: "saturday" })).toBe("2026-06-20");
    });
```

> Before committing the exact `.toBe(...)` dates above, confirm the bare-weekday semantics: run `node -e 'const {resolveRelativeDay}=require("./wrapper/dist/cjs/dates.js");const N=new Date("2026-06-15T12:00:00Z");for(const d of ["tuesday","thursday","saturday"])console.log(d,resolveRelativeDay(N,{date:d}))'` (build first with `npm run build -w clockify-sdk-ts-115`), or read the weekday branch in `dates.ts` and the existing `"wednesday"→2026-06-17` assertion (`dates.test.ts:32`) which fixes the "today counts, advance forward" rule. The dates above follow that rule (Mon=15 → tue=16, thu=18, sat=20).

**Effort:** ~20 min. **Risk:** low (test-only). **Done when:** the 8 literal survivors (L22 ×3, L33-37 ×5) flip to `Killed` after a Stryker re-run.

---

#### B4. `webhook-url.ts` IPv6 link-local upper bound (one real kill; rest equivalent)

Source (`wrapper/webhook-url.ts:189`): `if (first >= 0xfe80 && first <= 0xfebf) return "link-local range (fe80::/10)";`

Survivors at L189: `EqualityOperator first < 0xfebf` and `ConditionalExpression→true`. Existing tests reject `[fe80::1]` (`tests/webhook-url.test.ts:62`) — that does NOT kill the upper-bound mutant, because `fe80` is in range under both original and mutant. **The kill requires asserting that an address just ABOVE the band is ACCEPTED.** Verified: `[fec0::1]` → `first=0xfec0 (65216) > 0xfebf (65215)` → original returns no reason (accepted, `ok=true`); the `<=0xfebf→true` mutant flags it link-local (rejected). So asserting `ok===true` for `[fec0::1]` kills L189.

**Edit** — anchor: the "accepts routable public IPv6 literals" test (`tests/webhook-url.test.ts:77-79`).

FIND:
```
    it("accepts routable public IPv6 literals", () => {
        expect(validateWebhookUrl("https://[2606:4700:4700::1111]/hook").ok).toBe(true);
    });
```

REPLACE:
```
    it("accepts routable public IPv6 literals", () => {
        expect(validateWebhookUrl("https://[2606:4700:4700::1111]/hook").ok).toBe(true);
        // first group 0xfec0 sits just ABOVE the fe80::/10 link-local band (<=0xfebf),
        // so it must be accepted — this pins the link-local UPPER bound at webhook-url.ts:189.
        expect(validateWebhookUrl("https://[fec0::1]/hook").ok).toBe(true);
    });
```

The other webhook-url L189-area survivors (`L161 missing <= 0` `::`-overflow, the L106-195 fine-grained IPv6 internals) stay equivalent: they collapse to the same outer accept/reject verdict the existing fixtures already pin. Do NOT chase them.

**Effort:** ~10 min. **Risk:** low. **Done when:** the two L189 survivors (`EqualityOperator first < 0xfebf`, `ConditionalExpression→true`) flip to `Killed`.

---

### WONTFIX-WITH-RATIONALE (skip — verified equivalent)

- **B3 (was "killable") — `dates.ts` quarter rollover L195 / L221: EQUIVALENT, skip.** `resolvePeriod(now, period)` takes an explicit `now` (no `Date.now()`), so the "freeze the clock with `vi.setSystemTime`" step is moot, and the rollover tests it proposes **already exist** (`dates.test.ts:137-151`: `feb→last_quarter` wraps to 2025-Q4, `nov→next_quarter` wraps to 2027-Q1). The `if (qm < 0)`/`if (qm > 11)` guard mutants survive because JS `Date.UTC` absorbs the negative/overflow month index: skipping the `if` leaves `qm=-3`, and `startOf(2026,-3,1)` === `startOf(2025,9,1)` === `2025-10-01`, with `qm+2=-1` giving the same Dec end. Proven:
  ```bash
  node -e 'console.log(new Date(Date.UTC(2026,-3,1)).toISOString().slice(0,10), new Date(Date.UTC(2025,9,1)).toISOString().slice(0,10))'  # both 2025-10-01
  ```
  These are structurally equivalent; a kill would assert an implementation accident.

- **B5 (was "optional insurance") — `confirmation.ts` TTL L53 / L64: EQUIVALENT (redundant-guard pair), skip.** The TTL/expiry suite with a controllable `now` **already exists** (`mcp/tests/confirmation-store.test.ts:24-68`, incl. the boundary assert at L42). L53 (`if (this.now() >= stored.expiresAt)` inside `validate`) is dead behind `pruneExpired()` (L47): at/after expiry the token is deleted in prune, so `tokens.get` returns undefined and the throw fires at L50 — L53 never runs, so its `>=`/`false`/`>` mutants can't be killed. L64 (the prune comparison) and L53 use the identical comparison, so L64's boundary `>` mutant is masked by L53. Killing either would require a token that survives prune but fails the in-validate check, which the shared comparison makes impossible. WONTFIX.

- **A1 `errors.ts` L81-84 conditional spreads** (`...(opts.x !== undefined ? {x} : {})`): four `ConditionalExpression→true` survivors. Base `ClockifyApiError` assigns `this.statusCode = opts.statusCode` unconditionally, so `{statusCode: undefined}` and `{}` yield an identical instance. A kill needs `Object.hasOwn(err, "statusCode") === false`, which the SDK contract does not promise. Equivalent.

- **A2 `composed-fetch.ts` timing arithmetic** (`Date.now() - start` ↔ `+ start`, `attempt - 1`): `durationMs` feeds only spied observability hooks; wall-time is ~0ms in test, so no assertion constrains the value without a flaky clock band. Equivalent under deterministic tests.

- **A3 `errors.ts` `Error.captureStackTrace ?` guards** (L124/137/147/157/192/236/269) `→true`: equivalent on Node (the method always exists). The "assert `.stack` omits the constructor frame" idea is brittle on stack format — skip.

- **A4 `iter.ts` L205/L219 terminator guards**: 100%-covered loops where the other exit condition makes the outcome identical. Already 97.5 vs floor 95. Marginal — skip.

- **A5 MCP `result.ts` / `confirm-guard.ts` `ObjectLiteral→{}` / string survivors**: mutate optional receipt fields (`changed`, `warnings`, `next`) to empties; receipt-shape tests assert presence/structure, not exact prose. Pinning every string over-fits tests to copy. Skip.

- **NoCoverage buckets are NOT equivalence.** `composed-fetch.ts` and `webhook-url.ts` carry large NoCoverage buckets — real coverage gaps tracked separately by `scoreAll`, not the equivalent-mutant problem. Out of scope for this item.

---

### Verification (after B1 + B4)

```bash
cd wrapper && npx stryker run            # regenerates reports/mutation/mutation.json (~minutes)
# Confirm B1 dates.ts month/weekday literals flipped to Killed:
node -e 'const r=require("./reports/mutation/mutation.json");
  const k=Object.keys(r.files).find(x=>x.endsWith("dates.ts"));
  for(const m of r.files[k].mutants)
    if([22,33,34,35,36,37].includes(m.location.start.line) && m.mutatorName==="StringLiteral")
      console.log(m.location.start.line,m.location.start.column,m.status);'   # expect all Killed
# Confirm B4 webhook-url L189 flipped:
node -e 'const r=require("./reports/mutation/mutation.json");
  const k=Object.keys(r.files).find(x=>x.endsWith("webhook-url.ts"));
  for(const m of r.files[k].mutants)
    if(m.location.start.line===189) console.log(m.mutatorName,m.status);'      # expect Killed
make mutation                            # floors still pass (run from repo root)
```

**Verify:** every printed `status` is `Killed`; `make mutation` exits 0.

### Ratchet the floors (only after Stryker confirms Killed)

The contract is monotonic-up; raise only after the re-run proves the gain. Edit `docs/mutation-score-contract.json`:

FIND:
```
        "wrapper/dates.ts": 84,
```

REPLACE (read the new score from the Stryker run for `wrapper/dates.ts` and set the floor to the integer at or just below it — e.g. if it rises to ~88):
```
        "wrapper/dates.ts": 88,
```

FIND:
```
        "wrapper/webhook-url.ts": 80
```

REPLACE (B4 adds one kill on a 59-survivor file — the score moves little; raise only by the measured integer gain, e.g. 80→81, otherwise leave at 80):
```
        "wrapper/webhook-url.ts": 81
```

> Do NOT pre-pick the floor numbers above blind — set each to the integer floor of the actual post-run `mutationScore` for that file (read it from `reports/mutation/mutation.json` or the Stryker console summary). If a score didn't move past the next integer, leave the floor unchanged.

**Verify:** `make mutation` exits 0 with the raised floors (a too-high floor reds the gate).

### Effort & risk

B1+B4: ~30 min total, test-and-config only, never touches generated `wrapper/src/**` or `spec/corrected/**`. Risk: low. Main trap: over-chasing the WONTFIX set — B3 and B5 *look* killable but are verified-equivalent (the tests already exist and the mutants still survive). Floors are monotonic-up: only ratchet after a Stryker re-run confirms the targets are `Killed`, and set the floor to the measured integer, not a guess.

### Honest ceiling note

Real killable surface is small: 8 `dates.ts` literal mutants (B1) + 1 `webhook-url.ts` link-local bound (B4-fec0). Everything else in the survivor delta is structurally equivalent — Date-arithmetic absorption (quarters), redundant prune/validate guards (confirmation TTL), own-property-absence (errors spreads), unconstrained durations (composed-fetch timing), or exact receipt prose. The larger latent test-debt is the NoCoverage buckets, not equivalence — that is where `scoreAll` points if anyone wants to move the needle.

---

## 4. Cross-repo deferred loose ends

Status: mixed. The lead item (4a) is now a **clerical 1-line cosmetic fix** (the functional promotion already landed upstream — see below). The rest are **WONTFIX-WITH-RATIONALE** / **GENERATOR-CHANGE** / **NEEDS-LIVE-KEY** parked items.

Repo HEADs this was re-validated against: clockify-ts-sdk `4323b1b`, GOCLMCP `v0.4.5` (`6f3cd2c`).

---

### 4a. GOCLMCP projects-list GET — already promoted in YAML; only the findings-md row is stale. QUICK WIN (cosmetic)

Effort: XS. Risk: none. **Done when:** `findings/projects.md` row 12 reads `200`, and GOCLMCP `make gen-openapi` + `make openapi-drift` stay green (the YAML does not change).

**Reality check.** `getWorkspaceProjects` (operationId at `clockify-openapi.yaml:4813`; its `x-clockify-*` block runs 5104–5142) already carries `x-clockify-live-status: live-success` at line 5112 — set by commit `d3ddb2c` (2026-06-20). So the SDK-visible contract is correct and the GOCLMCP drift gate (`TestGeneratedOpenAPIIgnoresPendingLiveFindingRows`, `tests/doc_parity_test.go:261`, which only scans the YAML for the literal `TODO-live`) is green.

```
$ grep -n "x-clockify-live-status" docs/openapi/clockify-openapi.yaml | grep 5112
5112:      x-clockify-live-status: live-success
```

**Why it is regen-stable (you do not need a live re-run).** The generator (`scripts/gen-clockify-openapi`, Ruby) reads the existing `op["x-clockify-live-status"]` as `source_live_status` and feeds it into `choose_live_status` (lines 1442, 1451, 1663: `return "live-success" if buckets.include?("live-success")`). So `live-success` round-trips through every `make gen-openapi`. The findings-md `TODO-live-2xx` row does NOT downgrade it: `extract_status("TODO-live-2xx")` returns `nil` (the regex is `\b([1-5][0-9][0-9])\b`; `2xx` has no 3-digit token), so that row contributes no bucket. Verified:

```
$ ruby -e 'def es(r);t=r.to_s[/\b([1-5][0-9][0-9])\b/,1];t&.to_i;end; p es("TODO-live-2xx"); p es("200")'
nil
200
```

**The only remaining artifact** is the human-facing scaffold row in the findings file, which still says `TODO-live-2xx` while its four siblings (clients/tags/tasks/time-entries) say `200`. Fix it for consistency. This is cosmetic — no behavior, no SDK change.

**Step 1 — FIND-AND-REPLACE in `GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/findings/projects.md` (line 12).**

FIND (verbatim):
```
| GET | api.clockify.me | /workspaces/{workspaceId}/projects | TODO-live-2xx | fixtures/live-shape/projects-list.json |
```
REPLACE:
```
| GET | api.clockify.me | /workspaces/{workspaceId}/projects | 200 | fixtures/live-shape/projects-list.json |
```

**Verify:** `cd GOCLMCP && ! grep -q "TODO-live" docs/openapi/sources/clockify-api-probe-lab/findings/projects.md && echo OK` → prints `OK`.

**Step 2 — regen + drift (YAML must NOT change; the row is cosmetic + already live-success).**
```
cd GOCLMCP && make gen-openapi && make openapi-drift
```
**Verify:** exit `0` and `openapi-drift` prints no `[openapi-drift] ... is stale`. The YAML diff for `make gen-openapi` is empty (`git diff --quiet docs/openapi/clockify-openapi.yaml` → exit `0`).

**Step 3 — confirm the stamp is intact and pending-row gate green.**
```
cd GOCLMCP && grep -n "x-clockify-live-status: live-success" docs/openapi/clockify-openapi.yaml | grep -q 5112 && echo STAMP-OK
go test ./tests -run TestGeneratedOpenAPIIgnoresPendingLiveFindingRows
```
**Verify:** prints `STAMP-OK`; `go test` → `ok` (PASS).

**Step 4 — SDK-side drift gate (from clockify-ts-sdk root; requires `../GOCLMCP`).**
```
cd clockify-ts-sdk && make goclmcp-drift
```
(`goclmcp-drift` runs `cd ../GOCLMCP && make openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift && go test ./internal/tools/...`; it is part of `make perfect-full`, not `perfect-fast`.)
**Verify:** exit `0`.

> Optional (do NOT block on this): a true live re-decode of the projects-list body is `cd GOCLMCP && CLOCKIFY_RUN_LIVE_E2E=1 CLOCKIFY_LIVE_PREFIX=<prefix> go test ./tests -run TestLiveRawClockifyReadSideSchemaDiff -v` — it already GETs `…/projects` and runs `assertNoUnknownFields[clockify.Project]` (`tests/e2e_live_schema_test.go:67-75`). NOT required for this fix (the stamp is already live-success); only run it to re-confirm the shape on a fresh key. Hardening idea — add `logFindingsRow(t, http.MethodGet, "api.clockify.me", "/workspaces/{workspaceId}/projects", status, "fixtures/live-shape/projects-list.json")` after `e2e_live_schema_test.go:75` so future list promotions auto-log; needs a live run to populate `status`; leave deferred until a read-tier campaign runs.

---

### 4b. vitest major-version skew: wrapper on 4.x, cli+mcp on 2.x — latent consistency item

Effort: S–M. Risk: medium (coverage-threshold drift). **Done when:** all three packages pin `vitest ^4` / `@vitest/coverage-v8 ^4`, root `npm ci` resolves a single vitest major, and `make perfect-fast` is green.

**Current pins (verified):**

| Package | `vitest` | `@vitest/coverage-v8` |
|---|---|---|
| `wrapper/package.json` | `^4.1.4` | `^4.1.9` |
| `cli/package.json` | `^2.1.0` | `^2.1.9` |
| `mcp/package.json` | `^2.1.0` | `^2.1.9` |

The major split forces a duplicate vitest tree in the single workspace install (wrapper nested 4.x, cli+mcp hoisted 2.x). Not a correctness blocker — each suite passes under its own runner — but a DX smell, and v8-reporter behavior can differ across majors.

**Step 1 — FIND-AND-REPLACE in `cli/package.json`.**
FIND: `    "@vitest/coverage-v8": "^2.1.9",` REPLACE: `    "@vitest/coverage-v8": "^4.1.9",`
FIND: `    "vitest": "^2.1.0"` REPLACE: `    "vitest": "^4.1.4"`

**Step 2 — FIND-AND-REPLACE in `mcp/package.json`** (identical strings as Step 1).

**Verify (1+2):** `grep -h '"vitest"' wrapper/package.json cli/package.json mcp/package.json | sort -u` → one line `"vitest": "^4.1.4"`.

**Step 3 — reinstall + per-package coverage run.**
```
cd clockify-ts-sdk && npm ci
npm test -w @clockify115/cli && npm test -w @clockify115/mcp-server
npm run test -w @clockify115/cli -- --coverage && npm run test -w @clockify115/mcp-server -- --coverage
```
**Verify:** all suites PASS. If the v4 v8-reporter shifts measured lines/branches and a coverage floor fails, re-pin thresholds in each package `vitest.config.ts` AND `docs/coverage-contract.json` in lockstep (dual-authority enforced by `scripts/check-coverage-floor.mjs`).

**Step 4 — full gate.** Run one solo `make perfect-fast` (blank creds) + `make changelog-drift`.
**Verify:** `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast; echo $?` → `0`.

---

### 4c. time-off `note`-required branch — NEEDS-LIVE-KEY (genuinely probe-deferred)

Effort: M (live probe + write-safety re-test). Risk: medium (real time-off mutation). **Done when:** the live 4xx-vs-2xx for missing `note` is recorded under `probes/`, the single masking `as never` is removed (or `note` made required in the Zod input), and `spec/evidence/discrepancies.md` flips this entry from `partial` to compensated.

**Where (verified anchor):** `spec/evidence/discrepancies.md:2290` (`### time-off.change-status.union-and-note — PARTIAL 2026-06-18`; the `note`/`as never` detail is at line 2303). The generated `ChangeTimeOffRequestStatus` marks `note` REQUIRED, but `clockify_time_off_requests_update_status` sets it only when present, with one `as never` masking the mismatch. The status-union half is already fixed (`z.enum(["APPROVED","REJECTED"])`, test `mcp/tests/sweep-fixes.test.ts`); only the note branch is left.

**Plan (key-gated — leave deferred until a time-off live campaign runs).** In a sacrificial sandbox: create a PENDING time-off request, PATCH status once with `note` and once without, record the 4xx-vs-2xx outcome, then either make `note` required in the Zod input or keep it conditional and drop the `as never`. Record the probe under `probes/`, flip the discrepancy from `partial` to compensated, then re-run `make mcp-write-safety` + `npm test -w @clockify115/mcp-server`.
**Verify:** `grep -A2 'time-off.change-status.union-and-note' spec/evidence/discrepancies.md` no longer shows `PARTIAL`; mcp tests PASS.

---

### 4d. `scheduling.calculateUsersTotals` + `projects.archive` — WONTFIX (upstream 404). SKIP.

Both routes return live `404 "No static resource"` (`spec/evidence/discrepancies.md:341`). No TS MCP tool ships; parity is carried by `docs/operation-parity-overrides.json:30` (`putWorkspacesWorkspaceIdProjectsProjectIdArchive` → `clockify_projects_update`). `projects.archive` is covered via `clockify_projects_update({archived:true})`.
**Action:** watch-only — re-probe with a fake-id (404 vs 405) on each upstream refresh; promote in GOCLMCP first if it ever flips. Effort: none until upstream changes.

### 4e. `compose.work-package.ensure-repoint` — WONTFIX (decision, do not reopen). SKIP.

`spec/evidence/discrepancies.md:2252` (`### compose.work-package.ensure-repoint-wontfix — WONTFIX 2026-06-18`). Re-pointing `createWorkPackage` onto `Workspace.ensure*` is a net regression: it drops server-side name/page-size/clients filters, cannot express `upsert:false` always-create, and cannot carry the per-step `undo` compensations `runComposition` needs (`wrapper/compose.ts:39-40`, `:83-92` — undos run in reverse on failure so there are no orphans). Listed only for completeness. Effort: none.

### 4f. wrapper `noImplicitOverride` / `exactOptionalPropertyTypes` — GENERATOR-CHANGE (lives in GOCLMCP). SKIP in-repo.

`spec/evidence/discrepancies.md:2313` (`### strictness.wrapper-eopt-noimplicitoverride-blocked — DOCUMENTED 2026-06-18`). wrapper cannot enable these flags because the errors are in generated `wrapper/src/**` (no-edit hard-stop): `noImplicitOverride` → TS4114 at `src/errors/ClockifyApiError.ts`; `exactOptionalPropertyTypes` → 10 errors across `src/errors/*` and `src/core/request.ts`. Flags stay OFF on wrapper, ON in cli+mcp (`cli/tsconfig.json`, `mcp/tsconfig.json` both set `noImplicitOverride`); rationale pinned in `wrapper/tsconfig.json` `_blockedStrictnessFlags`; the hand-written surface is EOPT-clean and enforced by `scripts/check-consumer-cast-budget.mjs`. Durable fix is the GOCLMCP generator emitting `override` keywords + EOPT-clean optionals, then regenerate. Effort: M, in GOCLMCP. Keep deferred-to-upstream.

### Non-issues (investigated, discarded)

- **W1 live-log `-v` teardown-status auditability gap — RESOLVED.** `cleanupDeleteRaw` (`GOCLMCP/tests/e2e_live_schema_test.go`) now captures the DELETE status and emits a promotable row via `findingsDelete{templatePath,fixture}`; the projects/clients/tags/tasks/time-entries findings files record the real DELETE 200 (captured 2026-06-20). Distinct from the separate `-v` swallow on the *make target* in Item 2 (still open).
- **`deferred-list-endpoints.not-paginated-or-not-live`** — explicitly RESOLVED 2026-05-24 by re-probe. Discard.

---

## Sequencing & realism

**Start here:** **4a** — a single cosmetic FIND-AND-REPLACE (one findings-md row) plus two regen/drift commands. The functional `live-success` promotion already landed upstream (`clockify-openapi.yaml:5112`), so there is no live key, no behavior change, and the YAML must not move. ~5 minutes, zero risk.

Recommended order:

1. **4a** (XS, cosmetic) — do it first to clear the lead item cleanly.
2. **Item 1 reducible subset (Buckets A+B)** — cleanest real win: no live key, no codegen change, behavior-neutral, covered by existing tests; removes ~half the documented KEEP casts and self-documents the consumer surface.
3. **Item 3 killable subset (B1+B4)** — cheap, low-risk, real coverage, then ratchet the two floors.
4. **Item 2 read tier — only with a fresh sandbox key, and do the `-v` make-target fix (Step 0) FIRST.** Then Batch 1 + Batch 2 (~30 ops, low risk, high correctness payoff → ~76/184). Batch 3 opportunistic; Batch 4 on-demand only.
5. **4b** — low-priority consistency cleanup (S–M; risk is purely coverage-threshold re-calibration).
6. **4c** — only inside a time-off live campaign (NEEDS-LIVE-KEY).
7. **Not in-repo / do not schedule:** Item 1 Bucket C and 4f are GOCLMCP generator PRs; 4d is an upstream-404 watch item; 4e is closed by decision.

**What a literal 10/10 costs (and why it is not worth it):** every operation at `live-success` (≈124 promotions, multi-week, key-gated, with a long tail of permission/plan-gated ops that can never reach `live-success` and are correctly tiered today), zero KEEP casts (needs upstream spec params + response schemas in the GOCLMCP generator, re-snapshot, re-codegen), and zero surviving mutants (most are structurally equivalent — a "kill" would assert an implementation accident and make tests brittle). Skip that target.

**What is worth doing:** 4a, Item 1 A+B, Item 3 B1/B4 + floor ratchet, and — given a key — Item 2 read tier (Batches 1–2). That set closes every cheap, real-value gap and leaves the rest accurately recorded as WONTFIX-with-rationale, upstream-generator, or key-gated diminishing-returns work.
