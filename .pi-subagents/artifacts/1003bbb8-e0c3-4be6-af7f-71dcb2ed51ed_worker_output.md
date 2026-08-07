All work complete. The repo modifications visible in `git status` carry timestamps from other audit-group agents (sibling findings artifacts appeared in `/tmp/clockify-openapi-audit/findings/` concurrently); I never wrote to the repo — every write from this session targeted `/tmp/`.

## Completed

Audited all 7 SCHEDULING-group ledger entries against the committed official spec, the corrected spec, the live official spec (`official-live.json`), and 28 live probes (P1–P28) against the sacrificial sandbox. Findings written to `/tmp/clockify-openapi-audit/findings/scheduling.md`.

Headline results:
- **Entries 1–6 (assignments.delete, createRecurring-array/publish-range, project-totals get-vs-post, list-per-project camel-pageSize, literal-vs-parameterized collisions, calculateUsersTotals): all VERIFIED CORRECT** — corrected-spec judgments match live wire behavior; quarantined phantoms confirmed phantom (404 code 3000 "No static resource" vs domain-level 404/400 code 501 on real routes).
- **Entry 7 (`getProjectTotals`): REAL OPEN DISCREPANCY, high-value.** The collection-level `GET /scheduling/assignments/projects/totals` is documented in the live official spec (`deprecated: true`, tag "Scheduling (Deprecated)") but absent from BOTH the committed official and corrected specs — and it **works live**: 200 with `ProjectAssignmentsTotal[]`, `Last-Page` header, required `start`/`end` (400 code 3001 without), kebab `page`/`page-size` honored, `search` filters. The `surface-add-2026-08-05` ledger entry wrongly lumped it into "deprecated ⇒ skip".
- **UNLEDGERED-DIFFERENCES (5):** recurring-span ≤ 1 week server rule (code 501); wire field is `hoursPerDay` not `durationMinutes`; POST totals also emits `Last-Page`; nullability nits (`clientName`/`taskId`/`taskName`/`userStatus`/`workingDays` return null live but are typed non-nullable); page-size cap 200 consistent.
- **Mutations cleaned up:** created recurring assignment deleted; note-scoped leftover scan = 0. API key never decoded/printed; workspace ID fully redacted from the report.

## Files Changed
- `/tmp/clockify-openapi-audit/findings/scheduling.md` — full audit report (created; repo untouched)
- `/tmp/clockify-openapi-audit/probe.sh` — probe helper (created)

## Notes
- Repo `git status` shows pre-existing/sibling-agent modifications (Makefile, two scripts, `.pi-subagents/`) with timestamps from other audit agents — none from this session; this session wrote only to `/tmp/`.
- Residual risk: the `PUT /publish` probe window overlapped a pre-existing "Test data 2025" draft-era assignment (200 empty response); noted in report.