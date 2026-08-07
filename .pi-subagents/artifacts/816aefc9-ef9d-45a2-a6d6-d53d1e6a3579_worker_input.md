# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/time-entries-pagination.md (create it).

YOUR GROUP: TIME ENTRIES + TIMER + PAGINATION + LIST ENDPOINTS.

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only — PAGINATED_LIST_OPS, LAST_PAGE_HEADER_OPS)
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/iter.test.ts and /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/iter.ts (regression tests)

LEDGER ENTRIES TO AUDIT (grep for IDs):
1. `entries.timer.stop` (seed ~340): idle stop is clean no-op (stopped:false, reason:"no timer running"), not 404
2. `entries.stoptimer.route-404-no-static-resource` (~238): quarantined route
3. `time-entries.mark-invoiced.bulk-route-404-deferred` (~2326): PATCH /time-entries/invoiced/bulk → 404 (all verbs); singular /invoiced works
4. `pagination.last-page-header.live-audit-2026-05-25` (~1546): 15 endpoints emit Last-Page; 3 don't (custom-fields, holidays, projects/{id}/custom-fields — ignore page-size, return full collection)
5. `pagination.iter-known-set.envelope-and-unpaginated` (~1548): KNOWN_PAGINATED_METHODS set (14); balances.getForUser {balances,count} envelope (count 966? re-verify); webhooks {workspaceWebhookCount, webhooks} non-paginated; holidays/in-period bare array ignores page-size
6. `deferred-list-endpoints.not-paginated-or-not-live` (~992): re-probe
7. `gen-clockify-openapi.pagination-params-stamped` (~517): page+page-size on 21 list endpoints
8. `getBalanceForUser.page-types.docs-claim-string` (~1120)

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace):
- GET /workspaces/{ws}/user/{userId}/time-entries?page=1&page-size=2 — Last-Page header present? page=999 → Last-Page:true?
- POST /workspaces/{ws}/user/{userId}/time-entries — create entry (use existing project or create DSAUDIT_ project), GET back, PATCH stop, DELETE
- POST /workspaces/{ws}/time-entries — create for self: response contains the created entry? (official claims TimeEntryDtoV1 — what does corrected claim and what comes back?)
- PATCH /workspaces/{ws}/time-entries/invoiced/bulk — fake body: 404 No static resource? (also GET/POST/PUT/DELETE/OPTIONS on that path — all 404?)
- PATCH /workspaces/{ws}/time-entries/invoiced — fake ids: 400 (route exists)?
- Timer stop: PATCH /workspaces/{ws}/user/{userId}/time-entries with {end:...} when NO timer running — status/body? (no-op vs 404?)
- GET /workspaces/{ws}/time-entries/status/in-progress — 200? shape?
- GET /workspaces/{ws}/time-off/balance/user/{userId} — envelope {balances, count}? Last-Page? page=1&page-size=2 honored? (ledger: 50 rows, count 966 — verify)
- GET /workspaces/{ws}/webhooks — envelope {workspaceWebhookCount, webhooks}? page-size ignored?
- GET /workspaces/{ws}/holidays/in-period?start&end — bare array? page-size ignored?
- GET /workspaces/{ws}/custom-fields?page-size=2 — full collection returned?
- GET /workspaces/{ws}/approval-requests?page=1&page-size=2 — Last-Page? also test `types` query param (live official documents it; corrected does NOT) — is it accepted?
- 3-4 more of the 15 Last-Page endpoints: clients, projects, tasks, users — Last-Page present?
- Use DSAUDIT_ prefixes; clean up everything you create.

Also verify: which ops carry x-clockify-last-page-header:true in the corrected spec (count; do they match the 15?); page/page-size on the 21 PAGINATED_LIST_OPS; corrected vs live official params for GET /user/{userId}/time-entries and GET /approval-requests.

Report per entry: ID | status | corrected judgment | official judgment | confidence | severity | live probe record | recommended action. End with UNLEDGERED-DIFFERENCES section. Redact the API key everywhere.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```