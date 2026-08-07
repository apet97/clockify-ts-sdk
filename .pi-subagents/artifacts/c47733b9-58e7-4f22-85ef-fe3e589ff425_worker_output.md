## Completed

Completed the full TIME OFF audit: read the ledger entries, committed official snapshot, corrected spec, today-fetched live official spec, and the generator script (`PHANTOM_PATHS`, `apply_live_overrides!`, `SOURCE_PRIORITIES`); ran 46 live probes against the sacrificial sandbox covering every mandatory test; verified all 18 ledger entries plus 8 unledgered differences; cleaned up all artifacts (one REJECTED request left by design — no delete path exists); wrote the full findings to `/tmp/clockify-openapi-audit/findings/timeoff.md`.

**Headline results:**
- **13/18 entries CONFIRMED_CURRENT** (1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 15, 16, 17, 18 — with minor refinements on 6, 10, 12).
- **Adversarial hit — entry 13 (`time-off-policies.create.approve-is-optional`): the corrected spec is WRONG.** Live: create without `approve` → 400 `"must not be null"` even with users supplied (isolation probe persisted); create with `approve` → 201. The official spec (approve required) is right; the 2026-07-12 "fixed-in-canonical-source" correction removed a wire-required field. Severity HIGH.
- **Entry 14 PARTIALLY_CONFIRMED:** `color`/`icon` are real wire fields; `hasExpiration` is never returned (0/50 list + single GET + create echo) — the corrected `Policy` over-adds it; the live official spec added color/icon only (and is wire-accurate on hasExpiration).
- **Official caught up on:** status-schema collision, missing top-level fields, status union + note-optional, policy-scoped delete/status routes, `negativeBalanceUsed` (live spec now has it), balance-assignment surface (create 201 / update 204 / delete 200 + required note body).
- **Official NOT caught up:** sort-order enum (still plain string), page/page-size string types, `approve` required (correctly), `PolicyDtoV1` (committed snapshot still lacks color/icon).
- **Unledgered (8):** PATCH policy-status rejects `ALL` (both specs' enums wrong); corrected `CreateTimeOffRequest` requires `note` (wire: optional); corrected `Policy.hasExpiration` never on wire; create policy requires ≥1 user/user-group id (unmodeled); policy-scoped PATCH fake-id drifted 400→403; DELETE-REJECTED → guarded 400 "cannot be withdrawn"; HOURS `.000Z` accepted today (2026-06-21 sub-claim not reproducible); `sort-order` unvalidated on wire; WAF 403-HTML quirk on bare GETs.

**⚠ Sandbox state flag for the parent:** the ledger's long-standing reference policy "1111" (`696fd7f25dd6c5510bafa772`) was deleted during the mandatory archive-then-delete test and **recreated with identical configuration under new id `6a762abfbc90837d5f495b15`**. Hard-coded references to the old id will now fail. One REJECTED request remains (no delete path — recorded as a finding, per instructions).

## Files Changed
- `/tmp/clockify-openapi-audit/findings/timeoff.md` — full group findings (created)
- `/tmp/clockify-openapi-audit/probes/*` — 40+ probe response bodies + `records.tsv` (evidence)
- The repository itself was **not** modified (read-only respected; `git status` shows only pre-existing harness dirs).

## Notes
- Entry 6's ledger text ("fake id → 400") should be updated to today's 403 "Access Denied" (route-exists conclusion unchanged).
- Ledger entry 18's prose ("still not live-promoted") is stale: the corrected spec now stamps all four balance-assignment ops `live-success` (2026-08-05 notes), corroborated by today's probes.
- Regression-test references cited by the ledger all exist (`mcp/tests/time-off-policies.test.ts`, `timeoff-delete.test.ts`, `time-off-get.test.ts`, `time-off-search-statuses.test.ts`, `sweep-fixes.test.ts`, `time-off-half-day.test.ts`, `cli/tests/timeoff.test.ts`; GOCLMCP `TestGeneratedOpenAPIChangeTimeOffRequestStatusNoteOptional` in `tests/doc_parity_test.go`).