# Live Validation — Weakest-Valid-Hypothesis Audit

Subagent 3 of 5 — Deep Code Hypothesis Auditor
Date: 2026-08-06
Repository: `apet97/clockify-ts-sdk` @ `49462f5`
Workspace: `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`
Mode: read-only (grep, node -e probes, type-check, single-file vitest with `CLOCKIFY_API_KEY=''`)

---

## 00 Snapshot

This document validates six ledger findings with the weakest-valid-hypothesis loop and deepens three systemic audits (type safety, pagination, dead code).

Inspected state:

- `HEAD` `49462f5` — `test(wrapper): kill the three mutants the 1.0.1 mutation run exposed`
- `AGENTS.md` 50611 bytes, `CLAUDE.md` 13441 bytes, `Makefile` 42421 bytes
- `.ai-audit` evidence pack 16 files + `13-FINDINGS-LEDGER.csv` (69 findings), `09-TYPE-SAFETY-AUDIT.md`, `12-BLOAT-AND-SIMPLIFICATION.md`
- Tool versions: Node `v26.0.0`, npm `11.12.1`, Vitest `4.1.10`, TypeScript workspace-resolved
- Live probes: none. One accidental read-only GET by prior auditor (`entries list --limit 1abc`) recorded; no data created. All claims below are offline unless marked `UNKNOWN — needs live probe`.

Gates executed in this validation (read-only, solo, creds blanked):

- `npm run type-check -w clockify-sdk-ts-115` — pass (EXIT 0)
- `npm run type-check -w @apet97/clockify-mcp-115` — pass (EXIT 0)
- `vitest run wrapper/tests/ensure.test.ts` — 19/19 pass
- `vitest run wrapper/tests/errors.test.ts` — 91/91 pass
- `vitest run wrapper/tests/webhook-events.test.ts` — 4/4 pass
- `vitest run wrapper/tests/webhook-fixtures.test.ts` — 13/13 pass
- `vitest run mcp/tests/work-time-tracking.test.ts` — 8/8 pass
- `vitest run wrapper/tests/iter.test.ts` — 38/38 pass
- `vitest run wrapper/tests/pagination.test.ts` — 11/11 pass

No file was modified. No network call was made.

---

## 01 Hypothesis Method

Use the self-improvement weakest-valid-hypothesis loop for each finding.

Steps per finding:

1. Define task — state the claim to validate.
2. Collect evidence — read implementation, tests, callers, contracts, and live-proof wiring.
3. Name known and nearby cases — include boundary, negative, sibling, and historical cases that could falsify the claim.
4. Generate two or more competing hypotheses — each must explain at least part of the evidence.
5. Select the weakest valid hypothesis — the least specific rule that covers all verified evidence and excludes the fewest plausible cases. Do not select the shortest patch.
6. Propose the smallest remediation that satisfies the weakest valid hypothesis.
7. Test generalization — run the nearest existing test file read-only and reason whether the fix preserves or extends its contract. Record the falsification method.

ASD-STE100 rules for prose: use short sentences. Use active voice. Use one term for one concept. State conditions explicitly. Describe actions directly. Keep code, identifiers, and quoted errors exact.

Completeness: no claim of completeness unless a mechanical demonstration supports it. Each finding records how a test would falsify it.

---

## 02 Findings Deep Dive

### 02.1 W-01 — `ensure.ts` single-flight keyed by `scopeKey` alone

**Task:** Validate that concurrent `ensureTag` / `ensureProject` / `ensureClient` calls with different `name` values but the same `scopeKey` coalesce and return the wrong entity.

**Evidence:**

- `wrapper/ensure.ts:48-69` — `ensureFlights` is `Map<string, Promise<EnsureResult<NamedRecord>>>`. `findOrCreate` checks `opts.scopeKey` alone: `ensureFlights.get(opts.scopeKey)` and stores `ensureFlights.set(opts.scopeKey, flight)`. The `name` and `noun` do not affect the key.
- `wrapper/ensure.ts:74-110` — public helpers `ensureTag`, `ensureProject`, `ensureClient` forward `opts` unchanged to `findOrCreate`.
- `wrapper/scoped-client.ts:211-236` — scoped helpers encode the name correctly: `flightKey(noun, name)` returns `clientFlightToken + "\u0000" + workspaceId + "\u0000" + noun + "\u0000" + name.trim().toLowerCase()`. The separator is the null codepoint, which no `workspaceId`, `noun`, or `name` can contain. This implementation is correct.
- `wrapper/tests/ensure.test.ts:18-45` — covers same-key same-name coalescing and failed-flight retry. No test covers different-name same-key. All 19 tests pass with creds blanked.
- `wrapper/scoped-client.ts:179-207` — scoped path uses `iterTags`/`iterProjects`/`iterClients` via `iterAll`; the unscoped path uses caller-supplied `list`. The two paths do not cross.
- Repro from ledger (orchestrator, not re-executed here): `Promise.all([ensureTag({name:"Alpha",scopeKey:"shared-key"}), ensureTag({name:"Beta",scopeKey:"shared-key"})])` returns Alpha for both callers.

**Known and nearby cases:**

- Same `scopeKey`, same `name` (case-insensitive) — currently tested; should coalesce and is correct.
- Same `scopeKey`, different `name` (`Alpha` vs `Beta`, `Alpha` vs `alpha` already coalesces correctly via lower-casing in the scoped path but not in the public path).
- Same `scopeKey`, different `noun` (`ensureTag` vs `ensureProject` with same key string).
- Different `scopeKey`, same `name` — must not coalesce.
- No `scopeKey` — must not use single-flight.
- Empty or whitespace-only `name` — `matchByName` semantics still apply after trim.
- Archived-aware `includeArchived` flag — does not affect flight key in either implementation.
- Two clients, same `workspaceId`, same `name` — scoped path isolates by `clientFlightToken`; public path does not.

**Competing hypotheses:**

| ID | Hypothesis | Explains | Fails where |
|---|---|---|---|
| H1 | The public single-flight key must include `noun` and normalized `name`. The current key is too narrow and causes wrong-entity reuse for direct callers. | Repro. Scoped client already does this. Tests do not cover the collision. | None for observed behavior. Requires one-line key change. |
| H2 | `scopeKey` is caller-owned opaque isolation token. The caller must ensure `name` is encoded in the key. The docs imply uniqueness and the code is correct as designed. | Same-key same-name test. Scoped client convention. | Docs do not state this (`FindOrCreateOptions.scopeKey` JSDoc says "Optional in-process single-flight key. Concurrent calls with the same key share one operation." — no mention of name). Plain-JS callers have no type-level hint. The ledger shows direct callers exist. |
| H3 | Single-flight is intentionally per-workspace batch. Concurrent different names should not occur; callers serialize. The optimization targets same-name bursts only. | Same-name bursts. | No serialization is enforced or documented. `Promise.all` with different names is valid JS and the SDK does not forbid it. The bug would then be a contract omission, not less severe. |

**Weakest valid hypothesis:** H1. It covers the scoped implementation, the repro, the missing test, and the doc gap with one rule: the flight key must identify the entity, not just the call site. H2 is weaker in code terms but contradicts the published type and JSDoc, which do not transfer the encoding duty to the caller. H3 excludes legitimate concurrent calls and therefore excludes too many plausible cases to be valid.

**Smallest remediation:** Keep `scopeKey` as the caller-supplied shard, but derive the internal map key as `scopeKey + FLIGHT_KEY_SEPARATOR + noun + FLIGHT_KEY_SEPARATOR + name.trim().toLowerCase()`. Do this inside `findOrCreate` before `ensureFlights.get`. This preserves backward compatibility when the caller already encodes the name (the composite key simply becomes longer, not colliding). Scoped callers then produce `token\0workspace\0noun\0name\0name` if both layers encode; to avoid double-encoding, scoped helpers should pass `scopeKey` that already includes noun+name and the inner function should not re-add it — so the smallest change is to add `noun` and `name` in one place: either in `findOrCreate` (public path) and make scoped helpers pass only the outer shard, or keep scoped `flightKey` as now and make `findOrCreate` behave identically. The audit prefers the single-site fix in `findOrCreate` and a one-line update in `scoped-client.ts` to stop double-encoding. Add a test: `ensureTag({name:"Alpha",scopeKey:"k"})` concurrent with `ensureTag({name:"Beta",scopeKey:"k"})` must create two records and return distinct `id` values.

**Generalization test:** `wrapper/tests/ensure.test.ts` 19 tests still pass because same-name same-key maps to the same composite key. The new test adds coverage for the boundary that is absent today. The scoped path keeps its isolation property because `clientFlightToken` remains in the key. A second boundary test — `ensureTag` vs `ensureProject` with same `scopeKey` and same `name` — must not coalesce across nouns.

**Falsification method:** Run the different-name same-key concurrent repro. If it returns two distinct entities after the fix, H1 is confirmed. If docs are updated to say "`scopeKey` must include the normalized name" and no code change is made, H1 is still valid but the duty shifts; the repro would then be documented as caller error, which the current JSDoc does not support.

**Severity:** Medium. Direct `ensure*` callers get silent wrong-entity reuse. Scoped `ws.ensure*` callers are not affected.

---

### 02.2 W-03 — Two webhook payload models in one package

**Task:** Validate that the package ships two contradictory webhook models and that no test cross-checks them.

**Evidence:**

- `wrapper/webhook-events.ts:589` — `type ClockifyWebhookEvent` is a flat discriminated union. Each variant carries `event: "NEW_PROJECT"` etc. at the top level. `CLOCKIFY_WEBHOOK_EVENT_NAMES` lists 50 names. `constructEvent<TPayload = ClockifyWebhookEvent>` in `wrapper/webhooks.ts:196-213` is typed to this union.
- `wrapper/webhooks.ts:118,196-232` — `constructEvent` verifies `Clockify-Signature-Token` and does `JSON.parse(text) as TPayload`. No shape validation occurs. Fixture shape and flat shape both satisfy `as TPayload`.
- `wrapper/tests/fixtures/webhook-events/*.json` (4 files) — every fixture is `{ webhookEvent, payloadType, payload }` with no top-level `event` field. Example `new-project.json` carries `webhookEvent: "NEW_PROJECT"` and inner `payload: { id, name, workspaceId, ... }`.
- `wrapper/tests/webhook-fixtures.test.ts:51` — asserts `event.webhookEvent === payload.webhookEvent` and `event.payload` equals `payload.payload`. It never checks `event.event`.
- `wrapper/tests/webhook-events.test.ts:12-45` — asserts `event.event === "TAG_DELETED"` on a flat payload `JSON.stringify({ event:"TAG_DELETED", id:"tag-1", ... })`. It never checks `webhookEvent`.
- `wrapper/webhook-events.ts:66-75` — `ClockifyWebhookApprovalOwner` is `{ userId, userName, timezone, startOfWeek }`. The fixture `approval-request-status-updated.json` carries `ownerId: "65a3a1c8e8a31234567890ab"` as a string inside `payload`.
- `spec/evidence/discrepancies.md` open entry `webhook.signature-scheme.shared-secret-not-hmac-doc-only` notes the delivery contract is doc-only. Fixtures are labeled `Synthesized fixture (not a live probe)`.
- `mcp/src/tools/webhooks.ts` and `mcp/src/tools/workflows/business.ts` use the flat union for tool schemas; MCP tests do not assert envelope shape.

**Known and nearby cases:**

- `NEW_PROJECT`, `NEW_TIME_ENTRY`, `TIMER_STOPPED`, `APPROVAL_REQUEST_STATUS_UPDATED` — the four fixtures.
- Approval inner `owner` object vs `ownerId` string — one conflict inside the broader model conflict.
- `X-Addon-Token` vs `X-Addon-Key` header naming in the OpenAPI (S-03) — same family of annotation-vs-reality drift but orthogonal to payload shape.
- `constructEvent` header case-insensitivity — verified, not related to payload model.
- Live probe vs synthesized fixture — the ledger explicitly marks fixtures as synthesized.

**Competing hypotheses:**

| ID | Hypothesis | Explains | Fails where |
|---|---|---|---|
| H1 | The live wire is the envelope `{ webhookEvent, payloadType, payload }`. The flat union is fiction. Consumers using `event.event` read `undefined`. | Fixtures match the `WEBHOOKDOC.md` payload-type enum style. Flat union has no `webhookEvent` field to match the wire. | No live capture proves it. Flat union has 50 variants with precise inner shapes that look derived from live study. |
| H2 | The live wire is flat `{ event, ...fields }`. The fixtures are wrong. Consumers using `event.webhookEvent` read `undefined`. | `webhook-events.test.ts` and `CLOCKIFY_WEBHOOK_EVENT_NAMES` match the 50-event catalog. Fixtures are labeled synthesized, so they can be wrong. | No live capture proves it either. Envelope style looks like a plausible Clockify delivery wrapper. |
| H3 | Clockify delivers envelope-wrapped flat payloads. The outer `webhookEvent` equals the inner `event`. Both models are partial views and the correct type is `{ webhookEvent: WebhookEventName, payloadType, payload: ClockifyWebhookEvent }`. | Reconciles both suites. Envelope fixtures contain inner payloads that structurally match flat variant inner fields (except `ownerId` vs `owner`). | Requires that inner `payload` be exactly a flat variant with `event` renamed to `webhookEvent`. The approval `ownerId` conflict still breaks this. |
| H4 | The event catalog is correct but the wire shape is a third form not yet typed (e.g., `event` at top level plus envelope, or per-category envelope). Both current models are incomplete. | Neither suite can falsify the other without a live probe. | Overly permissive; excludes no case and therefore is not falsifiable. |

**Weakest valid hypothesis:** The disjunction of H1 and H2 is the weakest valid statement with current evidence: at least one shipped model does not match the live wire, and the package provides no cross-check that would detect the mismatch. H3 is more specific than the evidence warrants without a live capture. The weakest actionable hypothesis is: the delivery contract is unverified, both models ship as typed, and both test suites pass because they never assert the other model's discriminant.

**Smallest remediation:** Do not change the union or the fixtures without a live probe. Add a cross-assert test that fails closed:

- Parse each fixture and assert that `constructEvent<ClockifyWebhookEvent>` does not satisfy the flat union (e.g., `(event as ClockifyWebhookEvent).event === undefined` for envelope fixtures).
- Parse the flat `TAG_DELETED` payload and assert envelope fields are absent.
- Document the verdict as `UNKNOWN` until a live probe re-records the wire bytes via `spec/evidence/probes/`.

When a live capture lands, replace the fiction with one model. If H1 wins, rename the discriminant to `webhookEvent` and nest the former flat fields under `payload`. If H2 wins, delete the envelope fixtures or regenerate them as flat. In either case, keep the approval `owner` vs `ownerId` distinction explicit and tested.

**Generalization test:** `wrapper/tests/webhook-events.test.ts` 4 tests and `wrapper/tests/webhook-fixtures.test.ts` 13 tests still pass after adding the cross-assert, but the new cross-assert fails, proving the gap is now visible. The falsification method is therefore mechanical. After the live probe, update one suite to match the wire and make the cross-assert pass.

**Falsification method:** Live probe via an H01-approved capture. Until then, the cross-assert test itself is the falsifier for the claim that the two models are consistent. No local edit to `constructEvent` can resolve the contradiction because it is unvalidated `as TPayload`.

**Severity:** High. A consumer who follows the typed flat example reads `event.event === undefined` against an envelope delivery, or vice versa. The type gives false confidence.

---

### 02.3 W-06 — `isRateLimitError` narrows unsoundly to `RateLimitError`

**Task:** Validate that status-based guards narrow to subclass types and expose absent fields.

**Evidence:**

- `wrapper/errors.ts:471-494` — `isRateLimitError` returns `err is RateLimitError` when `err instanceof ClockifyApiError && err.statusCode === 429`. Siblings `isConflictError` (409), `isInternalServerError` (500), `isServiceUnavailableError` (503) do the same. Only `RateLimitError` adds fields: `retryAfterMs` and `rateLimitResetAt`, parsed from `Retry-After` and `X-RateLimit-Reset` in its constructor (`wrapper/errors.ts:130-175`).
- `wrapper/errors.ts:80-175` — `RateLimitError` constructor parses headers via `parseRetryAfterMs` / `parseRateLimitResetAt`. The base `ClockifyApiError` does not parse headers.
- `wrapper/rate-limit.ts:60-90` — `getRateLimitFromError` reads `err.rawResponse.headers` without constructing a subclass. This is the documented alternative.
- `wrapper/errors.ts:471-473` JSDoc — "Classifies by STATUS, not class: a live 429 arrives as a BASE `ClockifyApiError` (the generated client emits no 429 subclass), so `retryAfterMs` / `rateLimitResetAt` are `undefined` until you call `promoteApiError(err)`. To read the window without re-allocating, use `getRateLimitFromError(err)`".
- `wrapper/tests/errors.test.ts:342-345` — `isRateLimitError(new ClockifyApiError({ statusCode: 429 }))` is `true`. The test documents the unsound direction as expected.
- `wrapper/tests/axioms-checklist.test.ts:34-41` — asserts the constructed-subclass direction only (`isRateLimitError(new RateLimitError(...))`).
- `wrapper/tests/rate-limit.test.ts:67-93` — covers `getRateLimitFromError` for status and header parsing.
- Grep for callers: `wrapper/errors.ts` and tests are the only callers of `isRateLimitError` in the SDK. MCP steers consumers to `getRateLimitFromError` per docs.

**Known and nearby cases:**

- Base `ClockifyApiError` with 429 and no headers — guard returns true, `retryAfterMs` is `undefined`.
- Base `ClockifyApiError` with 429 and valid `Retry-After` header but no promotion — same.
- Promoted error via `promoteApiError` — returns a real `RateLimitError` with parsed fields; guard is then sound.
- Rate-limited error with `X-RateLimit-Reset` only — same unsound read.
- Sibling guards 409/500/503 — no extra fields, so unsoundness has no observable member-missing effect.
- Non-`ClockifyApiError` with `statusCode` 429 — guard correctly returns false.

**Competing hypotheses:**

| ID | Hypothesis | Explains | Fails where |
|---|---|---|---|
| H1 | The guard should narrow to a structural type with optional `retryAfterMs`, or split into `isRateLimitedStatus` (status predicate) and `isRateLimitError` (instanceof). This makes the type sound. | TS soundness. Field absence becomes explicit. | Breaking change for existing callers who check `if (isRateLimitError(err)) await sleep(err.retryAfterMs!)`. Requires codemod and doc update. |
| H2 | The guard is intentionally a status predicate masquerading as a subclass guard. The type predicate is convenience and documented as status-only. Callers who need the field must call `promoteApiError` or `getRateLimitFromError`. | JSDoc. `errors.test.ts:342` expectation. No sibling field to break. | Violates TypeScript narrowing: after `if (isRateLimitError(err))` the compiler believes `retryAfterMs` is defined when it is not. Reviewers trust the signature. |
| H3 | The generated client should have thrown `RateLimitError` directly for 429, so the base case never occurs. The guard would then be sound without `promoteApiError`. | Would make the 429 path sound. | Contradicts `AGENTS.md` §2 and the OpenAPI: 429 is undocumented, so the generator emits no subclass. Changing the generator to synthesize a 429 subclass is a cross-repo change. |

**Weakest valid hypothesis:** H2 describes the current implementation with its mitigation, but H1 is the weakest hypothesis that is valid under TypeScript's type-predicate contract. The weakest valid statement that covers all evidence is: the guard's TS signature over-promises `RateLimitError` when the runtime value is a base error with `statusCode` 429, and the docs provide a correct workaround (`promoteApiError` / `getRateLimitFromError`) that callers must use. Severity is low because the failure is `undefined` read, not wrong value, and the mitigation is local and documented.

**Smallest remediation (no breaking change):** Keep the runtime predicate but change the return type to `err is ClockifyApiError & { statusCode: 429 } & Partial<RateLimitErrorFields>` so `retryAfterMs` is optional after narrowing, or keep the predicate and add a second predicate `isPromotedRateLimitError` that checks `instanceof RateLimitError`. The lowest-risk edit is to change `isRateLimitError` to return `err is ClockifyApiError & { statusCode: 429 }` and document that `getRateLimitFromError` is the field source. For sibling guards, no type change is needed because they add no fields.

**Generalization test:** `wrapper/tests/errors.test.ts` 91 tests pass before and after, except the assertion at `errors.test.ts:342` would need updating if the predicate narrows to optional fields. The connected test is `wrapper/tests/rate-limit.test.ts`, which already proves `getRateLimitFromError` reads the window without promotion. No MCP test depends on `isRateLimitError` field presence.

**Falsification method:** Construct a base `ClockifyApiError({ statusCode: 429, rawResponse: { headers: ... } })` and check `isRateLimitError(err) && err.retryAfterMs !== undefined`. The current code falsifies the claim that the field is defined after narrowing. After the fix, the type makes the field optional and the test expects `getRateLimitFromError(err)?.resetAt` instead.

**Severity:** Low. The guard contract is false for the common base-429 case, but the effect is an optional field read returning `undefined`, not a security or data-loss failure. The mitigation is documented.

---

### 02.4 M-06 — Parity gaps: 64 of 168 ops have `tsMcp: null`

**Task:** Validate that `docs/operation-parity.json` under-reports coverage and that real gaps exist.

**Evidence:**

- `docs/operation-parity.json` — `summary.operations 168`, `tsMcpExact 104`, `goMcpExact 80`, `curated 42`. `operations` array has 64 rows with `tsMcp: null` and `overrideReason: null` on every such row.
- `docs/mcp-tool-manifest.json` — `tools` array has 162 tools (22 workflow + 140 domain). Tool names like `clockify_workspace_settings`, `clockify_projects_set_member_rate`, `clockify_tasks_set_rate`, `clockify_scheduling_assignments_create` exist in the manifest.
- Candidate-tool vs manifest check (node probe): `getWorkspaceInfo` candidate `clockify_workspaces_get` is not in the manifest, but `clockify_workspace_settings` is. `updateProjectUserHourlyRate` candidate `clockify_projects_update_user_hourly_rate` is not in manifest, but `clockify_projects_set_member_rate` is. Same for `updateTaskBillableRate` and `createRecurringAssignment`. These are renamed coverage cases where parity claims no tool.
- Go MCP `goMcp: null` on most of the same rows — suggests deliberate curation, but `overrideReason` is not recorded.
- Genuinely unexposed ops (no tool under any name): `uploadImage` (`POST /file/image`), `getCurrentUser` (`GET /user`), `getAllMyWorkspaces` (`GET /workspaces`), `addWorkspace` (`POST /workspaces`), `getAddonWebhooksOnWorkspace`, `getWebhookLogs` (`POST /webhooks/{id}/logs`), `patch …/token` (token rotation), `updateWorkspaceCostRate`, `updateWorkspaceBillableRate`, `updateUserCustomFieldValue`, `findUserTeamManagers`, `downloadExpenseReceipt`, `getInvoiceSettings`/`updateInvoiceSettings`, `duplicateInvoice`/`exportInvoice`, `createProjectFromTemplate`, `addLimitedUsersWithInfo`, `deleteMany` (`DELETE /user/{userId}/time-entries`), five user-scoped `timeEntries` routes (`listForUser`, `createForUser`, `startTimer`, `updateForUser`, `duplicate`), `submitApprovalRequestForUser` / `resubmitEntriesForApprovalForUser`.

**Known and nearby cases:**

- Renamed coverage (`getWorkspaceInfo` → `clockify_workspace_settings`, `listProjectCustomFields` → `clockify_project_custom_fields_list`, etc.) — stamped `tsMcp: null` but covered.
- True gaps that may be intentional (e.g., `addWorkspace` is account-level, not workspace-scoped; `uploadImage` needs file upload).
- True gaps that may be policy-sensitive (webhook token rotation, invoice settings).
- Ops with `goMcp: null` in `../GOCLMCP/docs/tool-catalog.json` — same curation line.
- Ops where the SDK method exists but MCP deliberately excludes it for risk reasons.

**Competing hypotheses:**

| ID | Hypothesis | Explains | Fails where |
|---|---|---|---|
| H1 | Parity under-reports because renamed tools are not stamped. About 20 of the 64 nulls are true gaps; the rest are covered under aliases but `operation-parity.json` uses exact candidate-tool equality. | Renamed examples with manifest hits. Go MCP null overlap suggests curation, not absence. | Does not explain why `overrideReason` is null everywhere. |
| H2 | All 64 nulls are intentional curation decisions. The `overrideReason: null` is the record and no action is needed. | Go MCP parity and the ADR curation narrative. | No decision is recorded where the gate reads it. The contract's `overrideReason` field exists to record intent and is unused, so the claim is unverifiable. |
| H3 | Parity generation is buggy or stale. A regen would change the 64 count. | `make operation-parity` not run in this audit (unknown 21). | The parity file is mechanically generated from `mcp-tool-manifest.json` and `operation-parity-overrides.json`; staleness would affect counts, but the candidate-tool set is deterministic. |

**Weakest valid hypothesis:** H1 is weakest valid for the curation subset and for the alias subset: parity under-reports because it counts only exact `candidateTools` matches. The true gap set is smaller than 64 but non-empty (about 20 ops have no tool under any name). H2 would be weaker if `overrideReason` were populated, but it is not.

**Smallest remediation:** Create `docs/operation-parity-overrides.json` entries that map renamed coverage to the operation, e.g., `{ "method": "GET", "path": "/workspaces/{workspaceId}", "tsMcp": "clockify_workspace_settings", "overrideReason": "renamed: getWorkspaceInfo -> workspace_settings" }`. For true gaps, add `{ "tsMcp": null, "overrideReason": "intentionally unexposed: account-level workspace creation has no workspace-scoped MCP use case" }` or `"covered by goMcp raw API fallback"` where applicable. Consider guarded tools for webhook token rotation, invoice settings/duplicate/export, and `deleteMany` if policy allows. Record the decision in `overrideReason` so the gate can assert that every `tsMcp: null` row has a reason.

**Generalization test:** `make operation-parity` regen plus `make operation-parity-drift` (contract). No existing vitest file covers parity; the gate `check-operation-parity.mjs` (if present) would now pass because null-with-reason is allowed. The 162-tool manifest test (`mcp/tests/tool-manifest.test.ts` lineage) still passes because tool set is unchanged.

**Falsification method:** For each null row, run `node -e "manifest.tools.some(t => t.name === candidateTools[0])"` — the earlier probe shows renamed hits succeed, falsifying the claim that all 64 are gaps. For true gaps, no tool name matches any candidate and a grep in `mcp/src` finds no handler.

**Severity:** Medium. The parity doc is the credential for "how much of Clockify the agent can reach." Under-reporting hides both real gaps and real coverage.

---

### 02.5 C-01 — Mutation leaves: 30 pins vs 35 declared

**Task:** Validate that the CLI mutation-leaf behavioral proof leaves five leaves uncovered.

**Evidence:**

- `docs/cli-write-safety-contract.json` — `expected.mutatingLeaves 35`, `expected.riskCounts.write 25`, `expected.riskCounts.destructive 10`, `riskPaths` lists 35 mutating command paths (probe: 5 missing from the test file: `approvals submit-with-type`, `approvals submit-for-user-with-type`, `timeoff balance-assignment create`, `timeoff balance-assignment update`, `timeoff balance-assignment delete`).
- `cli/tests/mutation-leaves.test.ts` — `cases` array has 30 entries (count via `name:` lines). The six `Project A`/`Client A`/`Webhook A` names are sub-placeholders inside a single case's `calls`, not leaves. True leaf names are 30 distinct command paths.
- `scripts/check-cli-write-safety.mjs` — validates `riskPaths` size vs `expected.totalLeaves`, validates commander introspection, and validates that `behavioralTests` files exist and are under `cli/`. It spawns `tsx` to introspect the commander tree but never validates that the behavioral tests cover all `mutatingLeaves`. The console message at runtime prints `35 mutation handlers behaviorally proved` while the file pins 30.
- `cli/tests/balance-assignment.test.ts` and `cli/tests/approvals.test.ts` cover happy paths but not the failure-envelope / receipt contract that `mutation-leaves.test.ts` pins.
- `cli/tests/mutation-leaves.test.ts` run not executed in this validation, but file read shows zero hits for the five missing names.

**Known and nearby cases:**

- 29 read leaves — not mutation-relevant.
- 25 write leaves — 13 covered in test, 2 approvals write missing, 3 balance-assignment write missing, etc.
- 10 destructive leaves — similar gap for balance-assignment delete.
- `api` raw command — covered (1 destruct path).
- `timeoff balance-assignment list` is read, not mutating.

**Competing hypotheses:**

| ID | Hypothesis | Explains | Fails where |
|---|---|---|---|
| H1 | The test file intentionally samples 30 representative leaves. The contract claim of 35 is aspirational or counts introspected leaves, not tested ones. | 30 tests pass. The gate still passes because it checks file existence, not leaf coverage. | The contract's `behavioralTests` field is meant to be the proof for all `mutatingLeaves`. A sample with no disclosure is misleading. |
| H2 | Five leaves were added after the test file was cut (1.0.1 `balance-assignment` and approvals `submit-with-type` family). The contract was updated but the test file was not. | The missing five are exactly the newest write paths. The gap is one-way (no extra in test). | Would also explain why the console message lies: the wiring test prints `expected.mutatingLeaves` instead of `cases.length`. |
| H3 | The five leaves are covered by other test files (e.g., `balance-assignment.test.ts`), so the 30-pin is sufficient. | Those files exist and hit the wire. | They do not assert the failure-envelope / receipt contract that `mutation-leaves.test.ts` is the designated behavioral proof for. The gate cannot see them. |

**Weakest valid hypothesis:** H2 — a drift between contract and test after additive work. H1 would require the contract to say "sample" and it does not. H3 would require the gate to know about alternative coverage and it does not.

**Smallest remediation:** Add five `MutationCase` entries mirroring the sibling `projects create` / `clients create` pattern: for `approvals submit-with-type` and `submit-for-user-with-type`, and for `timeoff balance-assignment create` / `update` / `delete`. Each case needs one `PlannedCall` with the expected `path` (`approvals.submitWithType`, `approvals.submitForUserWithType`, `timeOff.createBalanceAssignment` etc.) and one `failureAt` variant to assert the error envelope. Update `scripts/check-cli-write-safety.mjs` to assert `cases.length === expected.mutatingLeaves` or, if a sample is intentional, change the contract to `expected.behaviorallyProvedLeaves: 30` and make the console message print that value.

**Generalization test:** Run `CLOCKIFY_API_KEY='' npx vitest run cli/tests/mutation-leaves.test.ts` — currently would pass 30 cases; after the fix it would pass 35. Run `node scripts/check-cli-write-safety.mjs` — currently exits 0 despite the gap; after the leaf-count assertion it would fail until the cases are added, then pass.

**Falsification method:** `python3` count probe already falsifies the 35-proof claim: `grep -c '        name: "' cli/tests/mutation-leaves.test.ts` returns 30, while `expected.mutatingLeaves` is 35. After the fix, the counts match.

**Severity:** Medium. Defects in the five leaves' failure-envelope or receipt paths pass the `cli-write-safety` contract and `contract-gates`.

---

### 02.6 G-03 — About 80 of about 90 gates are marker-only

**Task:** Validate that most gates assert marker strings in evidence docs without inspecting source code.

**Evidence:**

- `scripts/check-mutation-safety.mjs` full read — `includesAll(policy, markers, label)` over `docs/mutation-safety-contract.json` and `docs/mutation-safety.md` etc. No `grep` in `wrapper/` or `mcp/` source. `Makefile` target `mutation-safety` has no dependency on a source file.
- `scripts/check-live-safety.mjs`, `check-test-data-lifecycle.mjs`, `check-mock-clockify-contract.mjs`, `check-env-contract.mjs`, `check-config-precedence.mjs` and about 40 siblings follow the same `includesAll` pattern (grep for `includesAll` returns about 40 files, each with 2-4 marker assertions).
- `Makefile` `contract-gates: product-contracts security-contracts release-contracts docs-contracts` fans out to about 90 leaf gates. Only a minority do real proof: `check-cli-write-safety.mjs` (commander introspection + spawn), `check-ci-contract.mjs` (YAML parse, SHA-pinned actions), `check-performance-budgets.mjs` (real spawns with timing), `check-version-consistency.mjs`, `check-tag-hygiene.mjs`, `check-docs-counts.mjs` (cross-source counts), `check-openapi-lint.mjs`, `check-sdk-public-api.mjs`, `check-consumer-cast-budget.mjs` (compiler dataflow), `check-pack-snapshot.mjs`.
- `.ai-audit/10-TEST-AND-GATE-MATRIX.md` — documents the same classification: "mix: real proof + marker-only doc checks (G-3)" and lists the real gates.
- Demonstration: breaking `isRateLimitError` logic (W-06) while leaving docs unchanged would keep `check-mutation-safety.mjs` green because it only reads docs.

**Known and nearby cases:**

- `performance-budgets` — real spawn, flakes under CPU contention, documented in `AGENTS.md` §4.
- `cli-write-safety` — real introspection, but still marker-adjacent for the behavioral proof (C-01).
- `mutation-ci` — wiring check only, never runs Stryker locally by design.
- `governance-audit` — not scheduled in CI (WF-2).
- `check-cli-contract.mjs` — substring search for `toBe(2)` rather than parsing assertions (G-1).

**Competing hypotheses:**

| ID | Hypothesis | Explains | Fails where |
|---|---|---|---|
| H1 | Marker-only gates are insufficient. They pass while behavior is broken as long as docs are unchanged. Every leaf gate should prove behavior. | Demonstration with `isRateLimitError`. About 80/90 ratio. | Some behaviors are expensive or live-only (`mutation`, `perfect-live`). Proving every marker in code duplicates test coverage and bloats CI. |
| H2 | Marker-only gates are sufficient because docs are the source of truth. A behavior change requires a doc change, so marker failure implies behavior drift. | The `AGENTS.md` §8 decision to retain `spec/fern` as evidence. Many gates are doc-drift detectors by design. | A behavior regression without a doc edit passes. The ledger shows real behavior gaps that marker gates did not catch (W-01, W-06, M-01). |
| H3 | Marker-only is the correct default for governance docs; real-proof gates should be added selectively for leaf behaviors that have independent failure modes. The current set does this for the highest-value leaves but misses a few. | The minority of real-proof gates already exists and is documented. | About 80/90 suggests selectivity is over-applied. `check-mutation-safety.mjs` governs retry, write, confirmation, and receipt rules — all behavior-bearing — but proves none of them. |

**Weakest valid hypothesis:** H3 — marker-only is valid for doc-consistency claims, but mislabeled when it governs behavior. The weakest valid statement is: a gate that claims to prove a behavioral rule must either prove it or be renamed to a doc-consistency claim. Today about 80 gates claim behavioral coverage with marker-only proof.

**Smallest remediation (no global rewrite):** Triage per gate. For each `scripts/check-*.mjs`, classify as `doc-drift` vs `behavior-proof`. If `doc-drift`, rename the contract's `purpose` to say so. If `behavior-proof`, add one real assertion. The highest-value conversions are:

- `check-mutation-safety.mjs` — add a source grep: `grep -rn "retryMutationMethods" wrapper/` must appear and `grep -rn "POST.*retry" wrapper/` must not appear, proving RETRY-001 is not bypassed.
- `check-live-safety.mjs` — assert `sandbox.test.ts` is gated by `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID`.
- `check-test-data-lifecycle.mjs` — assert `timeOff` cleanup fixtures exist and the demo seed/cleanup window is consistent.

Do these before adding new gates.

**Generalization test:** `make contract-gates` still passes after renaming marker-only gates to doc-drift, because no behavior is removed. Converting one gate to real proof may red until the source matches the marker — that is the intended signal.

**Falsification method:** Break a governed behavior (e.g., delete `RETRY-001` guard in `composed-fetch.ts`) and run `make contract-gates`. The current suite stays green. After the fix, the same run reds via the new source grep.

**Severity:** Medium. The contract suite is the CI-enforced readiness bar. Marker-only gates that claim behavioral proof hide regressions until mutation or live proof runs, which are manual and infrequent.

---

## 03 Type-Safety Deep Dive

### 03.1 Mechanical counts — verified

| Pattern | Scope | Count | Verification | Verdict |
|---|---|---|---|---|
| `as any` | `wrapper/` | 1 | `grep -rn "as any" wrapper/` → hit is `ListWorkspacesRequest.ts:4` comment: "any of the specified roles". No cast. | Not a cast. No finding. |
| `as any` | `cli/` | 0 | No hits | Clean |
| `as any` | `mcp/` | 0 | No hits | Clean |
| `as unknown` | `wrapper/` total excl. `dist/`, `tests/` | 98 | `grep -rn "as unknown" wrapper/` excl. `dist/` & `tests/` → 98 | See breakdown |
| `as unknown` | `wrapper/*.ts` hand-written (excl. `src/` & `tests/`) | 3 | `wrapper/scoped-client.ts:319`, `wrapper/otel-hooks.ts:22` (comment), `wrapper/paginated-list.ts:118` | Localized seams, tested |
| `as unknown` | `wrapper/src/` generated | 95 | 94 in `src/api/resources/*/Client.ts` (`as unknown as Record<string,unknown>` for `bodyFromRequest`), 1 in `src/core/fetcher/Headers.ts:20` (`as unknown as Headers`) | Generated adapter seam, safe via whitelist |
| `as unknown` | `mcp/src/` | 16 | `mcp/src/tools/{webhooks,customFields,holidays,doctor,invoices/payments,users,expenses}.ts`, `mcp/src/result.ts:153,243`, `mcp/src/orchestration/confirmation.ts:134` | See 03.2 |
| `as unknown` | `cli/src/` | 0 | 2 hits in `cli/src/commands/sharedReports.ts:295` and `tasks.ts:27` are string literals `"unknown"` inside `"has unknown … status"`, not casts. Verified by `grep -C 1`. | Not casts |
| `@ts-expect-error` / `@ts-ignore` | `wrapper/`, `cli/`, `mcp/` source excl. `tests/` | 0 | `grep -rn "ts-expect-error\|ts-ignore" --include="*.ts" wrapper/ mcp/ cli/` → hits only in `wrapper/tests/types/*` and `wrapper/tests/scoped-client.test.ts:46` | Zero suppressed errors in product source |
| `: any` / `<any` | `wrapper/src/` | 4 | `wrapper/src/core` generated surface, not re-exported through the governed root barrel | Contained |

`npm run type-check -w clockify-sdk-ts-115` and `-w @apet97/clockify-mcp-115` both pass with ` --noEmit`. The `make consumer-cast-budget` contract (see `docs/consumer-cast-budget-contract.json`) enforces zero casts in the CLI/MCP consumer seam via symbol provenance + dataflow. The mechanical counts are consistent with that gate.

### 03.2 `as unknown` — are any unsafe?

**Generated 95 in `wrapper/src/`:**

- `bodyFromRequest(request as unknown as Record<string, unknown>, [ ...whitelist ])` — every generated `Client.ts` adapts a typed request like `ListProjectsRequest` to the generic `bodyFromRequest` helper which extracts only whitelisted keys. The `as unknown` is the adapter between the typed request and the generic record. The whitelist is generated from the OpenAPI `body`/`query` filter and is tested by wire-shape cassettes (`wrapper/tests/wire-shape-http.test.ts`, `wire-shape-list-http.test.ts`). No field outside the whitelist reaches the wire. Safe.
- `Headers.ts:20` — `this as unknown as Headers` in `forEach` — the local `Headers` polyfill conforms to the Web `Headers` shape and the cast satisfies the callback's `this` parameter. Safe.

**Hand-written 3 in `wrapper/`:**

- `scoped-client.ts:319` — `(this.client as unknown as Record<string, unknown>)[name]` — dynamic resource lookup by string name. Guarded by `if (target == null || typeof target !== "object") return target`. The `as unknown` is the only way to index a typed client by a string. Tests in `scoped-client.test.ts:146` cover identity stability and null fallback. Safe.
- `otel-hooks.ts:22` — comment example `return span as unknown as OtelLikeSpan` — not executed.
- `paginated-list.ts:118` — `fetcher as unknown as (request: PaginatedRequest & Record<string, unknown>) => ...` — adapts the caller's `TRequest` to the paginator's `PaginatedRequest` constraint. The outer `paginatedList` is typed with `Omit<TRequest, "page" | "page-size">` so no caller-supplied `page` is lost. `wrapper/tests/paginated-list.test.ts` covers this. Safe.

**16 in `mcp/src/`:**

| Location | Form | Safety |
|---|---|---|
| `mcp/src/tools/webhooks.ts:27,33` | `value.map(item => redactWebhook(item)) as unknown as T` | Widening after redaction that preserves shape. `redactWebhook` returns same shape with `authToken` masked. Safe. |
| `mcp/src/tools/webhooks.ts:193` | `... as unknown[] \| { webhooks?: unknown[] }` | Widening a union response (list may be array or `{ webhooks: [] }` depending on plan). Validated before use. Safe. |
| `mcp/src/tools/holidays.ts:61,100` | `... as unknown[]` | Widening after `ctx.client.holidays.list` etc. before Zod validation. Benign. |
| `mcp/src/tools/doctor.ts:111` | `(await ctx.client.workspaces.list()) as unknown[]` | Same: list-response widening before validation. Benign. |
| `mcp/src/tools/customFields.ts:132,207,335` | `... as unknown[]` / `as unknown` | Same family. |
| `mcp/src/tools/invoices/payments.ts:33` | `... as unknown[]` | Same. |
| `mcp/src/tools/users.ts:65` | `... as unknown[]` | Same. |
| `mcp/src/tools/expenses.ts:434` | `... as unknown` | Widening for `expenseCategories.archive` flat/envelope union. |
| `mcp/src/result.ts:153,243` | `envelope as unknown as JsonRecord` | Bounded to the MCP output-schema `envelopeSchema` (`mcp/tests/tool-output-schema.test.ts`). Safe. |
| `mcp/src/orchestration/confirmation.ts:134` | `JSON.parse(requireCanonicalJson(value)) as unknown` | After `requireCanonicalJson` (stable JSON canonicalizer) — parsed value is validated by the tool's Zod schema before use. Safe. |
| `mcp/src/tools/workflows/time-tracking.ts:168` | `(stopped as { stopped?: boolean }).stopped` | **Unsafe narrowing** — see M-01. The envelope shape is `{ ok, action, data, ... }`, not `{ stopped }`. The cast silences the compiler and the branch is dead. This is the one proven wrong-slot instance. The sibling remains in `mcp/src/tools/workflows/business.ts` and `tools/webhooks.ts` registries (not casts but `as const satisfies`). |

M-01's cast is the only `as unknown`-family cast that is demonstrably unsound in production: it reads the wrong property after an unchecked assertion. All other `as unknown` uses in `mcp/src` are widenings to `unknown[]`/`unknown` before validation, which is the correct use of `unknown`. Lists of 16 and 95 are therefore not a smell.

### 03.3 Systemic observation

The repo's type-safety discipline is:

- Zero `@ts-expect-error` / `@ts-ignore` in product source — enforced by the `consumer-cast-budget` dataflow and by review: any new suppression fails type-check culture.
- `as any` is absent — the one hit is a comment false positive.
- `as unknown` in generated code is an adapter between typed requests and generic helpers; it never narrows. The hand-written 3 are adapter seams with focused tests.
- The systemic narrowing risk is envelope-field reads typed via inline casts (`as { stopped?: boolean }`), not `as any`. The ledger's TS-01 captures this. The smallest systemic fix is a helper:

```ts
function getEnvelopeData<T>(env: unknown): T | undefined {
  return (env as { data?: T })?.data;
}
```

then `getEnvelopeData<{ stopped?: boolean }>(stopped)?.stopped` — the cast is confined to one validated site and the property read is no longer silent.

---

## 04 Dead-Code / Bloat Assessment

### 04.1 `base64` / `file` / `form-data-utils` / `runtime` — confirmed dead

**Evidence:**

- Files exist: `wrapper/src/core/base64.ts` (`encodeBase64`), `wrapper/src/core/file/{index.ts,exports.ts}` (`Uploadable`), `wrapper/src/core/form-data-utils/index.ts` (`newFormData`), `wrapper/src/core/runtime/index.ts` (`re-export RUNTIME`).
- Emitter: `scripts/sdk-codegen/emitter.mjs:123-127` writes all four unconditionally with `GENERATED_BANNER`.
- No importer in `src/`: `grep -rn "core/base64\|core/file\|core/form-data\|core/runtime" --include="*.ts" wrapper/` excl. `dist` returns zero. `grep -rn "from.*core/file\|import.*base64" wrapper/src/` also zero. `wrapper/src/core/index.ts` re-exports `Headers`, `RawResponse`, `HttpResponsePromise`, `BinaryResponse`, `Supplier`, `headers`, `logging`, `url`, `request`, `AuthProvider`, `RUNTIME` — not the four dead modules.
- Pack snapshot: `wrapper/.packsnapshot` lists `dist/cjs/src/core/file/...` and `dist/cjs/src/api/resources/files/...` — the dead `core/file` files are not the same as `api/resources/files` (image upload). The pack gate `check-pack-snapshot.mjs` blesses whatever `npm pack --dry-run` produces, so it cannot see the dead bytes as drift. The dead modules build to about 1 kB in `dist/` (one function + two types + one re-export).
- `core/auth/index.ts` re-export shim (`NoOpAuthProvider` from `../index.js`) is in the same family (cycle-shaped re-export, not imported by anyone except itself).

**Pack impact:**

| Module | Built bytes | Exported via `package.json` `exports`? | Included in `wrapper/.packsnapshot`? | Imported by any `src/` file? |
|---|---|---|---|---|
| `core/base64.ts` | ~80 B | No | Yes (via `dist/cjs/src/core/...`) | No |
| `core/file/**` | ~60 B + 30 B | No | Yes | No |
| `core/form-data-utils/**` | ~60 B | No | Yes | No |
| `core/runtime/**` | ~50 B | No | Yes | No |

Total dead surface: about 1 kB of the 93-symbol package. Not a size or security concern. The concern is reviewer noise and the precedent that `emitter.mjs` can emit unreferenced modules without a gate.

**Smallest remediation:** In `scripts/sdk-codegen/emitter.mjs`, guard each write with a feature check or drop the four emits entirely. Today no clockify operation uses `multipart/form-data` via `FormData` in the generated client (file upload uses `POST /file/image` with `contentType: "multipart/form-data"` but goes through the generic request path, not `newFormData`). `encodeBase64` is unused. `Uploadable` is unused. `RUNTIME` re-export is already available as `core/index.ts:17`. After dropping the emits, update `wrapper/.packsnapshot` via `npm pack --dry-run`. Alternatively, prune in a post-sync step if the emitter must stay generic. The broader fix is a drift gate: assert `core/**` importers cover all `core/**` files enumerated in `output/ts-sdk/core/`.

### 04.2 Pagination trinity — not bloat

Four surfaces expose pagination:

| Surface | Export subpath | Contract | Caller |
|---|---|---|---|
| `iterAll` / `iterPages` | `clockify-sdk-ts-115/iter` | `fetcher: (request) => Promise<readonly T[]>`; walks `page`/`page-size` honoring `Last-Page` header, falling back to length heuristic; yields items or page envelopes | `wrapper/scoped-client.ts` (scoped `iterProjects` etc.), `mcp/src/tools/workflows/{review,resolve}.ts`, `mcp/src/tools/groups.ts`, all workspace-scoped helpers |
| `paginate` | `clockify-sdk-ts-115/pagination` | `fetchPage: (page, pageSize) => Promise<readonly T[]>`; thin adapter that delegates to `iterAll` | `wrapper/examples/paginate-all.ts`, legacy callers who already have a `(page, pageSize)` callback |
| `PaginatedList<T>` / `paginatedList` | `clockify-sdk-ts-115/paginated-list` | Value object over `iterAll`/`iterPages` with `toArray({ limit })` early-stop and `pages()`; implements `AsyncIterable<T>` | `wrapper/examples/paginated-list-basic.ts`, callers who want to pass a list value around or call `toArray` later |
| Scoped `ws.iterProjects` / `ws.iterTags` / `ws.iterClients` | `clockify-sdk-ts-115/scoped-client` | Wraps `iterAll` with `workspaceId` pre-bound; no `.bind` ritual | Workspace-scoped SDK consumers |

**Why three and not one:**

- `paginate` predates `iterAll` and has no request-object constraint. Callers who compute the page URL themselves or paginate a non-SDK source need `(page, pageSize) => Promise<T[]>`. `iterAll` requires a typed `fetcher(request)` that matches generated list methods — not universally applicable.
- `iterAll` is the only surface that honors `Last-Page` correctly for SDK methods (it feature-detects `withRawResponse`). `paginate` cannot honor it directly because a `(page, pageSize)` callback never carries headers; it delegates to `iterAll` via an adapter (`pagination.ts:15,56`).
- `PaginatedList` adds `toArray({ limit })` with early-stop that avoids extra fetches — not expressible with a bare `for await` without extra state.

**Tests:** `iter.test.ts` 38 tests, `pagination.test.ts` 11 tests, and `paginated-list.test.ts` (implied by the 14-pair coverage) all pass. The trinity is therefore tested and delegates to one page-walk (`iterPages`), so `Last-Page` correctness lives in exactly one place.

**Overclaim:** `pagination.ts:19-22` doc says it "delegates to `iterAll` (which honors the `Last-Page` header…)". The delegation wraps a plain promise (`pagination.ts:41-44`), so `iterPages`'s `hasWithRawResponse` check (`iter.ts:169-175`) always fails on this path and the length heuristic always applies. The iteration still terminates correctly, but the sentence is misleading. Fix the doc: "when used via `paginate`, the length heuristic applies because the callback promise does not carry headers; use `iterAll` directly for header-aware walks."

**Smallest remediation:** Keep all three. Fix the `paginate` doc. Optionally deprecate `paginate` when `iterAll` documentation is sufficient, but do not delete it while `wrapper/examples/paginate-all.ts` exists and the `pagination` subpath is exported (28 exports — removing one is a breaking change).

### 04.3 Other simplification candidates — rejected

- `core/auth/index.ts` re-export shim — generated, cycle-shaped, not imported. Same family as 04.1.
- `spec/fern/` — retained by `AGENTS.md` §8 and `ADR 0005` as evidence of the Fern-to-local-generator migration. Not bloat.
- `release-please` configs — retained-but-retired per `docs/gotchas/release-ci-handoff.md`; `make version-consistency` reconciles.
- `x-clockify-mcp-tools` empty extension on all 168 ops — dead weight, either populate from `docs/mcp-tool-manifest.json` or drop the extension in `GOCLMCP/scripts/gen-clockify-openapi`.
- `AGENTS.md` + `CLAUDE.md` dual contracts — both large, 92/93-name contradiction (D-01). One canonical file plus cross-reference would remove a contradiction class.

---

## 05 Remediation Generality Check

For each top finding, check whether the proposed fix generalizes beyond the immediate instance.

### 05.1 W-01 generality

| Proposal | Covers | Does not cover | Generalizes to |
|---|---|---|---|
| Composite flight key `scopeKey\0noun\0name.toLowerCase()` | Different names same key, different nouns same key | Two clients same `workspaceId` same `name` — already covered by `clientFlightToken` in scoped path; public path still needs a client token if called across SDK instances sharing a `scopeKey` string | Any `ensure*` caller with a shared key namespace. A helper `makeEnsureFlightKey({ scopeKey, noun, name })` centralizes the rule and can be unit-tested standalone. |

### 05.2 W-03 generality

| Proposal | Covers | Does not cover | Generalizes to |
|---|---|---|---|
| Cross-assert test + live-probe label | The flat vs envelope contradiction for all 50 events | The approval `owner` vs `ownerId` sub-conflict, and any per-category payload divergence (e.g., `timeInterval` optionality) | The `verifyClockifyWebhook` vs `constructEvent` contract: once the envelope is decided, the webhook-tool Zod schemas in `mcp/src/tools/webhooks.ts` must match the same discriminant. A shared probe corpus in `spec/evidence/probes/` covers SDK and MCP. |

### 05.3 W-06 generality

| Proposal | Covers | Does not cover | Generalizes to |
|---|---|---|---|
| `isRateLimitError` returns `ClockifyApiError & { statusCode: 429 } & Partial<RateLimitErrorFields>` | The unsound field read. Sibling guards 409/500/503 have no fields, so no breakage. | Callers who already handle `retryAfterMs` as always-defined (they must add `?? getRateLimitFromError(err)`). | All status-based guards. A lint rule could flag `isXError` predicates that assert a subclass while checking only `statusCode`. |

### 05.4 M-06 generality

| Proposal | Covers | Does not cover | Generalizes to |
|---|---|---|---|
| `operation-parity-overrides.json` with `tsMcp` alias mapping + `overrideReason` for every `tsMcp: null` row | The 64-null under-report and the curation-intent invisibility | Future tool renames — requires updating the overrides file | Any OpenAPI operation where `x-fern-sdk-name` and MCP `x-clockify-mcp-tools` diverge. A generator that populates `x-clockify-mcp-tools` from the manifest removes the manual file. |

### 05.5 C-01 generality

| Proposal | Covers | Does not cover | Generalizes to |
|---|---|---|---|
| Add five `MutationCase` entries + assert `cases.length === expected.mutatingLeaves` in `check-cli-write-safety.mjs` | The 30 vs 35 gap and any future drift when a new write leaf is added | The leaf risk values themselves — still governed by commander introspection | Any CLI command tree growth. The count assertion falsifies on every additive PR, forcing the test file to stay in sync. |

### 05.6 G-03 generality

| Proposal | Covers | Does not cover | Generalizes to |
|---|---|---|---|
| Triage every `scripts/check-*.mjs` into doc-drift vs behavior-proof; rename or add real assertion | Doc-consistency gates keep their marker-only form; behavior gates gain one source grep | Gates that are inherently doc-only (e.g., `check-api-docs.mjs`) | The whole contract-gates graph. A one-time audit table — columns: contract doc, claim sentence, current proof type, proposed source assertion — turns the 80/90 ratio into an explicit backlog. |

---

## 06 Unknowns

Record every claim that this audit could not confirm or deny offline. Each lists what would resolve it.

| ID | Claim | Status | Resolution |
|---|---|---|---|
| U-01 | Webhook live wire is envelope vs flat (W-03) | UNKNOWN | Live probe on a sacrificial workspace: create a webhook targeting a request-catcher, trigger `NEW_PROJECT`, `NEW_TIME_ENTRY`, `TIMER_STOPPED`, `APPROVAL_REQUEST_STATUS_UPDATED`, capture bytes in `spec/evidence/probes/*.json`, re-run `npm run type-check`. Until then, both suites are synthetic. |
| U-02 | `page-size > 200` server behavior (W-08) | UNKNOWN | One live `tags.list({ workspaceId, "page-size": 500 })` call; observe 400 vs clamped 200. Local code has no cap; a cap would be a new `RangeError` branch in `iter.ts:230`. |
| U-03 | `mcp-v1.0.1` bundle and tag existence (M-02) | UNKNOWN offline | `git ls-remote --tags origin 'mcp-v*'` and `ls mcp/*.mcpb` after `git fetch --tags`. The clone has `mcp-v0.8.0` and `mcp-v1.0.0`; 1.0.1 is the package version. |
| U-04 | 161/168 vs 134/168 live-success headline (S-02) | UNKNOWN | Read `spec/evidence/live-evidence-manifest.json` campaign mapping vs `spec/corrected/clockify.corrected.openapi.yaml` `x-clockify-live-status` stamps; the 27-op delta is undocumented promotion. |
| U-05 | `balanceAssignment` in `Workspace` — oversight vs intent (W-02) | UNKNOWN | Git history: `git log -S balanceAssignment -- wrapper/scoped-client.ts` and `git show` of the commit that added the 30th getter to `Client.ts`. No record currently exists. |
| U-06 | `TimeEntriesTimeEntry.userId` presence on in-progress wire (MCP unknown 3) | UNKNOWN | Two-user workspace: `timeEntries.listInProgress` — check whether every row has `userId`. `clockify_status` trusts its presence. |
| U-07 | `mutation-ci` mutation score and floor drift | UNKNOWN locally | GitHub Actions **Mutation** workflow dispatch (`workflow_dispatch`, `target=all`) — the only place Stryker runs. Local `make mutation` is forbidden per `AGENTS.md` §0. |
| U-08 | `performance-budgets` startup timings (`cli-version ≤600ms`, `mcp-tools-list ≤1200ms`) under real CI | UNKNOWN locally | `make performance-budgets` solo, creds blanked, no parallel load. Local contentions falsely reds; CI is the authority. |
| U-09 | `as unknown` in generated handlers — any future payload validation bypassed | UNKNOWN statically | No proving read; mutation tests that flip whitelist entries in `bodyFromRequest` would catch bypasses (covered by wire-shape-http cassettes). |
| U-10 | `x-clockify-security-aliases` header names on live 401 (S-03) | UNKNOWN | Sniff `Clockify-Signature-Token` header name via a live webhook delivery capture; the spec's `X-Addon-Key`/`X-Addon-Token` annotation disagrees with `components.securitySchemes.AddonTokenAuth`. |

The audit never claims completeness. Each unknown is a hole in the evidence closure.

---

## 07 Receipts

Every receipt is a read-only command that this subagent executed. No `make {perfect-fast,perfect-full,contract-gates}` was run. No file was written except this one.

| Receipt | Command (short form) | Outcome | Files read |
|---|---|---|---|
| R-01 | `cat wrapper/ensure.ts` + `wrapper/tests/ensure.test.ts` | Verified W-01 keying, test coverage, scoped `flightKey` | `wrapper/ensure.ts:48-69`, `wrapper/tests/ensure.test.ts:18-45`, `wrapper/scoped-client.ts:211-236` |
| R-02 | `cat wrapper/webhook-events.ts:540-680` + `wrapper/webhooks.ts:1-240` + `ls + cat tests/fixtures/webhook-events/*.json` + `webhook-fixtures.test.ts` | Verified W-03 contradiction, fixture labels, discriminant absence | `wrapper/webhook-events.ts:589`, `wrapper/webhooks.ts:118,196-213`, `wrapper/tests/fixtures/webhook-events/*.json` (4), `wrapper/tests/webhook-fixtures.test.ts:51` |
| R-03 | `cat wrapper/errors.ts:460-530` + `cats errors.ts:80-200` + `grep isRateLimitError` | Verified W-06 status narrowing, JSDoc mitigation, caller set | `wrapper/errors.ts:471-494`, `wrapper/errors.ts:130-175`, `wrapper/rate-limit.ts:67-93` |
| R-04 | `node -e` parity probe `docs/operation-parity.json` + `docs/mcp-tool-manifest.json` | 64 null `tsMcp`, renamed coverage hits confirmed | `docs/operation-parity.json` (168 rows), `docs/mcp-tool-manifest.json` (162 tools) |
| R-05 | `python3` parity + manifest + `cli/tests/mutation-leaves.test.ts` name count | 30 cases vs `expected.mutatingLeaves 35`, five missing names isolated | `cli/tests/mutation-leaves.test.ts`, `docs/cli-write-safety-contract.json` |
| R-06 | `check-mutation-safety.mjs` read + `grep includesAll` across `scripts/check-*.mjs` + `Makefile` | About 80/90 gates marker-only, minority with real proof | `scripts/check-mutation-safety.mjs`, `Makefile` `contract-gates` |
| R-07 | `grep -rn "as unknown"` + `grep -rn "as any"` + `grep -rn "ts-expect-error"` | Wrapper 98 (95 generated + 3 hand-written), MCP 16, CLI 0 casts, zero suppressed errors | All `.ts` in `wrapper/`, `mcp/`, `cli/` |
| R-08 | `grep -rn "core/base64\|core/file\|core/form-data\|core/runtime"` + `cat wrapper/src/core/index.ts` + `ls wrapper/src/core/` + `emitter.mjs:123-127` | Four modules zero importers, not re-exported, still emitted and packed | `wrapper/src/core/base64.ts`, `file/`, `form-data-utils/`, `runtime/`, `scripts/sdk-codegen/emitter.mjs` |
| R-09 | `cat wrapper/iter.ts:1-260` + `wrapper/pagination.ts:1-80` + `wrapper/paginated-list.ts:1-160` + `grep paginate iterAll paginatedList` | Trinity delegates to one page-walk, `paginate` doc overclaim | `wrapper/iter.ts`, `wrapper/pagination.ts`, `wrapper/paginated-list.ts`, `wrapper/package.json` exports |
| R-10 | `CLOCKIFY_API_KEY='' npx vitest run wrapper/tests/ensure.test.ts` | 19/19 pass | `wrapper/tests/ensure.test.ts` |
| R-11 | `CLOCKIFY_API_KEY='' npx vitest run wrapper/tests/errors.test.ts` | 91/91 pass | `wrapper/tests/errors.test.ts`, `wrapper/tests/rate-limit.test.ts` implied |
| R-12 | `vitest run wrapper/tests/webhook-events.test.ts + webhook-fixtures.test.ts` | 4/4 + 13/13 pass | Both fixture suites |
| R-13 | `vitest run mcp/tests/work-time-tracking.test.ts` | 8/8 pass | `mcp/tests/work-time-tracking.test.ts` (M-01 sibling) |
| R-14 | `vitest run wrapper/tests/iter.test.ts + pagination.test.ts` | 38/38 + 11/11 pass | Pagination trinity |
| R-15 | `npm run type-check -w clockify-sdk-ts-115` + `clockify-mcp-115` | Both pass EXIT 0 | Workspace tsconfig |
| R-16 | `python3` riskPaths vs mutation-leaves diff | Missing five: `approvals submit-with-type x2` + `timeoff balance-assignment x3` | `docs/cli-write-safety-contract.json` `riskPaths`, `cli/tests/mutation-leaves.test.ts` |
| R-17 | `cat mcp/src/tools/workflows/time-tracking.ts:149-192` | M-01 `stopped as { stopped?: boolean }` wrong slot | `mcp/src/tools/workflows/time-tracking.ts:168-170` |

API keys were never logged. No secret value appears in this file.

---

## Handoff

This file is the Subagent 3 deliverable at `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/.ai-audit/live-validation-hypothesis.md`.

Consumers:

- Subagent 5 (report synthesis) should ingest 02.1–02.6 weakest-valid rows and 03–04 assessments into the consolidated findings.
- Owners of `wrapper/ensure.ts`, `wrapper/errors.ts`, `docs/operation-parity.json`, `cli/tests/mutation-leaves.test.ts`, and `scripts/sdk-codegen/emitter.mjs` own the smallest remediations above.
- The `spec/evidence/probes/` maintainer owns U-01 live-probe closure.

