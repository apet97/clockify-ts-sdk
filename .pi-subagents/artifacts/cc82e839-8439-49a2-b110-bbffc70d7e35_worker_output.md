## Completed

All 13 ledger entries audited (A), structural checks a–k executed (B), 6 unledgered differences found (C), drift-tooling weakness assessment produced (D). Findings written to `/tmp/clockify-openapi-audit/findings/generator-tooling.md`. Repo untouched (`git status` shows only the pre-existing untracked dirs).

**Headline verdicts:** all 13 ledger entries verified as claimed (12 RESOLVED/CLOSED, 1 HISTORICAL with medium confidence since Fern CLI can't be re-run offline). Structural checks: both specs + live JSON parse and all internal `$ref`s resolve (0 unresolvable; only benign recursive cycles); corrected byte-identical to GOCLMCP canonical (sha256 `abebc826…`); 21/21 pagination stamps, 18/18 last-page stamps, 35/35 phantom paths absent; live-status 161 live-success / 6 probe-documented / 1 documented; 0 "DOCUMENTED BUT BROKEN" summaries; `--fetch` reproduces exactly the ledger's 7 deprecated live-official ops; Redocly 2.46.0: official 1 error (no servers) + 266 warnings, corrected 8 errors (7× `nullable`-without-`type` in custom-field schemas + 1 missing summary on limited-users POST) + 237 warnings.

**Most important finding (Section C):** the drift tooling compares only response-code sets, requestBody presence, host/auth notes — it is blind to parameters, response/request schema names, enums, and requiredness. That blindness hides 4 genuine unledgered param drops in the corrected spec vs the live official (all traceable to `probe-openapi` priority-30 source shadowing over `aiii-openapi` 15): `strict-name-search` + `excluded-ids` on GET /tags, `archive-projects` + `mark-tasks-as-done` on PUT /clients/{id}, 6 report-generation params on the bare GET /shared-reports/{id}, and `sharedReportsFilter` on the shared-reports list. Plus 62 response-schema and 76 request-body renames that no repo gate can see.

## Files Changed
- `/tmp/clockify-openapi-audit/findings/generator-tooling.md` — the full findings report (created)
- `/tmp/clockify-openapi-audit/struct.mjs` — audit helper script (created, /tmp only)
- `/tmp/clockify-openapi-audit/redocly/` — Redocly install + spec copies (created, /tmp only)

## Notes
- No live API-key probes were needed; the only network call was the repo's own credential-free `--fetch` of `docs.clockify.me/openapi.json`.
- The ledger's 2026-08-05 "156/168 live-success" numerator is stale by 5 (balance-assignment ×4 + `getMultipleTimeEntries` are now live-success), consistent with that entry's own promotion plan.
- The ledger's "41 nullable uses, all on plain types" claim conflicts with Redocly: 7 nullable uses lack `type` entirely.
- No blockers for review; recommendations are ledger additions (Section C items) plus a param-level comparison in the drift tooling (Section D).