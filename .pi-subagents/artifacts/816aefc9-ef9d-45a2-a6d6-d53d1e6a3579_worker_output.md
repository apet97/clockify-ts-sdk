The findings file is complete. Final verification of the repo state and probe artifacts is done. Here is the completed audit report.

## Completed

Full adversarial audit of the TIME ENTRIES + TIMER + PAGINATION + LIST ENDPOINTS group, with **55+ live probes** against the sacrificial sandbox workspace, spec cross-checks (corrected / official / official-live / generator / wrapper), and cleanup verification. Findings written to `/tmp/clockify-openapi-audit/findings/time-entries-pagination.md` (200 lines). All 8 ledger entries audited; 8 unledgered differences surfaced (U1–U8).

Key verdicts:
- **`entries.timer.stop`** — holds with boundary clarification: raw API idle stop → 404 code:404 (domain); the "clean no-op" is tool-layer only. Full lifecycle verified live (start via POST no-end → in-progress 1 → PATCH {end} → 200 stopped → in-progress []).
- **`entries.stoptimer.route-404`** — confirmed: /stop route 404 code:3000 on PATCH+GET; corrected quarantine correct.
- **`mark-invoiced.bulk-route-404`** — confirmed: all 6 verbs 404 code:3000; singular route exists (400 with fake ids).
- **`last-page-header`** — **ledger stale: 18 emit, not 15** (expenses, expenses/categories, invoices verified live as emitters); corrected spec's 18 stamps all live-verified; 3 non-emitting confirmed.
- **`iter-known-set`** — confirmed: 14 methods; balances envelope `{balances,count}` (count **970 today, not 966** — drifted), webhooks envelope non-paginated, holidays/in-period bare array ignores page-size.
- **`deferred-list-endpoints`** — confirmed: /workspaces ignores page-size (33), /balance phantom 404, holidays/in-period ignores.
- **`pagination-params-stamped`** — confirmed: all 21 PAGINATED_LIST_OPS carry page+page-size in corrected.
- **`getBalanceForUser.page-types`** — confirmed, new corroboration: official-live.json itself declares `string`; corrected int32 works live.

New findings: `types` query param live-accepted on GET /approval-requests but absent from corrected AND static official (official-live has it); `kioskId` missing from corrected `TimeEntriesTimeEntry`; corrected missing 200 schemas on GET /invoices + payments; DELETE returns 200+body (ledger prose says 204); idle-stop 404 undocumented.

## Files Changed
- `/tmp/clockify-openapi-audit/findings/time-entries-pagination.md` - created (full audit report, per-entry tables + UNLEDGERED-DIFFERENCES)
- Probe artifacts: `/tmp/clockify-openapi-audit/probes/` (~230 files incl. `summary.txt`) - raw evidence

## Notes
- Repo (clockify-ts-sdk + GOCLMCP) never written to; git status clean.
- API key never decoded/printed; workspace ID is the sandbox ID already public in the ledger.
- All DSAUDIT_ resources cleaned up (3 time entries deleted, project archived+deleted, 0 running timers).