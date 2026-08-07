# 06 — SDK AUDIT

Slice A findings (W-*) plus cross-slice items that land on the SDK package.
Severity/confidence and full evidence in `13-FINDINGS-LEDGER.csv`.

## Candidate correctness defects

### W-01 (verified by repro) — `ensure.ts` single-flight returns the wrong entity
- `wrapper/ensure.ts:48-69`: `ensureFlights` keyed by caller-supplied
  `scopeKey` alone. Two concurrent `ensureTag`/`ensureProject`/`ensureClient`
  calls with the same key but different names coalesce: the second caller
  receives the first entity (`created: false`, wrong `id`); the second name
  is silently never created.
- Repro executed: `Promise.all([ensureTag({name:'Alpha',scopeKey:'shared-key'}),
  ensureTag({name:'Beta',scopeKey:'shared-key'})])` → both return Alpha.
- `Workspace` wrappers are safe (`scoped-client.ts:179-207` build the key
  from client-token + workspaceId + noun + name); the public functions are
  not. Tests only cover same-key-same-name (`tests/ensure.test.ts:18-45`).
- Remediation: include name (+noun) in the flight key, or document/enforce
  key uniqueness; add a different-name-same-key test.

### W-03 (verified, in-repo contradiction) — two webhook payload models ship in one package
- Flat model: `wrapper/webhook-events.ts:589` `ClockifyWebhookEvent` is a
  flat union discriminated by `event`; `constructEvent<TPayload =
  ClockifyWebhookEvent>` (`webhooks.ts:118,196-213`).
- Envelope model: the shipped fixtures (`tests/fixtures/webhook-events/*.json`,
  4 files) model `{ webhookEvent, payloadType, payload }` with NO `event`
  field inside the payload; `webhook-fixtures.test.ts:51` asserts the
  envelope discriminant. Inner-shape conflict: the approval type declares
  `owner: ClockifyWebhookApprovalOwner` (object) while the fixture payload
  carries `ownerId` (string).
- Both suites pass because they never cross-check each other. Which shape is
  live truth is unknown (fixtures are labeled synthesized). A consumer
  following the documented flat pattern reads `event.event === undefined`
  against the fixture-documented wire shape.
- Remediation: probe the live wire, then type one model and cross-assert.

### W-02 (verified) — `Workspace` scoped client omits `balanceAssignment`
- Generated client: 30 resource getters (`wrapper/src/Client.ts:77-135`);
  `Workspace` (`wrapper/scoped-client.ts:100-228`): 29 — `balanceAssignment`
  absent. `ws.balanceAssignment` is `undefined` at runtime; the
  "every generated resource getter is scoped" invariant
  (`scoped-client.ts:99-103`) is violated. CLI/MCP bypass the scoped client,
  so nothing caught it. README says 29, `docs/resources/README.md` says 30.
- Remediation: add the getter + a set-equality test against
  `ClockifyApiClient` resource getters; fix the README count.

## Compatibility risks

### W-04 (verified by code reading) — browser claim vs unguarded Node code
- `wrapper/src/core/index.ts:17`: `RUNTIME = { type: "node", version:
  process.versions.node }` unguarded at module load; root barrel
  transitively imports `node:crypto` (`composed-fetch.ts:32-33`),
  `node:os`, and `Buffer` (`webhooks.ts:22,207,221-222`). README claims
  browsers work for read-only flows. The wrapper's own `host-env.ts`
  exists precisely because `process` may be absent/shimmed.
- Remediation: emit `RUNTIME` via guarded host helpers in
  `scripts/sdk-codegen/emitter.mjs`, or soften the README claim.

### W-14 (verified) — retry-policy validation timing inconsistent
- `validateRetryPolicy` (maxRetries integer check) runs per request
  (`composed-fetch.ts:311,624-626`), not at `composedFetch()` construction;
  the POST/PATCH rejection is construction-time (`:450`) and documented.
  `retryPolicy: { maxRetries: 2.5 }` throws on first request, not at
  construction.

### W-06 (verified) — status-based type guards narrow unsoundly
- `isRateLimitError` (`errors.ts:471-473`) returns `err is RateLimitError`
  for any base `ClockifyApiError` with status 429 (also 409/500/503);
  `retryAfterMs` reads `undefined` after narrowing — the exact field the
  guard exists to expose. Documented in JSDoc; the axioms test only
  exercises the constructed-subclass direction. Deliberate per comment;
  API-contract risk.

## Misleading abstractions and silent fallbacks

### W-07 (verified) — `errorCodeEntry` silently substitutes row 0
- `error-codes.ts:276`: unknown code → `CLOCKIFY_ERROR_CODES[0]`
  (`invalid_request` row) → wrong `recovery` text and `retryable` flag from
  `recoveryForCode`/`retryableForCode` (`:280-284`) with no error.

### W-12 (verified) — `runComposition` failure receipts include rolled-back refs
- `compose.ts:161`: `created` lists every ref ever created, including those
  rolled back; only `status.rolledBack` distinguishes. Callers summarizing
  `outcome.created` over-report. Design documented; receipt-shape footgun.

### W-13 (verified) — `paginate` doc overclaims Last-Page honoring
- `pagination.ts:19-22` says it "delegates to iterAll (which honors the
  Last-Page header…)"; the delegation wraps a plain promise
  (`pagination.ts:41-44`), so `iterPages`' `hasWithRawResponse` check
  (`iter.ts:169-175`) always fails and the length heuristic always applies.

### W-08 (verified) — `iterPages` documents pageSize max 200, never enforces
- `iter.ts:41-42` doc vs `iter.ts:230` validation (positive integer only).
  `page-size=500` goes to the wire; server behavior unknown.

## Dead code

### W-05 (verified) — unreachable tail in `runWithRetries`
- `composed-fetch.ts:601-605`: post-loop `return lastResponse` /
  `throw lastError` is unreachable (every iteration returns/throws);
  accumulators dead. Tests at `composed-fetch.test.ts:1483` appear to
  believe the path reachable ("exhaustion with neither response nor error").

### W-09 (verified) — four generated core modules ship with zero importers
- `src/core/base64.ts`, `src/core/file/index.ts`, `src/core/form-data-utils/
  index.ts`, `src/core/runtime/index.ts` have no importers; not re-exported
  by `core/index.ts`; still packed (present in `.packsnapshot`). Emitter or
  sync should prune.

### W-10 (verified) — dead env var + stale comment in build tooling
- `verify-dual-build.sh:18,33,56` sets/passes `EXPECTED_ROOT_SURFACE_COUNT=93`
  which the node one-liners never read; `tests/dual-build.test.ts:8` says
  "17-name baseline" for an 18-entry array.

## Incomplete exports / inconsistent ergonomics

- W-02 (`Workspace.balanceAssignment` missing) — see above.
- W-11 (verified) — `README.md:11` "29 resource modules" vs 30 resources in
  code and `docs/resources/README.md`.

## Verified sound (checked, no finding)

- `webhook-url.ts` SSRF guard: Node WHATWG URL canonicalization defeats all
  tested IPv4/IPv6 embedding bypass spellings before `classifyHost`; the
  documented DNS-rebinding exclusion is real.
- Auth exclusivity, host allowlist, routing/serviceBaseUrl validation, and
  dispatch-boundary re-validation (`core/request.ts` `validatedBaseUrl`).
- `bodyFromRequest` whitelists exclude `workspaceId` from bodies/queries;
  the `Workspace` proxy cannot corrupt request bodies (checked across tags/
  clients/users/reports/files clients).
- Last-Page parsing + fallback semantics (`iter.test.ts:135-277`).
- Generated retry runtime timeout+abort race handling and RETRY-001 method
  gating.
- `npm run type-check -w clockify-sdk-ts-115` passes; `ensure.test.ts` 19/19.

## Cross-slice SDK-facing observations

- Mutation governance covers only 10 hand-written modules; 14 behavior-heavy
  modules (resolve, expense-list, compose, bulk, webhooks, scoped-client,
  paginated-list, operation-receipt, rate-limit, diagnostics, health,
  otel-hooks, reports, error-codes) are outside the Stryker scope — per the
  AGENTS.md contract this is a maintained choice; their tests are the only
  safety net (W-01/W-06 gaps live in governed + ungoverned modules both).
- `wrapper/docs/api/**` (TypeDoc) not reviewed (gitignored, absent).
