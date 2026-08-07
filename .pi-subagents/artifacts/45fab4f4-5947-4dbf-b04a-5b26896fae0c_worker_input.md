# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/reports.md (create it).

YOUR GROUP: REPORTS + SHARED REPORTS (weekly/detailed/summary/attendance/expense, shared-reports CRUD).

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only)

LEDGER ENTRIES TO AUDIT:
1. `reports.weekly.exact-seven-day-window` (~3418): generateWeeklyReport — live accepts exactly 7 days (inclusive 7-calendar-day or exclusive 7-day); 8 days → 400 code 501 "Please select date range of exactly 7 days for weekly report". The official/locked-source description says max one month (31 days)
2. `shared-reports.create.success-code-201-vs-200` (~3444): POST /shared-reports returns 200 (not 201); corrected now says 200
3. `reports.*` money units (seed list ~line 340): amounts in minor units (cents); totals keys family-specific (totals_summary, group_totals_summary, weekly_totals_summary)
4. `single-gets.404-405-read-from-list` (~2206) — shared-reports part: GET /shared-reports/{id} (live official documents query params dateRangeEnd/dateRangeStart/page/pageSize/sortColumn/sortOrder; corrected only has exportType — test which params the live endpoint actually accepts/needs)

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace). Reports host: https://reports.api.clockify.me/v1. Shared reports host: https://reports.api.clockify.me/v1 too (per corrected spec servers):
- POST https://reports.api.clockify.me/v1/workspaces/{ws}/reports/weekly — 7-day window (start 2026-08-03T00:00:00Z, end 2026-08-10T00:00:00Z — verify against today's date, adjust to a 7-day window ending today or earlier; inclusive form start=...T00:00:00Z end=...+7d-1ms or exclusive end=+7d) → 200? Then 8-day window → 400? (record message/code)
- POST reports/detailed and reports/summary — with a small valid body (dateRangeStart/End + optional filters): 200? Check response: does it include totals in minor units? keys (totals vs totals_summary)?
- POST /workspaces/{ws}/shared-reports — create a SUMMARY-type shared report (minimal body: name, type SUMMARY, detailedFilter?) → record status code (200 vs 201) and response body (does it return the shared report with id?)
- GET /workspaces/{ws}/shared-reports — list; note query params (page/pageSize? sharedReportsFilter?) — does page/pageSize work?
- GET /workspaces/{ws}/shared-reports/{id} — with the created id: 200? response shape: SharedReport object (corrected) vs TimeEntrySummaryReport (official)? Which fields?
- GET /shared-reports/{id} (path WITHOUT workspace, operationId generateSharedReportV1, host reports.api.clockify.me) — with the id: 200? does it accept dateRangeStart/dateRangeEnd/exportType query params? Test exportType=JSON_V1 (or JSON)? What is the response shape? (corrected says SharedReport, official says TimeEntrySummaryReport)
- PUT /workspaces/{ws}/shared-reports/{id} — update (name change): 200?
- DELETE /workspaces/{ws}/shared-reports/{id} — 204? then GET → 404 (cleanup proof)
- Use DSAUDIT_ prefixes for report names. Clean up all shared reports you create.

Also verify in specs: corrected spec servers for reports ops (reports.api.clockify.me/v1); official committed spec has no servers; the x-clockify-live-status stamps; does official-live.json carry the shared-reports POST as 200 or 201? Does the corrected spec's shared-report GET include the query params the live official documents?

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