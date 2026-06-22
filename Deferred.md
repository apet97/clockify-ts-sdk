# Deferred / structural work — clockify-ts-sdk

> **HISTORICAL SNAPSHOT (updated 2026-06-22).** All tracked items here have shipped
> (see AGENTS.md §8). Live-success is now **111/184** (was 46/184 when this was
> written); the SDK/GOCLMCP baselines quoted below (SDK HEAD `c84f00e`, GOCLMCP
> `v0.4.5`) are the point-in-time state this plan was written against and are
> retained as historical context. EOPT / noImplicitOverride (Item 4f) is RESOLVED.

Both repos are green and there is no correctness or type-safety hole open here.
`clockify-ts-sdk` is at SDK HEAD **`c84f00e`** (last code/spec-bearing commit
`4323b1b`; `8a29699` + `c84f00e` touch this file only); the sister generator
repo `../GOCLMCP` is at **v0.4.5** (`6f3cd2c`). Both repos sit at **46/184
live-success**. These items buy cleaner code, more verified live shapes, and
dead mutants — not behavior fixes. Do not treat any of this as a bug.

---

## ⟶ For the implementing session — read this first

You are picking up a green codebase. Scope is **only the deferred / structural
items below** — do not invent adjacent work, do not refactor untouched code.

Ground every "current state" claim on this verified surface (re-count if a
number looks stale — do not trust a printed count):

- **46/184 live-success** in `GOCLMCP/docs/openapi/clockify-openapi.yaml`
  (= 124 probe-documented + 14 documented; total 184).
- **92 public SDK names**, **27 subpaths**, **59 CLI commands**, **134 MCP
  tools**.
- **24 cast-operator `as never` sites** under `allowedRequestCastBudget: 0`
  (zero *unannotated* `as never`; every real cast carries a `KEEP as never`).

Validate against **SDK HEAD `c84f00e`** and **GOCLMCP `v0.4.5` (`6f3cd2c`)**.

### Prerequisites

- **Fresh branch off `main`** before any edit:
  `git checkout main && git pull && git checkout -b deferred/<item>`. Never
  commit deferred work onto `main`. For two-repo items (Item 1 Bucket C, Item 2,
  Item 4a) cut a matching branch in `../GOCLMCP` too.
- A **LIVE Clockify sandbox key is required ONLY for the NEEDS-LIVE-KEY items**
  (Item 2, Item 4a's optional live re-decode, Item 4c). The key **rotates** — the
  value in `CLOCKIFY_API_KEY` is very likely dead. **Preflight before any live
  run** and expect HTTP `200`:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: $CLOCKIFY_API_KEY" https://api.clockify.me/api/v1/user
  ```
  A non-200 means the key is dead — STOP, get a fresh **sacrificial sandbox**
  key, do not proceed. The key is used VERBATIM (base64 form), never decoded;
  **never print it** — redact in all output. Optional offline shape check:
  `make sandbox-key-health` (exits 0 on blank creds, never prints the key).
  **Items 1 (A+B), 3, and 4b are fully offline and need no key.**

### Hard stops

- **No hand-edits to generated/snapshot paths**: `wrapper/src/**`,
  `output/ts-sdk/**`, `spec/corrected/**`. Regenerate via `make sdk-codegen`. The
  only sanctioned write to those paths is a refresh-from-canonical guarded by
  `CLOCKIFY_ALLOW_GENERATED_DIFF=1` (enforced by
  `scripts/check-no-generated-edits.mjs:103`); `make sdk-codegen` must run first
  or type-checks fail spuriously. `check-no-generated-edits` is in `perfect-full`.
- **Spec-shape changes go through GOCLMCP**, never this repo. Bucket C (Item 1),
  4f, and any new param/response schema are `../GOCLMCP` generator PRs, then
  re-snapshot here via `cp` + `make sdk-codegen` + `CLOCKIFY_ALLOW_GENERATED_DIFF=1
  make sdk-codegen-drift`.
- **Run BOTH `make perfect-fast` AND `make perfect-full` SOLO with blanked
  creds** for any code/spec change's final proof:
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`, then the same
  prefix for `perfect-full`. They flake under CPU contention (startup-time
  budgets) and the dead key 401s the live suites if creds are set — run nothing
  else concurrently. Capture make's exit code directly (`make ...; echo $?` on
  its own line — a `&&`/`;` compound masks make's real status).
- **Plain commit messages.** No `npm publish`, no `git push --force`, no live
  tests against personal/production workspaces. Commit only when the user asks.
- **Release reality**: the SDK **does NOT release** on a spec/live change. On a
  spec change, **GOCLMCP cuts a patch release** (release.yml on a pushed tag);
  this repo only refreshes the snapshot + re-codegens. Do not touch CI/auth/
  release settings.

### How to know each item is done

Each item carries its own **Done when:** acceptance line, per-step **Verify:**,
and a **Perfect end state** block describing exactly what the code/tests/docs
look like once it lands. Treat Done-when as the gate — do not declare an item
done until its Done-when passes AND the final solo `perfect-fast` +
`perfect-full` are green with blanked creds.

---

## Status legend

| Tag | Meaning |
|---|---|
| **OFFLINE** | No live key, no codegen-shape change. Safe to run in the master workflow. |
| **NEEDS-LIVE-KEY** | Requires a fresh sacrificial sandbox key (preflight 200). Separate keyed workflow. |
| **GENERATOR-CHANGE** | Spec-shape change in `../GOCLMCP`, then re-snapshot here. Separate repo/PR. |
| **WONTFIX** | Closed by decision or upstream-only. Skip on sight; do not reopen. |

Per-item tags:

| Item | Tag |
|---|---|
| 1 Bucket A (list query params) | OFFLINE (after spec carries slots) |
| 1 Bucket B (body fields) | OFFLINE (after spec carries fields) |
| 1 Bucket C (irreducible casts) | WONTFIX (keep `KEEP`) |
| 1 spec-augment (slots/fields) | GENERATOR-CHANGE |
| 2 live-capture campaign | NEEDS-LIVE-KEY |
| 3 B1 + B4 (killable mutants) | OFFLINE |
| 3 A1–A5, B3, B5 (equivalent) | WONTFIX |
| 4a projects-list findings row | OFFLINE (live re-decode optional, NEEDS-LIVE-KEY) |
| 4b vitest skew | OFFLINE |
| 4c time-off note-required | NEEDS-LIVE-KEY |
| 4d archive/calculateUsersTotals | WONTFIX (upstream 404) |
| 4e compose ensure-repoint | WONTFIX (decision) |
| 4f wrapper strictness flags | GENERATOR-CHANGE |

---

## Run this as a workflow

The offline in-repo items (Item 1 A+B, Item 3 B1+B4, Item 4b) are deterministic
and orchestratable end-to-end with the **Workflow tool**. The key-gated items
(Item 2 live campaign, Item 4a's optional live re-decode, Item 4c) and the
**generator change (Item 1 Bucket C, in GOCLMCP)** are **NOT** in this master
script — they run as separate keyed / GOCLMCP workflows (each item below carries
its own "Run as a workflow" block with inputs + gate). The master script
orchestrates ONLY the keyless, single-repo trio and **will not push on red**.

### Master Workflow skeleton (ready to paste, offline trio)

```ts
// deferred-offline.workflow.ts — orchestrates the keyless in-repo items.
// Pre: green main, fresh branch deferred/offline-batch, NO live key needed.
export const meta = {
  name: "clockify-sdk-deferred-offline",
  repo: "/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk",
  head: "c84f00e",                    // re-validate before run; counts may drift
  creds: "BLANK",                     // CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID=''
  solo: true,                         // perfect-fast/full are load-sensitive — run alone
  pushOnRed: false,
};

// Shared agent result schema — every item agent returns this shape.
const itemSchema = {
  item: "string",                     // "1AB" | "3-B1B4" | "4b"
  status: "string",                   // "done" | "blocked" | "failed"
  filesTouched: "string[]",
  verifyOutput: "string",             // the Verify: command stdout, pasted
  green: "boolean",                   // item's own Done-when gate passed
  notes: "string",
};

// Hard gate: refuse to advance / commit / push unless green === true.
function gate(r) {
  if (r.status !== "done" || !r.green)
    throw new Error(`HARD GATE: ${r.item} not green (${r.status}) — STOP, do not commit/push.`);
  return r;
}

// Phase 0 — precheck (no agent): branch off main + baseline counts.
//   git checkout main && git pull && git checkout -b deferred/offline-batch
//   make consumer-cast-budget   => "0 unannotated as never, budget 0"
//   grep -rn "as never" cli/src mcp/src | grep -vE "result.ts|output-schema.ts" | grep -v "// KEEP" | wc -l  => 24

// Phase 1 — Item 1 Buckets A+B (sequential; codegen first).
const r1 = gate(await agent({
  task: "Execute Item 1 Steps 0–5 (Buckets A+B only). make sdk-codegen FIRST. " +
        "Drop casts at entries.ts:217 + users.ts:237; wireBody<T>() the 7 A-wireBody sites; " +
        "sharpen Bucket-C/WONTFIX KEEP comments. " +
        "DO NOT touch Bucket C / WONTFIX response-narrow sites.",
  inputs: { plan: "Deferred.md#item-1", castBaseline: 24 },
  schema: itemSchema,
  // gate: make consumer-cast-budget green; both type-checks 0; both suites pass;
  //       npm run lint -w @clockify115/mcp-server; cast-operator count == 22.
}));

// Phase 2 — Item 3 B1+B4 (independent; simplest sequential on the same branch).
const r3 = gate(await agent({
  task: "Execute Item 3 B1 (dates.ts month/weekday literal tests) + B4 (webhook-url [fec0::1] accept), " +
        "npx stryker run, confirm the 10 targeted mutants flip to Killed, ratchet ONLY measured floors in " +
        "docs/mutation-score-contract.json. DO NOT chase A1–A5/B3/B5 (equivalent).",
  inputs: { plan: "Deferred.md#item-3", floors: "docs/mutation-score-contract.json" },
  schema: itemSchema,
  // gate: targeted mutants Killed in reports/mutation/mutation.json; make mutation green at raised floors.
}));

// Phase 3 — Item 4b vitest unification (lowest priority; coverage recalibration risk).
const r4b = gate(await agent({
  task: "Execute Item 4b: pin cli+mcp vitest to ^4.1.4 / @vitest/coverage-v8 ^4.1.9, npm ci, " +
        "re-run suites + --coverage, re-pin any shifted floors in vitest.config.ts + docs/coverage-contract.json " +
        "in lockstep, note bump in cli/mcp changelogs.",
  inputs: { plan: "Deferred.md#item-4b" },
  schema: itemSchema,
  // gate: one vitest major across all three; suites + coverage pass; make changelog-drift green.
}));

// Phase 4 — FINAL PROOF (no agent; run solo, blanked creds, capture exit codes alone).
//   CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast ; echo $?   => 0
//   CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-full ; echo $?   => 0
//   Only on BOTH 0: surface a commit/PR for the user to approve. Never push on red.
```

**Orchestration rules baked into the script.** Each phase is one subagent with
the shared `itemSchema` return; `gate()` throws (halts the workflow, no
commit/push) unless the item's own Done-when passed and `green===true`. The
final `perfect-fast` + `perfect-full` proof is a no-agent phase run SOLO with
blanked creds — both must exit 0 before any commit is surfaced. `pushOnRed:
false` is load-bearing: a red gate stops the run, it does not "best-effort" push.

### What runs as separate (keyed / GOCLMCP) workflows, NOT in the script above

- **Item 2 live campaign** (NEEDS-LIVE-KEY, two-repo): own keyed workflow.
  Inputs: fresh sandbox key (preflight 200), `CLOCKIFY_LIVE_PREFIX`,
  `CLOCKIFY_LIVE_WORKSPACE_CONFIRM==ws-id`. Gate: `make live-clean-prefix`
  exits 0 (mandatory sweep) + `make openapi-drift` green + higher live-success
  count. See Item 2's own "Run as a workflow" block.
- **Item 4a optional live re-decode** (NEEDS-LIVE-KEY): the cosmetic
  FIND-REPLACE is offline-eligible, but the *live re-decode* of the projects-list
  body is keyed — run only on a fresh key.
- **Item 4c** (NEEDS-LIVE-KEY): runs only inside a real time-off live campaign.
- **Item 1 Bucket C** (GENERATOR-CHANGE, in `../GOCLMCP`): a GOCLMCP generator
  PR (add list query params + body schemas), then re-snapshot here. Gated by
  `perfect-full`'s `goclmcp-drift` + `sdk-codegen-drift`. Separate repo/workflow.

---

## Item 1 — Kill the generator-forced `as never` / wireBody casts

**Status:** NOT a red gate. `make consumer-cast-budget` is **green today**
(`docs/consumer-cast-budget-contract.json` → `allowedRequestCastBudget: 0`, every
real cast carries a `KEEP as never` line). The job is to *eliminate the casts at
their root* so the `KEEP` annotations can be deleted — not to "make the gate
pass".

**Exact current inventory** (re-run to re-validate before you start):
```bash
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk
grep -rn "as never" cli/src mcp/src wrapper/*.ts | grep -v "KEEP as never" | sort      # 29 matches
grep -rn "KEEP as never" cli/src mcp/src wrapper/*.ts | sort                           # 27 matches
```
The "29 non-KEEP" is misleading — it counts **prose** lines (`wrapper/requests.ts:4,28`;
`mcp/src/result.ts:221`) and the **two path-exempt forwarding casts**
(`mcp/src/result.ts:235,242`, exempt via `exemptPathSuffixes:["result.ts","output-schema.ts"]`).
The **27 KEEP-annotated lines are the actual request/body casts** to kill. Each
real cast sits on the line *below* its `KEEP as never` comment (the checker's
`isAnnotated(here, above)` accepts comment-above).

### Root cause (one sentence)

Every cast works around a **generated request *type* narrower than the live wire
shape**: the `*RequestFlattened` / `*RequestBody` interfaces in
`wrapper/src/.../requests/*.ts` are derived 1:1 from the corrected OpenAPI's
`parameters` + `requestBody.schema`, and that spec under-describes these
operations. Proof:
`wrapper/src/api/resources/expenses/client/requests/ListExpensesRequest.ts` is
literally `{ workspaceId: string }` — no `page`/`page-size`/`start`/`end` slot —
so `client.expenses.list({...,page,start})` can only typecheck via `as never`.

### The three buckets (honest)

- **Bucket A — list/search query params missing (8 casts, root-fixable in
  GOCLMCP).** `expenses.list`, `timeOff.list` (POST `/time-off/requests`),
  `webhooks.list`, `invoices.list`, plus their MCP twins. These list ops are
  **absent from `PAGINATED_LIST_OPS`** in GOCLMCP
  (`scripts/gen-clockify-openapi:789`), so they never get `page`/`page-size`
  injected. Adding them (the GENERATOR-CHANGE below) makes the generated request
  type carry the query slots → casts drop.
- **Bucket B — body fields the flattened type omits (most of the 27,
  root-fixable in GOCLMCP).** policy create/update (`mcp/src/tools/timeOff.ts:440,542`),
  invoice replace/status (`invoices.ts:131,207,276,366`), user invite
  (`users.ts:237`, `cli/.../users.ts:78`), time-entry patch (`entries.ts:217`).
  The corrected spec's `requestBody.schema` is missing properties live Clockify
  accepts (e.g. `CreateTimeOffPolicyRequestBody` lacks
  `timeUnit`/`allowNegativeBalance`/`users`/`userGroups`). Add those properties
  in GOCLMCP → regenerate → the `Body` interface gains them → consumer binds
  `ClockifyRequestBody<...>` (already the pattern at `timeOff.ts:427`) with no
  cast.
- **Bucket C — irreducible (~3-5 casts, document, do NOT force-fix; WONTFIX).**
  Genuinely cannot be expressed by the union type without lying about the wire:
  1. **expense create/update multipart `file`** (`mcp/src/tools/expenses.ts:189,238`;
     `cli/.../expenses.ts:155`). The generated `ExpenseCreateRequest` *does*
     include `file?: Blob|File|...`, but the CLI/MCP build a JSON-scalar object
     with a synthetic `changeFields` key + `userId` that isn't in the flattened
     type — a multipart-vs-JSON envelope mismatch the union can't capture. Keep
     `KEEP`.
  2. **time-off policy archive / status PATCH naming** (`timeOff.ts:573`,
     `invoices.ts:276`): the generated method is `updateStatus`/status-named but
     live takes a free `{archived:true}` / status body. Keep `KEEP`.
  3. **time-off ChangeTimeOffRequestStatus mismatch** (`timeOff.ts:267`):
     generated status/note shape ≠ live. Keep `KEEP`. (Item 4c addresses the note
     half under a live key.)

  These keep `wireBody<T>()` (the typed escape in `wrapper/requests.ts:32`) or a
  documented `KEEP as never`. Budget stays 0 because they remain annotated.

### Bucket C — the GENERATOR change (this unblocks A; B is a data-add in the same file)

**File:** `/Users/15x/Downloads/WORKING/addons-me/GOCLMCP/scripts/gen-clockify-openapi`
**Anchor — exact current text** at line 789 (the frozen `PAGINATED_LIST_OPS`
set; last two entries verbatim):
```ruby
  ["get", "/workspaces/{workspaceId}/users"],
  ["get", "/workspaces/{workspaceId}/users/{userId}/managers"]
]).freeze
```
**FIND-REPLACE** (add the missing list ops — back each with a probe per the
file's own rule, line 787-788):
```ruby
  ["get", "/workspaces/{workspaceId}/users"],
  ["get", "/workspaces/{workspaceId}/users/{userId}/managers"],
  ["get", "/workspaces/{workspaceId}/expenses"],
  ["get", "/workspaces/{workspaceId}/webhooks"],
  ["get", "/workspaces/{workspaceId}/invoices"]
]).freeze
```
*(NOTE: `timeOff.list` is POST `/time-off/requests` — a search body, not a
paginated GET; its query slots come from a `requestBody.schema` add, not
`PAGINATED_LIST_OPS`. Handle it in the Bucket-B schema pass.)*

For **Bucket B**, the schema-augment helpers live in the same per-op
finalization region (search `ensure_pagination!`, `stamp_last_page_header!`
around lines 914-936 for the pattern). Add per-op `requestBody.schema.properties`
overlays the same idempotent way `ensure_pagination!` appends params — grounded
against a live probe captured under `addons-me/fern/spec/evidence/probes/` (the
file requires it).

**Verify (GOCLMCP side):**
```bash
cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP && make openapi-drift
```
Confirm the regenerated corrected OpenAPI now shows `page`/`page-size` under the
expenses/webhooks/invoices list ops.

### In-SDK follow-up (casts drop after the spec carries the slots)

1. **Refresh the corrected snapshot** from GOCLMCP (the snapshot at
   `spec/corrected/clockify.corrected.openapi.yaml` is GOCLMCP-owned; do NOT
   hand-edit). Run the GOCLMCP spec emit, copy its output into this repo's
   snapshot, then:
   ```bash
   cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk
   make sdk-codegen          # regenerate output/ts-sdk + wrapper/src; runs pack-snapshot
   ```
   **Verify:**
   `wrapper/src/api/resources/expenses/client/requests/ListExpensesRequest.ts`
   now contains `page?` / `page-size?` (not just `workspaceId`).

2. **Drop the now-redundant casts.** For each A/B site, replace the `as never` +
   its `KEEP` comment with a real bind. Two exact templates:

   **List site** (e.g. `cli/src/commands/expenses.ts:70-71`) — FIND:
   ```
            // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
            const response = (await client.expenses.list(req as never)) as {
   ```
   REPLACE (type `req` as the now-correct request, drop the cast):
   ```
            const response = (await client.expenses.list(req as ClockifyApi.ListExpensesRequest)) as {
   ```
   (declare `req: ClockifyApi.ListExpensesRequest = { workspaceId }` and assign
   optional keys conditionally so EOPT stays clean).

   **Body site** (e.g. `mcp/src/tools/timeOff.ts:439-440`) — FIND:
   ```
                // KEEP as never: policy create reads fields flat, not via generated body envelope.
            } as never);
   ```
   REPLACE (the `body` is already typed
   `ClockifyRequestBody<ClockifyApi.CreateTimeOffPolicyRequest>` at line 427 —
   once the spec carries the fields, the spread typechecks):
   ```
            });
   ```
   **Verify (per edit):** `npm run type-check -w @clockify115/cli` and
   `-w @clockify115/mcp-server` stay green with the cast removed.

3. **Ratchet the annotations.** After each cast drops, delete its
   `KEEP as never` comment line. Leave only the Bucket-C `KEEP`s.

**Verify (whole item):**
```bash
node scripts/check-consumer-cast-budget.mjs        # = make consumer-cast-budget
grep -rc "KEEP as never" cli/src mcp/src wrapper/*.ts   # count fell from 27 to the Bucket-C residue (~3-5)
```
Budget is already 0; this proves the *annotation count fell* (the real win), not
that the gate flipped.

### Perfect end state

- GOCLMCP `gen-clockify-openapi` `PAGINATED_LIST_OPS` includes
  expenses/webhooks/invoices list ops; Bucket-B body schemas carry the live
  fields; each backed by a probe under `addons-me/fern/spec/evidence/probes/`.
- `spec/corrected/clockify.corrected.openapi.yaml` regenerated (not hand-edited);
  `make sdk-codegen-drift` clean.
- `wrapper/src/.../requests/*.ts` for the A/B ops carry the previously-missing
  query params / body properties.
- Bucket A+B `as never` casts removed; their `KEEP as never` comments deleted.
  `grep -rc "KEEP as never" cli/src mcp/src` ≈ 3-5 (Bucket C only), each with an
  accurate, irreducible reason.
- `mcp/src/result.ts:235,242` forwarding casts untouched (path-exempt by design).
- `make consumer-cast-budget` green at budget 0; `type-check`/`test`/`build`
  green for all 3 packages; `make perfect-fast` green (run SOLO with blanked
  creds).
- `docs/consumer-cast-budget-contract.json` `purpose` text updated to reflect the
  lower residue; `spec/evidence/discrepancies.md` gains entries for the
  newly-specced fields.

### Done when

`make consumer-cast-budget` is green at budget 0 with the `KEEP as never` count
reduced to the documented Bucket-C irreducible residue, the corrected spec
carries the new params/fields via GOCLMCP regen (not hand-edit), and `make
sdk-codegen-drift` + per-package `type-check` are clean.

### Run as a workflow

**Phase 1 — Probe & spec (GOCLMCP).** Live-probe the missing slots, then add them
to `gen-clockify-openapi`.
- *Subagent 1a (probe, NEEDS-LIVE-KEY).* Input: sandbox creds. Probes
  `GET /expenses?page=1&page-size=2`, `/webhooks`, `/invoices`, the policy
  create/update/invoice bodies. Writes evidence under
  `addons-me/fern/spec/evidence/probes/`. **Gate:** probe artifacts exist with
  live response shapes.
- *Subagent 1b (generator edit).* Input: 1a probes. Applies the
  `PAGINATED_LIST_OPS` FIND-REPLACE (line 789) + Bucket-B `requestBody.schema`
  overlays. **Gate:** `cd ../GOCLMCP && make openapi-drift catalog-drift` green;
  regenerated spec shows the new params/fields.

**Phase 2 — Snapshot sync + regen (SDK).** Single agent.
- *Subagent 2.* Input: GOCLMCP-regenerated corrected spec. Refreshes
  `spec/corrected/clockify.corrected.openapi.yaml` (via GOCLMCP emit, never
  hand-edit), runs `make sdk-codegen`. **Gate:** `make sdk-codegen-drift` clean;
  `ListExpensesRequest.ts` carries `page`/`page-size`.

**Phase 3 — Cast removal (parallel, per package).** Fan out 3 independent
subagents — no shared state.
- *Subagent 3a (CLI).* Files:
  `cli/src/commands/{expenses,timeoff,users,webhooks}.ts`. Removes A/B casts +
  `KEEP` comments. **Gate:** `npm run type-check -w @clockify115/cli && npm test
  -w @clockify115/cli && npm run lint -w @clockify115/cli`.
- *Subagent 3b (MCP).* Files:
  `mcp/src/tools/{entries,expenses,invoices,timeOff,users}.ts`. Removes A/B
  casts; leaves Bucket-C `KEEP`s. **Gate:** `npm run type-check
  -w @clockify115/mcp-server && npm test -w @clockify115/mcp-server && npm run
  lint -w @clockify115/mcp-server`.
- *Subagent 3c (docs/contract).* Updates
  `docs/consumer-cast-budget-contract.json` `purpose` +
  `spec/evidence/discrepancies.md`. **Gate:** `make consumer-cast-budget` green.

**Phase 4 — Full proof.** Single agent, SOLO.
- *Subagent 4.* `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast;
  echo $?` then `make perfect-full`. **Gate:** both exit 0; `grep -rc "KEEP as
  never" cli/src mcp/src` equals the Bucket-C residue.

**Effort:** Bucket A+B follow-up = S (offline, behavior-neutral). Spec-augment =
M (GOCLMCP PR + probes). **Risk:** low — covered by existing tests; A+B are
type-only changes.

---

## Item 2 — Live-capture campaign (promote probe-documented ops to `live-success`, 46/184 → target)

**NEEDS-LIVE-KEY.** Repo of record: `/Users/15x/Downloads/WORKING/addons-me/GOCLMCP`
(HEAD `6f3cd2c`, v0.4.5). The canonical Clockify OpenAPI is generated there; the
`clockify-ts-sdk` snapshot is a downstream copy. The key rotates — re-preflight
before every run (recipe step 0). **Never print the key; redact.**

### Ground truth (re-verified live this session against `api.clockify.me`)

Op tally in `GOCLMCP/docs/openapi/clockify-openapi.yaml` (op-level
`x-clockify-live-status`): **184 total = 46 live-success + 124 probe-documented +
14 documented**. "46/184" = live-success / total. The 124 probe-documented split
into **30 GETs** (read-side, no cleanup, the easy hot batch) and 94 writes.

Probe-documented GET hot batch (verbatim, sorted):

```
GET /user                                                              [getCurrentUser]
GET /workspaces                                                        [getAllMyWorkspaces]
GET /workspaces/{workspaceId}                                          [getWorkspaceInfo]
GET /workspaces/{workspaceId}/addons/{addonId}/webhooks               [getAddonWebhooksOnWorkspace]
GET /workspaces/{workspaceId}/approval-requests                       [getApprovalRequests]
GET /workspaces/{workspaceId}/expenses                                [getWorkspaceExpenses]
GET /workspaces/{workspaceId}/expenses/{expenseId}                    [getExpenseById]
GET /workspaces/{workspaceId}/expenses/{expenseId}/files/{fileId}     [downloadExpenseReceipt]
GET /workspaces/{workspaceId}/invoices                                [getWorkspaceInvoices]
GET /workspaces/{workspaceId}/invoices/settings                       [getInvoiceSettings]
GET /workspaces/{workspaceId}/invoices/{invoiceId}/export             [exportInvoice]
GET /workspaces/{workspaceId}/invoices/{invoiceId}/payments           [getInvoicePayments]
GET /workspaces/{workspaceId}/member-profile/{userId}                 [getMemberProfile]
GET /workspaces/{workspaceId}/policies                                [getWorkspacesWorkspaceIdPolicies]
GET /workspaces/{workspaceId}/policies/{policyId}                     [getWorkspacesWorkspaceIdPoliciesPolicyId]
GET /workspaces/{workspaceId}/projects/{projectId}/custom-fields      [listProjectCustomFields]
GET /workspaces/{workspaceId}/scheduling/assignments/all             [getAllSchedulingAssignments]
GET /workspaces/{workspaceId}/scheduling/assignments/projects/totals/{projectId}  [getScheduledAssignmentsOnProject]
GET /workspaces/{workspaceId}/scheduling/assignments/users/{userId}/totals        [getUserCapacityTotal]
GET /workspaces/{workspaceId}/time-entries/status/in-progress         [getWorkspacesWorkspaceIdTimeEntriesStatusInProgress]
GET /workspaces/{workspaceId}/time-off/balance/policy/{policyId}      [getBalancesForPolicy]
GET /workspaces/{workspaceId}/time-off/balance/user/{userId}         [getBalanceForUser]
GET /workspaces/{workspaceId}/time-off/policies/{policyId}            [getTimeOffPolicy]
GET /workspaces/{workspaceId}/time-off/requests/{requestId}          [getWorkspacesWorkspaceIdTimeOffRequestsRequestId]
GET /workspaces/{workspaceId}/user-groups                            [findAllGroupsOnWorkspace]
GET /workspaces/{workspaceId}/user-groups/{groupId}                  [getWorkspacesWorkspaceIdUserGroupsGroupId]
GET /workspaces/{workspaceId}/user-groups/{groupId}/users            [getWorkspacesWorkspaceIdUserGroupsGroupIdUsers]
GET /workspaces/{workspaceId}/users                                  [findWorkspaceUsers]
GET /workspaces/{workspaceId}/users/{userId}/managers                [findUserTeamManagers]
GET /workspaces/{workspaceId}/webhooks/{webhookId}/logs              [getWorkspacesWorkspaceIdWebhooksWebhookIdLogs]
```

Probe-documented write ops by domain: invoices 16, projects 13, scheduling 13,
time-off 13, users 10, expenses 8, user-groups 8, policies 6, webhooks 6, user 5,
approval-requests 4, custom-fields 3, member-profile 3, shared-reports 3,
time-entries 3, workspaces 2, plus singletons (clients-archive, holidays-update,
cost-rate, hourly-rate, file/image).

**LIVE-PROBED THIS SESSION** (workspace `65b382b606de527a7ee2b60e` "WORKSPACE") —
proves the recipe and gives real worked examples:

| op | result | promotable? |
|---|---|---|
| `GET /user-groups` `[findAllGroupsOnWorkspace]` | **200**, bare array, 26 items, item `{id,name,workspaceId,userIds[],teamManagers[]}` | YES → live-success |
| `GET /policies` `[getWorkspacesWorkspaceIdPolicies]` | **404** `{"message":"No static resource v1/workspaces/.../policies.","code":3000}` | **NO — phantom path** (generator buckets `code:3000` → `unsupported`). Probe before promoting. |
| `GET /expenses` `[getWorkspaceExpenses]` | **200**, double-nested `{expenses:{expenses:[…],count:2845},dailyTotals,weeklyTotals}` | YES → live-success |
| `GET /member-profile/{userId}` `[getMemberProfile]` | **200**, `{name,email,weekStart,workCapacity,workingDays,workspaceNumber,imageUrl,hasPassword,userCustomFieldValues[…]}` | YES → live-success |
| `GET /time-off/balance/user/{userId}` `[getBalanceForUser]` | **200**, `{count:966,balances:[{id,workspaceId,policyId,policyName,policyTimeUnit,negativeBalanceLimit,…}]}` | YES → live-success |
| `GET /users` `[findWorkspaceUsers]` | **200**, bare array, item `{id,email,name,memberships:[{userId,hourlyRate,costRate,targetId,…}]}` | YES → live-success |

5/6 promotable, 1 phantom — **this is exactly why the recipe probes before
promoting.**

### How promotion works (the flip mechanism — verified in `scripts/gen-clockify-openapi`)

1. The harness `tests/e2e_live_schema_test.go` makes the real GET/POST/PUT/DELETE,
   captures HTTP status, and calls `logFindingsRow(t, method, host, templatePath,
   status, fixture)` (line 752) which emits `t.Logf("| %s | %s | %s | %d | %s |",
   …)` — a markdown table row.
2. `discover_findings` (`gen-clockify-openapi:560`) reads
   `docs/openapi/sources/clockify-api-probe-lab/findings/*.md` + `agent-*.md`,
   parses any 5-cell `| METHOD | host | /path | status | fixture |` row, and
   `status_bucket(status,text)` (line ~427) returns **`live-success` iff `200 ≤
   status < 300`** (a `code:3000`/"No static resource" 4xx → `unsupported`).
3. `choose_live_status` (line 1660) returns `live-success` if any finding bucket
   is `live-success`; else falls back to `probe-documented`.
4. So: **append a 2xx findings row for an op → `make gen-openapi` flips that op to
   `live-success`.** The DELETE-status capture pattern (`cleanupDeleteRaw` +
   `findingsDelete`, lines 685–709) shows the canonical "capture the real cleanup
   status and emit a promotable row only when 2xx" idiom.

### THE `-v` AUDITABILITY FIX (do this FIRST — exact)

The harness rows are `t.Logf`, which Go **only prints with `-v`**. `make
live-contract-local` runs three `go test` lines, **none with `-v`**
(`Makefile:148,151,154`), so every captured findings row is silently swallowed —
you cannot audit which ops returned 2xx. Fix all three:

**FIND** (`Makefile`, in `live-contract-local`, three occurrences) and add `-v`:
```
	go test -tags=livee2e -count=1 -timeout 5m \
```
→
```
	go test -v -tags=livee2e -count=1 -timeout 5m \
```
```
	go test -v -count=1 -timeout 10m ./internal/tools -run '^TestOneUserLive'
```
```
		go test -v -tags=livee2e -count=1 -timeout 10m \
```
**Verify:** `grep -c 'go test -v' Makefile` returns `3` and `grep -n 'go test
-tags=livee2e -count=1' Makefile` returns nothing (no `-v`-less livee2e line
remains).

### Recipe (per batch)

**Step 0 — preflight (key rotates; re-run every session):**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: <REDACTED-KEY>" https://api.clockify.me/api/v1/user   # expect 200
```
**Verify:** prints `200`. If `401`, the key rotated — get a fresh
sacrificial-workspace key (see `GOCLMCP/docs/live-tests.md`) before proceeding.

**Step 1 — probe each candidate op BEFORE promoting** (read-side GET batch first
— no cleanup, lowest risk). For each op substitute
`{workspaceId}`=`65b382b606de527a7ee2b60e` and real ids:
```bash
curl -s -H "X-Api-Key: <REDACTED-KEY>" \
  "https://api.clockify.me/api/v1/workspaces/65b382b606de527a7ee2b60e/<path>" \
  -o /tmp/probe.json -w 'HTTP %{http_code} bytes=%{size_download}\n'
head -c 500 /tmp/probe.json
```
Reports-host ops use `https://reports.api.clockify.me/v1/…`; audit-log uses
`auditlog-api.api.clockify.me/v1`. **A `code:3000`/"No static resource" body =
phantom path → do NOT add a promotion row** (record it in `spec/evidence/
discrepancies.md` style instead, and in GOCLMCP `findings/*.md` as an
`unsupported` note).
**Verify:** each candidate prints a 2xx (promotable) or a 4xx you classify.

**Step 2 — append the worked-example findings rows** to the matching domain file
under `GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/findings/<domain>.md`.
The table format is fixed (see `clients.md:13`): header `| Method | Host | Path |
Status | Fixture |`, a `|---|---|---|---|---|` separator, then one row per op with
`{workspaceId}`/`{userId}` template placeholders (the generator normalizes the
live id back to the placeholder). **Worked 2xx rows from this session's probes**
(drop straight into the right domain files):
```
| GET | api.clockify.me | /workspaces/{workspaceId}/user-groups | 200 | fixtures/live-shape/user-groups-list.json |
| GET | api.clockify.me | /workspaces/{workspaceId}/expenses | 200 | fixtures/live-shape/expenses-list.json |
| GET | api.clockify.me | /workspaces/{workspaceId}/member-profile/{userId} | 200 | fixtures/live-shape/member-profile-get.json |
| GET | api.clockify.me | /workspaces/{workspaceId}/time-off/balance/user/{userId} | 200 | fixtures/live-shape/time-off-balance-user.json |
| GET | api.clockify.me | /workspaces/{workspaceId}/users | 200 | fixtures/live-shape/users-list.json |
```
(Preferred: wire each op into `e2e_live_schema_test.go`'s read-side block so the
harness emits the row itself, then run with `-v` and copy the emitted rows — that
keeps fixtures and rows in lockstep and is auditable. Hand-appended rows are the
fast path for read-only GETs.)
**Verify:** `grep -c '| 200 |' .../findings/<domain>.md` increased by the number
of rows you added.

**Step 3 — regenerate the canonical spec:**
```bash
cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP && make gen-openapi
grep -c 'x-clockify-live-status: live-success' docs/openapi/clockify-openapi.yaml
```
**Verify:** the `live-success` count rose by exactly the number of newly-2xx ops
(was 46); `make openapi-drift` is green (spec is deterministic and regenerated,
not hand-edited).

**Step 4 — run the harness live (auditable) + clean up:**
```bash
cd /Users/15x/Downloads/WORKING/addons-me/GOCLMCP
CLOCKIFY_RUN_LIVE_E2E=1 CLOCKIFY_API_KEY=<REDACTED> CLOCKIFY_WORKSPACE_ID=65b382b606de527a7ee2b60e \
  CLOCKIFY_LIVE_PREFIX=MCP-LIVE-$(date +%Y%m%d%H%M%S) make live-contract-local
# then sweep any prefix objects (writes only):
CLOCKIFY_LIVE_WORKSPACE_CONFIRM=65b382b606de527a7ee2b60e make live-clean-prefix
```
**Verify:** test output now shows the `| METHOD | host | /path | status | fixture
|` rows (because of the `-v` fix); `live-clean-prefix` reports `Leftovers: 0`.

**Step 5 — sync into the SDK snapshot (`clockify-ts-sdk`):**
```bash
cp /Users/15x/Downloads/WORKING/addons-me/GOCLMCP/docs/openapi/clockify-openapi.yaml \
   /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
cd /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk
make sdk-codegen                 # regenerates output/ts-sdk + wrapper/src from the snapshot
make official-openapi-report     # regenerates docs/spec-diff-official.md, spec-confidence.md, live-evidence-index.md
CLOCKIFY_ALLOW_GENERATED_DIFF=1 git add spec/corrected/clockify.corrected.openapi.yaml output/ts-sdk wrapper/src docs/
```
**Note:** `spec/corrected/**`, `output/ts-sdk/**`, `wrapper/src/**` are normally
hard-stop / gitignored; the `CLOCKIFY_ALLOW_GENERATED_DIFF=1` env (the only
accepted bypass, `scripts/check-no-generated-edits.mjs:103`) lets the regenerated
snapshot through the generated-edit gate. **Do not hand-edit the snapshot** — it
must be a verbatim `cp` from GOCLMCP.
**Verify:** `make official-openapi-drift` and `make sdk-codegen-drift` green; `git
diff --stat spec/corrected/` shows only `x-clockify-live-status` lines flipping
`probe-documented`→`live-success` (no shape churn).

**Step 6 — commit both repos** (branch first if on `main`; commit only when
asked).
**Verify:** GOCLMCP `make perfect`-equivalent green; clockify-ts-sdk
`CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast` green (run solo —
startup-budget flake).

### Hot-ops-first batching

1. **Batch A — read-side GETs (30 ops, no cleanup):** the table above. ~5/6
   promote (policies-family is phantom). Highest yield, lowest risk. Start here.
2. **Batch B — list/read writes already partly proven:** user-groups CRUD,
   custom-fields CRUD, expenses CRUD, holidays-update, member-profile updates —
   many have findings already in `findings/SUMMARY.md` changes #1–#27; just need a
   2xx capture row.
3. **Batch C — scheduling/time-off/invoices writes (mutating):** require
   `CLOCKIFY_LIVE_HAPPY_PATH_CAMPAIGNS=1` + `CLOCKIFY_LIVE_WORKSPACE_CONFIRM` and
   full prefix-sweep cleanup. Lowest priority; many need correct body shapes from
   SUMMARY.md (e.g. `createHoliday` needs `datePeriod`+`users.ids`;
   `createCustomField` type enum is `TXT`/`DROPDOWN_SINGLE`; shared-reports use
   `type`/`filter` not `reportType`/`filters`).
4. **Skip / quarantine:** any op returning `code:3000` (confirmed: `GET
   /policies`, `GET /policies/{policyId}` per SUMMARY) — phantom, bucket
   `unsupported`.

### Perfect end state

- `GOCLMCP/Makefile`: all three `live-contract-local` `go test` invocations carry
  `-v`; harness findings rows are visible in CI/local logs.
- `GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/findings/*.md`: each
  newly-promoted op has a `| METHOD | host | /templatePath | 2xx | fixture |` row
  backed by a real probe; phantom ops carry an `unsupported`/`code:3000` note.
- `GOCLMCP/docs/openapi/clockify-openapi.yaml`: regenerated;
  `x-clockify-live-status: live-success` count = 46 + (#newly-2xx ops);
  `probe-documented` drops correspondingly; `make openapi-drift` + `make perfect`
  green.
- `clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml`: verbatim `cp`
  of the GOCLMCP spec; `output/ts-sdk` + `wrapper/src` regenerated;
  `docs/spec-diff-official.md`/`spec-confidence.md`/`live-evidence-index.md`
  refreshed; `official-openapi-drift` + `sdk-codegen-drift` green; diff is
  live-status-only, no method/shape churn.
- `AGENTS.md`/`CHANGELOG.md` (GOCLMCP) updated with the new `live-success` count
  and wave (mirroring the "41 to 46" entries).

### Done when

`live-success` count in `GOCLMCP/docs/openapi/clockify-openapi.yaml` has risen
from 46 by exactly the number of ops that returned a verified 2xx; the SDK
snapshot is a verbatim re-sync; both repos' gates are green; and zero prefix
leftovers remain in the sacrificial workspace.

### Run as a workflow

**Phase 1 — auditability fix (no live key).** Agent `fix-verbosity`: input =
`GOCLMCP/Makefile`; action = add `-v` to the three `live-contract-local` `go
test` lines; gate = `grep -c 'go test -v' Makefile == 3` and no `-v`-less livee2e
line.

**Phase 2 — probe + capture (NEEDS-LIVE-KEY, read-side Batch A first).** Agent
`probe-reads`: input = the 30-GET table + key (redacted) + ws
`65b382b606de527a7ee2b60e`; action = curl each op, record status+shape; gate =
every op classified 2xx-promotable or 4xx-quarantined, worked-example JSON saved.
Fan out one subagent per domain (user-groups, expenses, member-profile, time-off,
users, scheduling, invoices, approval-requests, webhooks) — independent, no shared
state.

**Phase 3 — findings rows + regen (depends on Phase 2).** Agent `write-findings`:
input = Phase 2 status table; action = append `| METHOD | host | /templatePath |
2xx | fixture |` rows to matching `findings/<domain>.md` (or wire the op into
`e2e_live_schema_test.go` read block); then `make gen-openapi`; gate =
`live-success` count rose by exactly #2xx ops, `make openapi-drift` green.

**Phase 4 — live harness proof + cleanup (NEEDS-LIVE-KEY).** Agent `run-harness`:
input = live env + fresh `CLOCKIFY_LIVE_PREFIX`; action = `make
live-contract-local` (now `-v`, rows visible) then `make live-clean-prefix`; gate
= rows present in output, `Leftovers: 0`.

**Phase 5 — SDK sync (no live key).** Agent `sync-sdk`: input = regenerated
`GOCLMCP/docs/openapi/clockify-openapi.yaml`; action = `cp` into the SDK snapshot,
`make sdk-codegen`, `make official-openapi-report`, stage with
`CLOCKIFY_ALLOW_GENERATED_DIFF=1`; gate = `official-openapi-drift` +
`sdk-codegen-drift` green, diff is live-status-only.

**Phase 6 — gate + commit (no live key; commit only if asked).** Agent
`finalize`: input = both repos; action = GOCLMCP `make perfect`, clockify-ts-sdk
solo `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`, bump
AGENTS/CHANGELOG counts; gate = both green; commit per repo on a branch.

Phases 1→2→3→4→5→6 are sequential; within Phase 2 the per-domain probe subagents
run in parallel.

**Effort:** Phase 1 = XS (offline). Read-tier Batches A+B = M (~30 ops → ~76/184).
Batch C = L (mutating, on-demand). **Risk:** read side none; write side medium
(real mutations — mandatory prefix sweep).

---

## Item 3 — Surviving / equivalent mutants in the mutation suite

**Status:** small **KILLABLE** subset (B1 + B4 — offline, test-only, ~30 min), the
rest **WONTFIX-equivalent** with per-item reasons. The checker
(`scripts/check-mutation-score.mjs`, `make mutation`) excludes `NoCoverage` and
counts only `Survived` against monotonic-up floors in
`docs/mutation-score-contract.json` — so the job is **kill the killable, then
ratchet the two moved floors to the measured integer**. Never lower a floor;
never chase an equivalent mutant (a "kill" would assert an implementation
accident and make tests brittle).

> Anchor note: GOCLMCP `getWorkspaceProjects` `live-success` stamp moved to
> `clockify-openapi.yaml:167` (operationId still at `:4813`) — the YAML re-sorted,
> the stamp is intact. All SDK mutation anchors (B1/B4) still match verbatim.

**Perfect end state.** After B1+B4 + a Stryker re-run: the 8 `dates.ts`
`StringLiteral` survivors (`L22` ×3 tue/thu/sat, `L33-37` ×5 aug→dec) and the 2
`webhook-url.ts` `L189` survivors (`EqualityOperator first < 0xfebf`,
`ConditionalExpression→true`) all read `Killed` in
`wrapper/reports/mutation/mutation.json`. `wrapper/tests/dates.test.ts` carries 2
new `it` blocks (every-month-name, every-weekday-name);
`wrapper/tests/webhook-url.test.ts` asserts `[fec0::1]` is accepted.
`docs/mutation-score-contract.json` floors for `wrapper/dates.ts` (84→measured)
and `wrapper/webhook-url.ts` (80→measured-or-unchanged) raised **only** to the
integer floor of the actual post-run score. `make mutation` green at the raised
floors. Every WONTFIX item left untouched with rationale intact. **Net: 10 fewer
surviving mutants, 0 brittle assertions.**

**Done when:** the 10 named survivors flip to `Killed` after `cd wrapper && npx
stryker run`, the two moved floors are ratcheted to their measured integers, and
`make mutation` exits 0.

### Survivor source of truth

Report: `wrapper/reports/mutation/mutation.json` +
`mcp/reports/mutation/mutation.json`. Reproduce any file's survivor list:

```bash
cd wrapper && node -e 'const r=require("./reports/mutation/mutation.json");
const k=Object.keys(r.files).find(x=>x.endsWith("dates.ts"));
for(const m of r.files[k].mutants.filter(m=>m.status==="Survived"))
  console.log("L"+m.location.start.line+":"+m.location.start.column,m.mutatorName,JSON.stringify(m.replacement));'
```
**Verify:** prints lines including `L22:39 StringLiteral`, `L33:5`…`L37:5
StringLiteral` (the killable set) plus the `L195/L221` quarter guards
(equivalent).

### KILLABLE — do these

#### B1 — `dates.ts` month-name + weekday string literals (8 real kills)

- `MONTHS` array (`dates.ts:25-38`): `L33 "august"`, `L34 "september"`, `L35
  "october"`, `L36 "november"`, `L37 "december"` — `StringLiteral→""`. Untested as
  parse inputs.
- `WEEKDAYS` array (`dates.ts:22`): col 39 `"tuesday"`, col 63 `"thursday"`, col
  85 `"saturday"` — `StringLiteral→""`. Untested (only sun/mon/wed/fri exercised).

Mutating any to `""` makes `parseMonthNameDay`/the weekday `indexOf` fail that
word; no current test parses those words, so the mutant survives. Each new
assertion parses the exact word and pins the result.

**Edit `wrapper/tests/dates.test.ts`** — append after the `"Mar 9"` test (anchor
`dates.test.ts:73-75`).

FIND (verbatim):
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

    it("parses every month name (kills MONTHS literal mutants Aug-Dec)", () => {
        expect(resolveRelativeDay(NOW, { date: "August 15" })).toBe("2026-08-15");
        expect(resolveRelativeDay(NOW, { date: "September 7" })).toBe("2026-09-07");
        expect(resolveRelativeDay(NOW, { date: "October 3" })).toBe("2026-10-03");
        expect(resolveRelativeDay(NOW, { date: "November 9" })).toBe("2026-11-09");
        expect(resolveRelativeDay(NOW, { date: "December 25" })).toBe("2026-12-25");
    });

    it("matches every weekday name (kills WEEKDAYS literal mutants tue/thu/sat)", () => {
        // NOW is Monday 2026-06-15; bare weekday = next occurrence on/after today.
        expect(resolveRelativeDay(NOW, { date: "tuesday" })).toBe("2026-06-16");
        expect(resolveRelativeDay(NOW, { date: "thursday" })).toBe("2026-06-18");
        expect(resolveRelativeDay(NOW, { date: "saturday" })).toBe("2026-06-20");
    });
```
`NOW = 2026-06-15T12:00:00Z` (Monday — `dates.test.ts:6`). The weekday targets
follow the existing `"wednesday"→2026-06-17` rule (`dates.test.ts:32`): today
counts, advance forward → tue=16, thu=18, sat=20.

**Verify (before commit):** `npm run build -w clockify-sdk-ts-115 && node -e
'const {resolveRelativeDay}=require("./wrapper/dist/cjs/dates.js");const N=new
Date("2026-06-15T12:00:00Z");for(const d of
["tuesday","thursday","saturday"])console.log(d,resolveRelativeDay(N,{date:d}))'`
prints `tuesday 2026-06-16 / thursday 2026-06-18 / saturday 2026-06-20`. Then `npm
test -w clockify-sdk-ts-115` passes.

**Done when:** the 8 literal survivors (`L22` ×3, `L33-37` ×5) read `Killed` after
a Stryker re-run.

#### B4 — `webhook-url.ts` IPv6 link-local upper bound (1 real kill)

Source (`webhook-url.ts:189`): `if (first >= 0xfe80 && first <= 0xfebf) return
"link-local range (fe80::/10)";`. Survivors at L189: `EqualityOperator first <
0xfebf` and `ConditionalExpression→true`. Existing `[fe80::1]` rejection
(`webhook-url.test.ts:62`) does NOT kill them (`fe80` is in-band under original
and mutant). The kill needs an address **just above** the band asserted
**accepted**: `[fec0::1]` → `first=0xfec0 (65216) > 0xfebf (65215)` → original
returns no reason (accepted); the `<=0xfebf→true` mutant flags it link-local
(rejected).

**Edit `wrapper/tests/webhook-url.test.ts`** — anchor `webhook-url.test.ts:77-79`.

FIND (verbatim):
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
        // so it must be accepted — pins the link-local UPPER bound at webhook-url.ts:189.
        expect(validateWebhookUrl("https://[fec0::1]/hook").ok).toBe(true);
    });
```
**Verify:** `npm test -w clockify-sdk-ts-115` passes. **Done when:** both `L189`
survivors read `Killed`.

> The other `webhook-url.ts` L106-195 IPv6 internals stay equivalent — they
> collapse to the same outer accept/reject verdict the existing fixtures already
> pin. Do NOT chase them.

### Ratchet the floors (ONLY after Stryker confirms `Killed`)

`docs/mutation-score-contract.json` is monotonic-up. Read the new per-file
`mutationScore` from the Stryker summary (or `reports/mutation/mutation.json`) and
set each floor to the **integer floor at or just below** it — never a guess:

- `wrapper/dates.ts`: `"wrapper/dates.ts": 84` → raise to the measured integer (B1
  kills 8 of 42 survivors on a 327-mutant file → expect ≈86-88).
- `wrapper/webhook-url.ts`: `"wrapper/webhook-url.ts": 80` → B4 adds 1 kill on a
  59-survivor file; the score barely moves — raise to `81` **only if it crossed
  the integer**, otherwise leave `80`.

**Verify:** `make mutation` exits 0 at the raised floors (a too-high floor reds
the gate).

```bash
cd wrapper && npx stryker run            # regenerates reports/mutation/mutation.json (~minutes)
node -e 'const r=require("./reports/mutation/mutation.json");
for(const f of ["dates.ts","webhook-url.ts"]){const k=Object.keys(r.files).find(x=>x.endsWith(f));
console.log(f, r.files[k].mutants.filter(m=>m.status==="Survived").length+" survived");}'
cd .. && make mutation
```

### WONTFIX-WITH-RATIONALE (verified equivalent — do NOT add tests)

- **`dates.ts` quarter rollover `L195`/`L221` (`if qm<0`/`if qm>11`) [A1]:**
  `resolvePeriod(now,…)` takes explicit `now` and the rollover tests already exist
  (`dates.test.ts:137-151`). JS `Date.UTC` absorbs the out-of-range month:
  `Date.UTC(2026,-3,1)===Date.UTC(2025,9,1)===2025-10-01`. Skipping the guard
  yields the identical date — structurally equivalent.
- **`confirmation.ts` TTL `L53`/`L64` (`>=` boundary) [B5]:** the controllable-`now`
  TTL suite already exists (`confirmation-store.test.ts:24-68`, boundary assert
  L42). The `L53` check inside `validate` is **dead behind `pruneExpired()`**
  (L47): at/after expiry the token is pruned, `tokens.get` returns undefined, the
  throw fires at L50, so `L53` never runs. `L64` uses the identical comparison, so
  its boundary mutant is masked. Unreachable to kill.
- **`confirmation.ts` default-TTL `L30` (`options.ttlMs && …>0` / `5*60*1000`)
  [B5]:** survivors exist only because every test passes an explicit `ttlMs`.
  Killing needs a no-arg-TTL construct asserting the 5-minute default — low value,
  brittle to the magic number. Skip.
- **`errors.ts` L81-84 conditional spreads [A2]** (`ConditionalExpression→true`
  ×4): base `ClockifyApiError` assigns `this.statusCode = opts.statusCode`
  unconditionally, so `{statusCode:undefined}` and `{}` produce identical
  instances. A kill needs `Object.hasOwn(err,"statusCode")===false`, which the SDK
  contract does not promise. Equivalent.
- **`errors.ts` `Error.captureStackTrace?` guards [A3]** (L124/137/…/269 `→true`):
  the method always exists on Node; asserting `.stack` frame shape is brittle.
  Equivalent.
- **`composed-fetch.ts` timing arithmetic [A4]** (`Date.now()-start`↔`+start`,
  `attempt-1`): `durationMs` feeds only spied hooks; wall-time ≈0ms under tests,
  so nothing constrains the value without a flaky clock band. Equivalent.
- **`iter.ts` L205/L219 terminator guards [A5]** (`hasWithRawResponse`
  `value!=null→true`; `parseLastPageHeader` `"false"` branch): 100%-covered; the
  other exit condition makes the outcome identical (the `false` header and an
  absent header both fall to the length heuristic). File already 97.5% vs floor
  95. Marginal — skip.
- **MCP `result.ts` / `confirm-guard.ts` `ObjectLiteral→{}` / string /
  `length>0→>=0` survivors [B3]** (`result.ts` L118-147/184-193,
  `confirm-guard.ts` L60-107): mutate optional receipt fields
  (`entity`,`ids`,`changed`,`warnings`,`next`) to empties or flip `length>0` to
  `>=0`; receipt tests assert presence/structure, not the omit-when-empty branch
  or exact prose. Pinning every empty-omission over-fits tests to copy. Skip.

> **NoCoverage ≠ equivalence.** `composed-fetch.ts` (51) and `webhook-url.ts` (18)
> carry large `NoCoverage` buckets — real coverage gaps, excluded from the floor,
> tracked separately by `scoreAll`. Out of scope for this item.

### Run as a workflow

| Agent | Inputs | Does | Gate |
|---|---|---|---|
| `B1-dates` | `wrapper/tests/dates.test.ts:73-75` | Insert 2 `it` blocks (month + weekday); build-verify weekday targets | `npm test -w clockify-sdk-ts-115` PASS |
| `B4-webhook` | `wrapper/tests/webhook-url.test.ts:77-79` | Insert `[fec0::1]` accept assertion | `npm test -w clockify-sdk-ts-115` PASS |
| `R-ratchet` | `wrapper/reports/mutation/mutation.json`, `docs/mutation-score-contract.json` | `cd wrapper && npx stryker run`; read measured `dates.ts`/`webhook-url.ts` scores; raise those two floors to the integer floor | the 10 named survivors read `Killed`; `make mutation` exit 0 |

B1 + B4 are independent (parallel-safe on isolated branches; simplest sequential
on the same branch). `R-ratchet` depends on both.

**Effort:** XS-S (offline, test-only, ~30 min). **Risk:** low — new tests only; a
too-high floor is the one failure mode (read measured, never guess).

---

## Item 4 — Cross-repo deferred loose ends (4a–4f)

**Status:** 4a is a clerical 1-line cosmetic edit (the functional promotion
already landed upstream). 4b is offline cleanup; 4c is NEEDS-LIVE-KEY; 4d/4e/4f
are WONTFIX / GENERATOR-CHANGE.

### 4a — GOCLMCP projects-list findings row stale at `TODO-live-2xx`. QUICK WIN (cosmetic, OFFLINE)

Effort: XS. Risk: none. **Done when:** `findings/projects.md` row reads `200`,
that file's `TODO-live` count drops **2→1** (prose-only, matching siblings), the
YAML is unchanged, and the GOCLMCP + SDK drift gates stay green.

**Reality check (re-validated).** `getWorkspaceProjects` (operationId
`clockify-openapi.yaml:4813`) already carries `x-clockify-live-status:
live-success` — now at **line 167** (it was 5112; the YAML re-sorted). The
SDK-visible contract is correct and the drift gate
`TestGeneratedOpenAPIIgnoresPendingLiveFindingRows` (`tests/doc_parity_test.go:261-266`,
which only scans the YAML for the literal `TODO-live`) is green.

```
$ cd GOCLMCP && grep -n "x-clockify-live-status: live-success" docs/openapi/clockify-openapi.yaml | head -1
167:      x-clockify-live-status: live-success
```
**Regen-stable (no live re-run needed).** `scripts/gen-clockify-openapi` (Ruby)
reads the existing stamp as `source_live_status` and `choose_live_status` returns
`"live-success"` if any bucket includes it, so it round-trips every `make
gen-openapi`. The findings `TODO-live-2xx` row contributes **no** bucket:
`extract_status("TODO-live-2xx")==nil` (regex `\b([1-5][0-9][0-9])\b`; `2xx` has
no 3-digit token):
```
$ ruby -e 'def es(r);t=r.to_s[/\b([1-5][0-9][0-9])\b/,1];t&.to_i;end; p es("TODO-live-2xx"); p es("200")'   # => nil / 200
```
The list-GET 200 body is also already live-decoded into `clockify.Project` with no
unknown fields by `TestLiveRawClockifyReadSideSchemaDiff`
(`tests/e2e_live_schema_test.go:45-48`). **The only stale artifact is the
human-facing scaffold row**, which still says `TODO-live-2xx` while its 4 siblings
(clients/tags/tasks/time-entries) say `200`. Fixtures (`fixtures/live-shape/*.json`)
are gitignored and absent on disk; the fixture column is documentary, so changing
the status column is safe.

**Step 1 — FIND-AND-REPLACE in
`GOCLMCP/docs/openapi/sources/clockify-api-probe-lab/findings/projects.md` (line
12).**

FIND (verbatim):
```
| GET | api.clockify.me | /workspaces/{workspaceId}/projects | TODO-live-2xx | fixtures/live-shape/projects-list.json |
```
REPLACE:
```
| GET | api.clockify.me | /workspaces/{workspaceId}/projects | 200 | fixtures/live-shape/projects-list.json |
```
**Verify:** `cd GOCLMCP && [ "$(grep -c TODO-live
docs/openapi/sources/clockify-api-probe-lab/findings/projects.md)" = 1 ] && echo
OK` → `OK` (the single remaining hit is the L7 prose scaffold sentence).

**Step 2 — regen + drift (the YAML must NOT change).**
```
cd GOCLMCP && make gen-openapi && git diff --quiet docs/openapi/clockify-openapi.yaml && echo YAML-UNCHANGED && make openapi-drift
```
**Verify:** prints `YAML-UNCHANGED`; `openapi-drift` exits 0 with no `is stale`
line.

**Step 3 — confirm stamp + pending-row gate.**
```
cd GOCLMCP && grep -n "x-clockify-live-status: live-success" docs/openapi/clockify-openapi.yaml | grep -q ':167:' && echo STAMP-OK
go test ./tests -run TestGeneratedOpenAPIIgnoresPendingLiveFindingRows
```
**Verify:** prints `STAMP-OK`; `go test` → `ok` (PASS).

**Step 4 — SDK-side drift gate (from clockify-ts-sdk root; requires `../GOCLMCP`).**
```
cd clockify-ts-sdk && make goclmcp-drift
```
**Verify:** exit 0. (Part of `make perfect-full`, not `perfect-fast`.)

**Perfect end state.** `findings/projects.md` row reads `200`; its `TODO-live`
count is 1 (prose only), matching all four siblings. `clockify-openapi.yaml:167`
still reads `live-success` and `git diff --quiet` on the YAML exits 0 after regen.
`openapi-drift`, the pending-row `go test`, and SDK `make goclmcp-drift` all green.
No SDK change, no live key.

> Optional, NEEDS-LIVE-KEY, do NOT block: re-decode the live body with `cd GOCLMCP
> && CLOCKIFY_RUN_LIVE_E2E=1 CLOCKIFY_LIVE_PREFIX=<prefix> go test ./tests -run
> TestLiveRawClockifyReadSideSchemaDiff -v` (already GETs `…/projects` +
> `assertNoUnknownFields[clockify.Project]`). Not required — the stamp is already
> `live-success`.

### 4b — vitest major-version skew: wrapper on 4.x, cli+mcp on 2.x. OFFLINE cleanup

Effort: S–M. Risk: medium (coverage-threshold drift). **Done when:** all three
packages pin `vitest ^4` / `@vitest/coverage-v8 ^4`, root `npm ci` resolves a
single vitest major, and `make perfect-fast` is green.

**Current pins + resolved tree (verified):**

| Package | `vitest` (pin) | `@vitest/coverage-v8` | resolves to |
|---|---|---|---|
| `wrapper/package.json` | `^4.1.4` | `^4.1.9` | `vitest@4.1.9` (nested in `wrapper/node_modules`) |
| `cli/package.json` | `^2.1.0` | `^2.1.9` | `vitest@2.1.9` (root-hoisted) |
| `mcp/package.json` | `^2.1.0` | `^2.1.9` | `vitest@2.1.9` (root-hoisted) |

The split forces a duplicate vitest tree in the single workspace install. The
subtle risk: `@stryker-mutator/vitest-runner@9.6.1` (in `wrapper`) **dedupes to
`vitest@2.1.9`**, so wrapper's mutation run executes on the v2 runner against
v4-authored tests. Not a correctness blocker today (each suite passes under its
own resolver) but a real DX/consistency smell, and the v8 coverage reporter can
shift line/branch counts across majors.

**Step 1 — FIND-AND-REPLACE in `cli/package.json`.**
FIND: `    "@vitest/coverage-v8": "^2.1.9",` REPLACE: `    "@vitest/coverage-v8":
"^4.1.9",`
FIND: `    "vitest": "^2.1.0"` REPLACE: `    "vitest": "^4.1.4"`

**Step 2 — FIND-AND-REPLACE in `mcp/package.json`** (identical two strings).

**Verify (1+2):** `grep -h '"vitest"' wrapper/package.json cli/package.json
mcp/package.json | sort -u` → one line `"vitest": "^4.1.4"`.

**Step 3 — reinstall + per-package coverage run.**
```
cd clockify-ts-sdk && npm ci
npm test -w @clockify115/cli && npm test -w @clockify115/mcp-server
npm run test -w @clockify115/cli -- --coverage && npm run test -w @clockify115/mcp-server -- --coverage
npm ls vitest    # expect a single 4.x line, no 2.x dedupe
```
**Verify:** all suites PASS; `npm ls vitest` shows one major. If the v4 v8-reporter
shifts measured lines/branches and a floor fails, re-pin thresholds in **each**
package `vitest.config.ts` **AND** `docs/coverage-contract.json` in lockstep
(dual-authority enforced by `scripts/check-coverage-floor.mjs` — the only
sanctioned floor edit).

**Step 4 — full gate (solo, blank creds).**
```
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast; echo $?
make changelog-drift
```
**Verify:** `perfect-fast` echoes `0`; `changelog-drift` passes after the
`cli`/`mcp` changelogs note the bump.

**Perfect end state.** `grep -h '"vitest"' wrapper/cli/mcp package.json | sort -u`
is one line `"vitest": "^4.1.4"` (same for coverage `^4.1.9`);
`package-lock.json` resolves a single hoisted 4.x tree (no nested dup, runner
included); both suites + `--coverage` pass under v4; any reporter-shifted floors
re-pinned in lockstep; `make perfect-fast` + `changelog-drift` green. Pure
dev-dependency + threshold cleanup, no source/behavior change.

**Run as a workflow.** Single agent `V-skew`: bump cli+mcp pins, `npm ci`,
coverage runs, re-pin shifted floors in `vitest.config.ts`+`docs/coverage-contract.json`
in lockstep, note bump in cli/mcp changelogs. Gate: `npm ls vitest` single major;
solo blank-creds `make perfect-fast` exit 0; `make changelog-drift` PASS.

### 4c — time-off `note`-required branch. NEEDS-LIVE-KEY (genuinely probe-deferred)

Effort: M (live probe + write-safety re-test). Risk: medium (real time-off
mutation). **Done when:** the live 4xx-vs-2xx for a missing `note` is recorded
under `probes/`, the single masking `as never` at `mcp/src/tools/timeOff.ts:267`
is removed (or `note` made required in the Zod input), and the discrepancy flips
from `PARTIAL`→compensated.

**Verified anchor.** `mcp/src/tools/timeOff.ts:260-267` sets `if (args.note)
req.note = args.note;` then calls `ctx.client.timeOff.changeTimeOffRequestStatus(req
as never)` — the generated `ChangeTimeOffRequestStatus` type marks `note`
**REQUIRED**, but the tool sets it only when present; the `as never`
(`timeOff.ts:267`) masks the status/note mismatch. The status-union half is
already fixed (`z.enum(["APPROVED","REJECTED"])`, test
`mcp/tests/sweep-fixes.test.ts`); only the note branch remains. Discrepancy entry:
`spec/evidence/discrepancies.md:2290` (`### time-off.change-status.union-and-note
— PARTIAL 2026-06-18`; note detail at `:2302-2311`).

**Plan (key-gated — only inside a time-off live campaign).** In a sacrificial
sandbox with a fresh key: create a PENDING time-off request, PATCH status once
**with** `note` and once **without**, record the 4xx-vs-2xx outcome under
`probes/`. Then either make `note` required in the tool's Zod input (clean bind)
or keep it conditional and **drop the `as never`**. Flip `discrepancies.md` from
`PARTIAL` to compensated with the recorded outcome.

**Step gate (offline pre-check before the live run):**
```
grep -n "as never" mcp/src/tools/timeOff.ts        # expect exactly the :267 site
npm test -w @clockify115/mcp-server                # baseline green
```
**Verify (post-fix):** `grep -A2 'time-off.change-status.union-and-note'
spec/evidence/discrepancies.md` no longer shows `PARTIAL`; `grep -n "as never"
mcp/src/tools/timeOff.ts` no longer returns the `:267` site; `make
mcp-write-safety` and `npm test -w @clockify115/mcp-server` PASS.

**Perfect end state.** The `union-and-note` discrepancy header reads
compensated/resolved with the probe outcome; the `as never` at `timeOff.ts:267` is
gone; a probe under `probes/` records the live missing-`note` behavior; `make
mcp-write-safety` + mcp tests green. (Also decrements Item 1's spec-gap cast count
by one.)

**Run as a workflow.** Single agent `K-timeoff` (key only): live-probe missing-`note`
4xx/2xx → `probes/`; drop `as never` or require `note`; flip discrepancy. Gate:
`grep "as never" timeOff.ts` no `:267`; `make mcp-write-safety` + mcp tests PASS.

### 4d — `scheduling.calculateUsersTotals` + `projects.archive`. WONTFIX (upstream 404). SKIP.

Both return live `404 "No static resource"` (`spec/evidence/discrepancies.md:341`).
No TS MCP tool ships; parity is carried by `docs/operation-parity-overrides.json`
(`putWorkspacesWorkspaceIdProjectsProjectIdArchive` → `clockify_projects_update`),
and `projects.archive` is covered via `clockify_projects_update({archived:true})`.
**Action:** watch-only — re-probe with a fake-id (404 vs 405) on each upstream
refresh; if a route ever flips to 405 (exists), add it to the **GOCLMCP generator
first**, then re-snapshot — never bolt it on in-repo. `make operation-parity`
stays green. Effort: none until upstream changes.

### 4e — `compose.work-package.ensure-repoint`. WONTFIX (decision, do not reopen). SKIP.

`spec/evidence/discrepancies.md:2252`. Re-pointing `createWorkPackage` onto
`Workspace.ensure*` is a net regression: it drops server-side name/page-size/clients
filters, can't express `upsert:false` always-create, and can't carry the per-step
`undo` compensations `runComposition` needs (`wrapper/compose.ts:39-40`, `:83-92`
— undos run in reverse on failure so there are no orphans). `wrapper/compose.ts`
keeps its direct-create + reverse-undo path; the entry stays `WONTFIX`. Effort:
none.

### 4f — wrapper `noImplicitOverride` / `exactOptionalPropertyTypes`. RESOLVED 2026-06-22 (in-repo, local generator).

`spec/evidence/discrepancies.md` `strictness.wrapper-eopt-noimplicitoverride-blocked`.
The 12 blocker errors (`noImplicitOverride` → TS4114 at `src/errors/ClockifyApiError.ts`
+ `ClockifyApiTimeoutError.ts`; `exactOptionalPropertyTypes` → 10 across `src/errors/*`,
`src/api/errors/*`, `src/core/request.ts`) lived in GENERATED `wrapper/src/**`, but the
templates that emit them are this repo's LOCAL generator
`scripts/generate-sdk-from-openapi.mjs` — NOT GOCLMCP, which owns only the OpenAPI spec
(the earlier "GENERATOR-CHANGE in GOCLMCP" framing was a Fern-era misattribution). Fixed
in that generator (`override` on the `cause` members; explicit `| undefined` on optional
scaffold props; `signal ?? null`); after `make sdk-codegen` the wrapper compiles clean,
both flags are ON, and the hand-written-only EOPT differential in
`scripts/check-consumer-cast-budget.mjs` was retired. Effort: S, in-repo. DONE.

---

## Sequencing & realism

**Order to do things (easiest win → defer key-gated):**

1. **Item 4a** (XS, cosmetic, OFFLINE) — single FIND-AND-REPLACE of one
   findings-md row + two regen/drift commands in GOCLMCP. The `live-success`
   promotion already landed upstream (`clockify-openapi.yaml:167`); the YAML must
   NOT move. ~5 min, zero risk. Clears the lead item.
2. **Item 1, Buckets A+B only** — cleanest real win: no key, no codegen-shape
   change, behavior-neutral, covered by existing tests. Drops 2 casts to clean
   union binds (`entries.ts:217`, `users.ts:237`) + converts 7 to typed
   `wireBody<T>()`. Leave Bucket C alone (upstream GOCLMCP).
3. **Item 3, killable subset B1+B4** — cheap, offline, real coverage; then ratchet
   the two floors in `docs/mutation-score-contract.json` to **measured** integers.
   The rest of Item 3 is WONTFIX (equivalent mutants).
4. **Item 2** — **only when a fresh sandbox key is in hand**, and do the `-v`
   make-target fix (Step 0) FIRST (a green run otherwise harvests zero rows). Then
   read-tier Batches A+B (~30 ops, low risk → ~76/184). Batch C opportunistic;
   skip phantom (`code:3000`) ops.
5. **Item 4b** (vitest skew) low-priority offline cleanup; **Item 4c** only inside
   a real time-off live campaign.
6. **Not scheduled in-repo:** Item 1 Bucket C + 4f are GOCLMCP PRs; 4d is an
   upstream-404 watch item; 4e is closed by decision.

**WONTFIX skip-list (one line):** Item 1 Bucket C + the response-narrow casts ·
Item 3 A1–A5 + B3 (`result.ts`/`confirm-guard.ts` optional-field empties) + B5
(confirmation TTL redundant-guard pair) · 4d (upstream 404) · 4e (net-regression
decision) · 4f (generated-code strictness, upstream). Non-issues already resolved:
W1 teardown-status capture, `deferred-list-endpoints.not-paginated-or-not-live`.

---

## File-wide Perfect end state (both repos, every deferred item closed)

When EVERY non-WONTFIX item lands, the two repos look like this:

- **clockify-ts-sdk** — `grep -rn "as never" cli/src mcp/src | grep -vE
  "result.ts|output-schema.ts" | grep -v "// KEEP"` returns **0**; the
  cast-operator count is **22** (24 − the 2 clean drops), with the 7 A-wireBody
  sites carrying `wireBody<ClockifyApi.…Body>()` and every remaining `as never` a
  Bucket-C/WONTFIX KEEP that names its gap (`TODO(GOCLMCP): …`). `make
  consumer-cast-budget` still prints `0 unannotated as never, budget 0`. 10 fewer
  surviving mutants (8 `dates.ts` literals + 2 `webhook-url.ts:189` flipped to
  `Killed`), floors in `docs/mutation-score-contract.json` ratcheted to
  **measured** integers (`wrapper/dates.ts` ~84→~88; `wrapper/webhook-url.ts`
  80→81 only if it moved). All three packages on **vitest ^4** (single hoisted
  tree). `spec/corrected/clockify.corrected.openapi.yaml` matches the refreshed
  canonical (diff is `x-clockify-live-status` lines only unless a promotion
  surfaced an unknown field). Item 4c's `discrepancies.md` entry reads
  `COMPENSATED`, not `PARTIAL`.
- **GOCLMCP** — `grep -c 'x-clockify-live-status: live-success'
  docs/openapi/clockify-openapi.yaml` reads **≈76/184** (up from 46) once the
  read tier lands; `probe-documented` drops by the same delta, `documented` stays
  **14**, total stays **184**. `findings/projects.md` row 12 reads `200` (no
  `TODO-live` left). The `-v` harvest fix is merged (`go test … -v` ×3 in
  Makefile). `make openapi-drift` / `make perfect-local` green.
- **The residual IS the perfect state, not a defect** — the 14 `documented` ops +
  permission-gated + workspace-state-limited + `PHANTOM_PATHS` are the structural
  live-success floor; Bucket C / 4f are correctly deferred to the GOCLMCP
  generator; the equivalent mutants (A1–A5, B3, B5) stay surviving by design (a
  kill would assert an implementation accident). A literal 10/10 is explicitly not
  worth it.
