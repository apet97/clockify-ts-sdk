# Audit slice A: the SDK package (`wrapper/`)

Repository: `apet97/clockify-ts-sdk` @ `49462f5` (2026-08-06)
Auditor slice: `wrapper/` (package `clockify-sdk-ts-115` 1.0.1)
Date: 2026-08-06. Report path: `.ai-audit/raw/slice-a-wrapper.md` (overwrite allowed).

---

## 1. Scope and commands run

Scope inspected (read, no modifications):
- All hand-written root modules (21): `index.ts`, `create-client.ts`, `composed-fetch.ts`, `iter.ts`, `pagination.ts`, `paginated-list.ts`, `with-response.ts`, `webhooks.ts`, `webhook-url.ts`, `webhook-events.ts`, `errors.ts`, `error-codes.ts`, `deprecation.ts`, `health.ts`, `diagnostics.ts`, `rate-limit.ts`, `request-options.ts`, `operation-receipt.ts`, `money.ts`, `invoice-body.ts`, `dates.ts`, `resolve.ts`, `ensure.ts`, `reports.ts`, `bulk.ts`, `compose.ts`, `expense-list.ts`, `otel-hooks.ts`, `scoped-client.ts`, `requests.ts`, `generated/version.ts` — all read fully.
- `internal/` (4): `routing.ts`, `subdomain-label.ts`, `authenticated-boundary-fetch.ts`, `host-env.ts` — read fully.
- `scripts/` (4): `sync-sdk.mjs`, `verify-dual-build.sh`, `finalize-cjs.sh`, `gen-resource-docs.ts` (sampled via call graph + header; the last was not read line-by-line).
- Generated `src/**` (680 files): read fully — `core/request.ts`, `core/index.ts`, `core/fetcher/*`, `core/headers.ts`, `core/url/index.ts`, `core/logging/index.ts`, `core/json.ts`, `core/base64.ts`, `core/file`, `core/form-data-utils`, `core/runtime`, `auth/HeaderAuthProvider.ts`, `BaseClient.ts`, `Client.ts`, `environments.ts`, `errors/*`, `api/errors/*`, `api/index.ts`, `api/resources/index.ts`, `api/resources/{tags,clients,users,reports,files,approvals,expenses}/client/Client.ts`, request types `{ListApprovals,UpdateClients,TimeEntryCreate,TimeEntryUpdate,UploadImageFiles,DetailedFilter,SummaryFilter,WeeklyFilter,SummaryReportResponse,DetailedReportResponse,Error,ErrorResponse}`; surveyed all 30 resource client folders + `types/index.ts` by grep (baseUrl/service stamps, `bodyFromRequest` key lists, method counts).
- `tests/` (56 test files + 4 `.test-d.ts` + `live-sandbox-support.ts`, ~15,900 lines): read fully — `dual-build`, `mock-clockify`, `sandbox`, `axioms-checklist`, `iter`, `ensure`, `scoped-client`, `authenticated-host-equality`, `routing-matrix-equality`, `generated-baseurl-routing`, `wire-shape-http`, `error-decode-http`, `webhook-events`, `webhook-fixtures`, `live-sandbox-support.ts`; sampled every other file by describe/it inventory + targeted greps.
- Config/docs: `package.json`, all 5 `tsconfig*.json` (json + cjs + esm read; types-bundler/public-package skimmed), `vitest.config.ts`, `stryker.conf.json`, `.size-limit.json`, `typedoc.json`, `.packsnapshot` (full), `.prettierrc`, `.prettierignore`, `.gitignore`, `eslint.config.js` (head), `README.md` (full), `CHANGELOG.md` (head + 1.0.1 entries), `docs/resources/README.md`, `docs/resources/expenses.md` (sample), `examples/README.md` (full), 2 archive-then-delete examples.
- Cross-slice evidence (read-only): `scripts/generate-package-versions.mjs`, `scripts/sdk-codegen/emitter.mjs` (grep), `mcp/src/tools/timeOff/balance-assignments.ts` + `cli/src/commands/balanceAssignment.ts` (grep), root `.gitignore` diff.

Commands executed (all read-only or verification-only):
```
git log --oneline -5; git status --porcelain; git diff .gitignore
find wrapper -type f | grep -v node_modules | grep -v dist/ | sort
wc -l wrapper/tests/*.test.ts
grep -l "baseUrl:" wrapper/src/api/resources/*/client/Client.ts
node -e "<URL canonicalization probes: IPv6 dotted tails, hex/octal IPv4, trailing dots>"
npx tsx -e "<ensure scopeKey collision repro>"
npm run type-check -w clockify-sdk-ts-115          # PASSES clean
npx vitest run tests/ensure.test.ts                 # 19/19 PASS
grep surveys (see §1 scope)
```
No production file was modified. The only pre-existing worktree delta is the root `.gitignore` `/.ai-audit/` entry added by the audit harness before this session.

---

## 2. Inventory observations (facts, not verdicts)

- **Surface**: 680 generated TS files under `src/` (31 public members on `ClockifyApiClient`: 30 resource getters + 1 `fetch` passthrough at `src/Client.ts:77-137`); 168 operations per README/AGENTS; 4 operations carry `baseUrl` overrides (`reports` 10 ops → `https://reports.api.clockify.me/v1`, `auditLogReport` 1 → `https://auditlog-api.api.clockify.me/v1`); all ops stamp `service: "regular"|"reports"|"audit"`.
- **Hand-written surface**: 27 governed package.json subpaths (matches AGENTS.md); root barrel re-exports 93 curated + ~40 pinned "generated-core" names; `webhook-url.ts` is NOT a subpath (reachable only via `./webhooks`); `generated/version.ts` holds `PACKAGE_VERSION = "1.0.1"`.
- **Package**: dual ESM/CJS via twin tsc + `finalize-cjs.sh`; `files: ["dist","README.md","LICENSE"]`; engines `>=22.13.0`; `prepublishOnly` runs sync→type-check→test→build→smoke→pack-consumer-smoke; size-limit budgets for 18 entry points.
- **Tests**: 56 runnable files (~15,900 lines) + 4 type-test files (`test:types` runs `vitest --typecheck.only`, excluded from default `npm test`). Live suites (`sandbox.test.ts`, and cli/mcp equivalents) use `describe.skip` gating. Several tests read generator source files and assert literal content (`authenticated-host-equality.test.ts`, `routing-matrix-equality.test.ts`, `generated-baseurl-routing.test.ts`) — genuine drift gates, not tautologies. Mutation floors exist for 10 hand-written modules (stryker.conf.json `mutate`); notably absent from the mutate list: `resolve.ts`, `expense-list.ts`, `compose.ts`, `bulk.ts`, `webhooks.ts`, `scoped-client.ts`, `paginated-list.ts`, `operation-receipt.ts`, `rate-limit.ts`, `diagnostics.ts`, `health.ts`, `otel-hooks.ts`, `reports.ts`, `error-codes.ts`.
- **Docs**: `docs/resources/README.md` says "30 resources total"; package `README.md:11` says "29 resource modules"; `ClockifyApiClient` has 30 resource getters; `Workspace` scoped client has 29 getters.
- **Oddities**: `wrapper/coverage/coverage-summary.json` and `wrapper/reports/mutation/mutation.json` exist on disk but are gitignored/untracked (stale local artifacts, not shipped).
- **Type-check** of the whole wrapper (incl. tests + examples) passes; `ensure.test.ts` passes 19/19.

---

## 3. Findings table

| ID | Category | Severity | Confidence | One-line claim |
|---|---|---|---|---|
| W-01 | correctness defect | medium | high | `ensure.ts` single-flight keyed by `scopeKey` only; two different names sharing a key coalesce and the second caller receives the FIRST entity (verified by repro) |
| W-02 | incomplete exports / inconsistent ergonomics | medium | high | `Workspace` scoped client omits `balanceAssignment` (29 of 30 generated resources); README count stale |
| W-03 | request/response mismatch | medium–high | high | Two contradictory webhook payload models ship in one package: flat `event`-discriminant union vs envelope `{webhookEvent,payloadType,payload}` fixtures; `constructEvent`'s default type does not match the fixture-documented wire shape |
| W-04 | compatibility risk | medium | high | Generated `RUNTIME` constant reads `process.versions.node` unguarded at module load; `node:crypto`/`node:os`/`Buffer` in root-barrel modules contradict the README's browser-runtime claim |
| W-05 | dead code | low | high | `runWithRetries` post-loop `return lastResponse`/`throw lastError` unreachable; accumulators dead |
| W-06 | unsafe types | low | high | `isRateLimitError`/`isConflictError`/`isInternalServerError`/`isServiceUnavailableError` narrow to subclass types by status, not `instanceof` (documented but unsound; `retryAfterMs` reads as `undefined`) |
| W-07 | misleading abstraction | low | high | `errorCodeEntry(unknownCode)` silently falls back to the `invalid_request` row, yielding wrong recovery/retryable advice |
| W-08 | inconsistent ergonomics | low | medium | `iterPages` docs promise "max 200" page size; no runtime cap enforced |
| W-09 | dead code / packaging | low | high | Four generated core modules (`base64`, `file`, `form-data-utils`, `runtime`) have zero importers yet ship in the tarball |
| W-10 | weak tests / dead config | low | high | `EXPECTED_ROOT_SURFACE_COUNT=93` env var in `verify-dual-build.sh` is never read; `dual-build.test.ts` comment says "17-name baseline" for an 18-entry array |
| W-11 | stale docs | low | medium | README "29 resource modules" vs 30 resources; `docs/resources` says 30 |
| W-12 | misleading receipt | low | high | `runComposition` failure receipts list `created` refs that were already rolled back (only `status.rolledBack` tells them apart) |
| W-13 | stale docs | low | medium | `pagination.ts` doc claims `paginate` honors `Last-Page` via `iterAll`; the adapted callback promise never carries the header, so the length heuristic always applies on this path |
| W-14 | compatibility risk | low | medium | `validateRetryPolicy` (maxRetries integer check) runs per-request, not at `composedFetch()` construction, unlike the documented construction-time POST/PATCH rejection |

---

## 4. Detailed findings

### W-01 — `ensure.ts` single-flight returns the wrong entity when two different names share a `scopeKey` (verified)

- Claim: `findOrCreate`'s in-process single-flight map is keyed by the caller-supplied `scopeKey` string alone (`ensureFlights.get(opts.scopeKey)`), so two concurrent `ensureTag`/`ensureProject`/`ensureClient` calls with the SAME key but DIFFERENT names coalesce onto the first call's operation; the second caller receives the first entity as if it were their own (`created: false`, wrong `id`), and the second name is silently never created.
- Evidence: `wrapper/ensure.ts:48` (`ensureFlights = new Map<string, Promise<...>>`), `:60-69` (get → reuse → set → finally-delete). `Workspace` wrappers are safe because they build `flightKey` = client-token + workspaceId + noun + name (`scoped-client.ts:179-183`, `:191-207`), but the public `ensureTag/ensureProject/ensureClient` accept any caller string.
- Reproduction (executed):
  ```
  npx tsx -e "… Promise.all([ ensureTag({name:'Alpha',scopeKey:'shared-key',…}), ensureTag({name:'Beta',scopeKey:'shared-key',…}) ]) …"
  → result A: Alpha | result B: Alpha | created: Alpha   (B asked for Beta)
  ```
- Impact: silent wrong-entity reuse for direct (non-Workspace) callers; no error, no warning; a tag/project/client id for the wrong name can be written into downstream calls. Tests only cover same-key-same-name coalescing (`tests/ensure.test.ts:18-45`); the collision case is untested.
- Smallest remediation: incorporate name (+noun) into the flight key inside `findOrCreate`, or scope the public API to accept the key but document+enforce uniqueness; either way add a different-name-same-key test.
- Contradictory evidence: none found; `scopeKey` docs ("Concurrent calls with the same key share one operation") do not warn that the key must encode the name.
- Status: **verified** (repro run).

### W-02 — `Workspace` scoped client omits `balanceAssignment`; counts disagree across README/docs/code

- Claim: the generated client exposes 30 resource getters (`src/Client.ts:77-135`, incl. `balanceAssignment` at `:81`), but `Workspace` (`wrapper/scoped-client.ts:100-228`) exposes 29 — `balanceAssignment` is absent (0 occurrences in the file). Package README says "29 resource modules" (`README.md:11`); `docs/resources/README.md` says "30 resources total" and documents `balanceAssignment` (4 methods); CLI (`cli/src/commands/balanceAssignment.ts`) and MCP (`mcp/src/tools/timeOff/balance-assignments.ts`) both call the unscoped `client.balanceAssignment.*`.
- Impact: `ws.balanceAssignment` is `undefined` at runtime (TypeError on use) with no type error (the property is simply absent from the class — TS flags it only when users access it); the "every generated resource getter is scoped" invariant documented at `scoped-client.ts:99-103` is violated; the scoped surface silently diverges from the unscoped one, and README/AGENTS-style resource counts are inconsistent (29 vs 30).
- Smallest remediation: add the `balanceAssignment` getter to `Workspace` (and a `tests/scoped-client.test.ts` assertion that the getter set matches `ClockifyApiClient`'s resource getters — the existing "returns stable scoped resource clients for every generated resource getter" test at `scoped-client.test.ts:111` apparently compares against a hard-coded list, since the gap went unnoticed), and fix the README count.
- Status: **verified** by grep + count.

### W-03 — Contradictory webhook payload models inside one package (typed union vs wire envelope)

- Claim A: `wrapper/webhook-events.ts` models every event as a FLAT payload carrying an `event` discriminant (`ClockifyWebhookEvent` at `webhook-events.ts:589`; e.g. `WebhookEventTagDeleted { event: "TAG_DELETED", id?, name?, … }`), and `constructEvent`'s default return type is that flat union (`webhooks.ts:118`, `constructEvent<TPayload = ClockifyWebhookEvent>` at `:196-213`).
- Claim B: the shipped wire fixtures model the delivery as an ENVELOPE `{ webhookEvent, payloadType, payload }` whose inner payload has NO `event` field (all 4 fixtures: `tests/fixtures/webhook-events/new-time-entry.json`, `timer-stopped.json`, `new-project.json`, `approval-request-status-updated.json` — verified by script: inner keys of new-time-entry are `[billable, description, id, projectId, tagIds, taskId, timeInterval, userId, workspaceId]`), and `webhook-fixtures.test.ts:51` asserts the envelope discriminant (`expect(event.webhookEvent).toBe(payload.webhookEvent)`).
- Additional inner-shape contradiction: the approval type declares `owner: ClockifyWebhookApprovalOwner` (object with `userId`/`userName`/…) while the fixture's inner payload carries `ownerId` (string).
- Impact: a consumer following the documented pattern (`const event = constructEvent({…}); handle(event)` and narrowing on `event.event`, per `webhooks.ts` JSDoc) will read `event.event === undefined` against the fixture-documented wire shape; the "typed discriminated union" is a fiction relative to the envelope. Both tests pass because they never cross-check each other's model.
- Mitigating note: fixtures are explicitly "SYNTHESIZED, not live-probed" (`webhook-fixtures.test.ts:8-14`; open discrepancy `webhook.signature-scheme.shared-secret-not-hmac-doc-only`), and the flat model claims provenance from a reference catalog. Which shape is live truth is unresolved — but the package cannot be correct for both, and the default generic on `constructEvent` is misleading for the envelope shape it documents in its own fixtures.
- Smallest remediation: pick one wire model (probe first), then either type the envelope (`{ webhookEvent, payloadType, payload }` + inner unions) or document that `constructEvent` returns the envelope and the union applies to `payload`; make the two test suites cross-assert one model.
- Status: **verified** (in-repo contradiction; live truth unknown).

### W-04 — Browser/edge runtime claims conflict with unguarded Node-only code in the root barrel

- Claim: `src/core/index.ts:17` executes `process.versions.node` at module load (`export const RUNTIME = { type: "node", version: process.versions.node }`), with no `typeof process` guard — while the wrapper's own `internal/host-env.ts` exists precisely because `process` may be absent or shimmed, and `README.md:1032` claims "Browsers — read-only flows work". Additionally the root barrel transitively imports `composed-fetch.ts` (`node:crypto` `randomUUID`, `node:os` `platform/arch` — `composed-fetch.ts:32-33`) and `webhooks.ts` (`node:crypto` `timingSafeEqual`, `Buffer` — `webhooks.ts:22`, `:207`, `:221-222`).
- Impact: importing `clockify-sdk-ts-115` in a browser/edge bundle without a Node-shim throws (ReferenceError on `process`, or module-not-found on `node:*` specifiers). The README runtime table admits browsers are "not in CI", but the claim "read-only flows work" is not merely untested — it is contradicted by unguarded code reachable from the package root. (Note the guard is in generated code owned by `scripts/sdk-codegen/emitter.mjs`, which is in this repo's scope; `RUNTIME` is also pinned in the smoke surface, so it is load-bearing.)
- Smallest remediation: generate `RUNTIME` via the same guarded host helpers as `host-env.ts` (or delete it and pin the surface), and make the browser claim conditional on bundler shims in the README.
- Status: **verified** by code reading (no browser run performed — would require a bundler).

### W-05 — Dead code at the end of `runWithRetries` (composed-fetch.ts)

- Claim: `composed-fetch.ts:601-605` — `if (lastResponse != null) return lastResponse; throw lastError != null ? toError(lastError) : new Error("composedFetch: exhausted retries …")` — is unreachable: every loop iteration either `continue`s, `return`s, or `throw`s, and the final iteration (`attempt === maxRetries`) must take the `attempt >= policy.maxRetries` return/throw branches. `lastResponse`/`lastError` accumulators are written but never read on any reachable path. (The file's own tests at `composed-fetch.test.ts:1483` "exhaustion with neither response nor error (mutants 237-243)" suggest the authors believed this path reachable — the mutation tests presumably fake it via a fetch that neither resolves nor rejects within the loop… which cannot occur since each iteration awaits one dispatch.)
- Impact: none at runtime; dead branch increases mutation-maintenance surface (the branch exists to satisfy the "no implicit returns" style but is provably unreachable).
- Smallest remediation: delete the tail and the accumulators, and update the mutant-focused tests.
- Status: **verified** by control-flow analysis.

### W-06 — Status-based type guards are unsound by design (documented, still a hazard)

- Claim: `isRateLimitError` returns `err is RateLimitError` but is true for any `ClockifyApiError` with `statusCode === 429` (also 409/500/503 — `errors.ts:471-494`). After narrowing, `err.retryAfterMs` is `undefined` for a base `ClockifyApiError` (the generated client emits no 429 subclass) — exactly the field the guard exists to make available.
- Evidence: `errors.ts:471-473` (`export function isRateLimitError(err: unknown): err is RateLimitError { return err instanceof ClockifyApiError && err.statusCode === 429; }`), with the caveat documented in the JSDoc. The axioms test asserts the narrow path with constructed subclass instances (`axioms-checklist.test.ts:34-41`), so the unsound direction (base error → narrowed) is not exercised.
- Impact: consumers get a typed-but-absent `retryAfterMs`; the SDK's own docs steer users to `getRateLimitFromError` for that, so impact is contained — but the guard contract "narrows to the subclass" is false for the most common (base 429) case.
- Smallest remediation: change the guards to `err is ClockifyApiError`-style predicates with a separate `isPromotedRateLimitError` that checks `instanceof`, or promote inside the guard (side-effect-free alternative: keep semantics, narrow to a structural type that makes `retryAfterMs` optional).
- Status: **verified** by code reading; deliberate per comment — flagged as API-contract risk, not accidental.

### W-07 — `errorCodeEntry` silently substitutes the first row for unknown codes

- Claim: `error-codes.ts:276` — `return CLOCKIFY_ERROR_CODES.find((entry) => entry.code === code) ?? CLOCKIFY_ERROR_CODES[0];` — an unknown code (plain-JS caller, or a code string from a future registry) yields the `invalid_request` row: wrong `recovery` text and wrong `retryable` flag flow out of `recoveryForCode`/`retryableForCode` (`:280-284`) with no error.
- Impact: misleading operational guidance (e.g. a misspelled code tells the operator to "fix request fields" while retryability flips to false/true arbitrarily).
- Smallest remediation: return `undefined` and make callers fall back explicitly, or throw for unknown codes (typed callers cannot hit it).
- Status: **verified** by code reading.

### W-08 — `iterPages` documents a 200-page-size cap that the code does not enforce

- Claim: `IterOptions.pageSize` doc says "Default `50` (matches Clockify's default; max `200`)" (`iter.ts:41-42`); the only validation is `pageSize` positive integer (`iter.ts:230`). A caller passing 500 gets `page-size=500` on the wire; whether the server clamps or 400s is unknown, but the documented contract ("max 200") is not implemented.
- Impact: doc/code mismatch; possible server-side 400s for callers who assume the SDK caps the value.
- Smallest remediation: clamp or validate `pageSize <= 200`, or fix the doc.
- Status: **verified** by code reading (server behavior unverified).

### W-09 — Dead generated core modules ship in the tarball

- Claim: `src/core/base64.ts` (`encodeBase64`), `src/core/file/index.ts` (`Uploadable`), `src/core/form-data-utils/index.ts` (`newFormData`), `src/core/runtime/index.ts` (re-exports `RUNTIME`) have zero importers anywhere in `src/` (grep: the only `core/json` importer is `errors/ClockifyApiError.ts`; the four above have none). They are still emitted to `dist/` and packed (present in `.packsnapshot`, e.g. `dist/esm/src/core/base64.js`), and re-exported… actually they are NOT re-exported by `core/index.ts` (lines 3-17 list the real exports), so they are unreachable-but-shipped rather than public-surface drift. `core/auth/index.ts` is a re-export shim cycle (exports `NoOpAuthProvider` from `../index.js`).
- Impact: ~1 kB of dead bytes in the tarball; noise for reviewers; no runtime effect. Generated-tree hygiene issue (the local emitter should stop emitting them or the sync should prune).
- Smallest remediation: stop emitting in `scripts/sdk-codegen/emitter.mjs`, or prune in `sync-sdk.mjs`, and drop from `.packsnapshot`.
- Status: **verified** by grep.

### W-10 — Dead env var and stale comment in build/test smoke tooling

- Claim: `verify-dual-build.sh:18,33,56` sets/passes `EXPECTED_ROOT_SURFACE_COUNT=93` which the node one-liners never read (the exact-surface check computes `expected` from the two lists and `actual` from `Object.keys`; the constant is unused). `tests/dual-build.test.ts:8` says "the same 17-name baseline" while `EXPECTED_EXPORTS` holds 18 entries.
- Impact: cosmetic; the count constant could rot without any failure.
- Smallest remediation: delete the env var; fix the comment (or derive the count).
- Status: **verified**.

### W-11 — README resource-module count is stale

- Claim: `README.md:11` "29 resource modules"; `docs/resources/README.md` "30 resources total"; `src/Client.ts` has 30 resource getters (incl. `balanceAssignment`); `Workspace` has 29 (see W-02). The README number matches neither the code nor the sibling doc.
- Status: **verified** (see W-02 for counts).

### W-12 — `runComposition` failure receipts include rolled-back entities in `created`

- Claim: on a required-step failure, `runComposition` returns `{ created, …, status: { rolledBack, … } }` where `created` contains every ref ever created (`compose.ts:161`) including those just rolled back (they no longer exist); only `status.rolledBack` (`compose.ts:100`) distinguishes. The `leftBehindNote` helper correctly keys off `rollbackWarnings` only, so the clean-workspace claim is safe — but a caller summarizing `outcome.created` as "created entities" over-reports, and nothing in the type system prevents that.
- Status: **verified** by code reading; design documented in JSDoc — flagged as a receipt-shape footgun, not a logic error.

### W-13 — `paginate` doc overclaims `Last-Page` honoring

- Claim: `pagination.ts:19-22` says it "delegates to iterAll (which walks `page` / `page-size` honoring the `Last-Page` response header, falling back to the 'non-full page' heuristic only when the header is absent…)". The delegation wraps `fetchPage` in a plain promise (`pagination.ts:41-44`), so `iterPages`' `hasWithRawResponse` check (`iter.ts:169-175`) always fails and the header is never consulted on this path; the length heuristic always applies. The doc sentence is true for `iterAll` but misleading for `paginate` itself.
- Status: **verified**; severity low (behavior is the only possible one for the callback shape).

### W-14 — Retry-policy maxRetries validated per-request, not at construction

- Claim: `composedFetch()` merges the policy at construction (`composed-fetch.ts:105-106`) but `validateRetryPolicy` runs inside `composedFetchImpl` per request (`:311`, `:624-626`); `retryPolicy: { maxRetries: 2.5 }` therefore throws on the FIRST REQUEST, not at `composedFetch()` time, while the POST/PATCH rejection (`:450`) is construction-time (as documented). Inconsistent validation timing for the same option object.
- Status: **verified**; low severity.

---

## 5. Contradictions, unknowns, and observed-vs-inferred

### Contradictions (in-repo)
1. **Webhook wire model** (W-03): flat `event`-union vs envelope `{webhookEvent,payloadType,payload}` — the two test suites enshrine opposite models; both green.
2. **Resource counts** (W-02/W-11): README 29 vs docs 30 vs generated 30 vs scoped 29.
3. **Browser support claim** (W-04): README "read-only flows work" in browsers vs unguarded `process.versions.node` + unconditional `node:crypto`/`node:os`/`Buffer` imports in the root barrel. The wrapper's own `host-env.ts` philosophy ("guards for a shimmed or absent process") is not applied to the generated `RUNTIME`.
4. **`iterPages` Last-Page doc vs `paginate` reality** (W-13) and **`pageSize ≤ 200` doc vs no cap** (W-08) — both doc/code.

### Unknowns needing execution/live data
- Which webhook shape is the live truth (needs a real probe; open discrepancy `webhook.signature-scheme.shared-secret-not-hmac-doc-only` in `spec/evidence/discrepancies.md`; fixtures are synthesized).
- Whether `page-size > 200` is clamped or rejected by the live API.
- Whether the `balanceAssignment` omission is deliberate (search of CHANGELOG/AGENTS found no mention; CLI/MCP bypass the scoped client, suggesting oversight rather than intent).
- `wrapper/docs/api/**` (TypeDoc) not reviewed — gitignored, not present in the worktree.

### Observed facts vs inferred responsibilities
- The repo's own governance docs (AGENTS.md) forbid editing `wrapper/src/**` and `spec/corrected/**`; every generated-code finding above (W-04, W-09) must therefore be fixed in `scripts/sdk-codegen/emitter.mjs` (in-repo) per the AGENTS.md §5/§3 chain — consistent with how the repo already handled EOPT fixes ("fixed at their source — this repo's local SDK generator").
- Mutation governance excludes 14 behavior-heavy hand-written modules (resolve, expense-list, compose, bulk, webhooks, scoped-client, …) from the stryker `mutate` list; the AGENTS.md contract ("active mutate sources and moduleFloors must map one-to-one") treats this as deliberate. Not a defect per the contract, but those modules' tests are the only safety net — the audit found no coverage gaps there beyond W-01's untested collision and W-06's untested base-error narrowing.
- The `.packsnapshot` is the pack gate; the W-09 dead files are present in it, i.e. the pack gate currently blesses them.

### Things verified as sound (checked, no finding)
- `webhook-url.ts` SSRF guard: verified against Node's WHATWG URL parser that all IPv4/IPv6 bypass spellings (`0x7f.0.0.1`, `0177.0.0.1`, `2130706433`, `127.1`, `::ffff:10.0.0.1` → `[::ffff:a00:1]`, trailing dots `127.0.0.1..`) are canonicalized by `new URL()` BEFORE `classifyHost` sees them, so the literal checks are effective; the documented DNS-rebinding exclusion is real.
- `createClockifyClient` auth exclusivity, host allowlist, routing/serviceBaseUrls validation, and the final dispatch-boundary re-validation (`core/request.ts` `validatedBaseUrl`) all line up; supplier-form base URLs are validated at request time by the generated boundary.
- `bodyFromRequest` field whitelists exclude `workspaceId` from bodies/queries, so the `Workspace` proxy's workspaceId injection cannot corrupt request bodies (verified across tags/clients/users/reports/files clients).
- The `Last-Page` header parsing in `iterPages` and its fallback logic match the documented semantics and are well-tested (`iter.test.ts:135-277`).
- Generated retry runtime (`executeRequest`/`dispatchTemplate`) timeout+abort race handling and RETRY-001 method gating are consistent and tested.

---

## 6. Verification queue (for the later, stronger model)

1. **Live webhook probe** — capture a real Clockify webhook delivery (envelope vs flat, inner field names, `owner` vs `ownerId`, presence of `event`), then reconcile `webhook-events.ts` + `constructEvent` default generic + fixtures (W-03).
2. **Confirm `page-size > 200` server behavior** on the sandbox (W-08) — one `tags.list({page-size: 500})` call.
3. **Decide/confirm `balanceAssignment` scoping intent** — grep CHANGELOG + git log for `balanceAssignment`; if oversight, add the `Workspace` getter and a set-equality test against `ClockifyApiClient` resource getters (W-02).
4. **Browser-bundle smoke** — bundle the root barrel with a browser target (esbuild/rollup) and confirm the `process`/`node:*` failures (W-04); then fix in `emitter.mjs`.
5. **Repro W-01 in the CLI/MCP layers** — search for raw `ensureTag/ensureProject/ensureClient` calls with a shared `scopeKey` outside `Workspace` (none found in wrapper; cli/mcp out of slice) to size real-world impact.
6. **Run `npm run test:types`** (typecheck.only suite incl. `breaking-changes.test-d.ts`) — not run in this slice (allowed but deferred; no findings depend on it).
7. **Mutation-run the excluded modules** (resolve/expense-list/compose/bulk/webhooks/scoped-client) — GitHub-only per repo rules; a local run is prohibited; flag if a future maintainer wants floor coverage for W-01-style gaps.
8. **`npm run build` + `npm pack --dry-run`** (deferred — heavy gates were out of scope for parallel auditors; the existing `dist/` matches `.packsnapshot` per the committed baseline, so pack content was not re-verified).

---

## 7. Final assessment

The wrapper is an unusually well-governed package: the drift gates are real (source-literal equality tests against the generator), the hand-written surface is uniformly documented and typed, and the 56-file test suite asserts behavior rather than tautology. Type-check passes clean; the sampled suites pass. No critical or high-severity defect was confirmed. The most actionable findings, in order: the **ensure single-flight wrong-entity bug (W-01, verified by repro)**, the **contradictory webhook payload models (W-03)**, the **missing `balanceAssignment` scoped getter plus mismatched resource counts (W-02/W-11)**, and the **browser-runtime claim vs unguarded Node imports (W-04)**. The remainder are dead code, unsound-but-documented type guards, silent fallbacks, and doc/code mismatches — each with a one-line remediation. No production code was modified during this audit.
