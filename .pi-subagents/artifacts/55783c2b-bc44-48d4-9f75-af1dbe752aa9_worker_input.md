# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/scheduling.md (create it).

YOUR GROUP: SCHEDULING (assignments, recurring, totals, publish).

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only)

LEDGER ENTRIES TO AUDIT:
1. `scheduling.assignments.delete` (seed list ~line 337): real route is DELETE /scheduling/assignments/recurring/{id}; bare /scheduling/assignments/{id} returns 404
2. `scheduling.createRecurring.returns-array-and-publish-is-range-scoped` (~1526): POST /scheduling/assignments/recurring returns 201 ARRAY; publish is range-scoped PUT /scheduling/assignments/publish
3. `scheduling.project-totals.get-vs-post` (~2187): single-project totals at GET .../projects/totals/{projectId}?start&end (start/end REQUIRED); all-projects search is POST .../projects/totals
4. `scheduling.list-per-project.start-end-required-camel-pagesize` (~2541): POST totals requires start AND end; body whitelist uses camel pageSize only (kebab page-size silently ignored)
5. `routes.literal-vs-parameterized.collisions` (~176) — scheduling part: GET /scheduling/assignments/publish → 405 (PUT-only); GET /scheduling/assignments/{24hex} → 404 No static resource
6. `scheduling.calculateUsersTotals` (seed list ~line 350ish): POST /scheduling/assignments/users/totals — 404 both verbs
7. NEW: the live official spec now documents `GET /workspaces/{workspaceId}/scheduling/assignments/projects/totals` (operationId getProjectTotals) — a collection-level GET that the corrected spec does NOT have (corrected has POST .../projects/totals and GET .../projects/totals/{projectId}). TEST THIS LIVE: GET with start/end query params — does it work? What does it return?

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace):
- GET /scheduling/assignments/all?start&end (1-year window) — 200? pagination Last-Page?
- POST /scheduling/assignments/recurring — create a draft assignment (needs userId, projectId, startDate/dates, durationMinutes... use sandbox project/user; if you cannot create a valid assignment, at least probe with an invalid body to confirm route + required fields) — response: array? 201? then DELETE /scheduling/assignments/recurring/{id}
- DELETE /scheduling/assignments/{assignmentId} with fake 24-hex id → 404 No static resource?
- DELETE /scheduling/assignments/recurring/{id} with fake id → 400 (route exists)?
- PUT /scheduling/assignments/publish — route exists? probe with fake/empty body: 400 vs 404
- POST /scheduling/assignments/projects/totals — with and without start/end (expect 400 without), with camel pageSize vs kebab page-size (kebab ignored → 21 items?)
- GET /scheduling/assignments/projects/totals/{projectId}?start&end (single project, real project id) and WITHOUT start/end (400?)
- GET /scheduling/assignments/projects/totals (collection-level GET — the NEW live-official op): with start/end query params — 200 or 404/405?
- POST /scheduling/assignments/users/totals — 404 No static resource?
- GET /scheduling/assignments/users/{userId}/totals?start&end — with fake user id: 400/404?
- PATCH /scheduling/assignments/recurring/{id}, PUT /scheduling/assignments/series/{id}, POST /scheduling/assignments/{id}/copy, POST /scheduling/assignments/user-filter/totals — fake-id probes: route exists (non-phantom 4xx) vs No static resource?
- Use DSAUDIT_ prefixes; delete everything you create (recurring assignment delete). A draft assignment left over is a cleanup failure — try to delete it; if delete fails, note it.

Compare corrected spec claims vs official (committed AND live) vs live behavior. Note x-clockify-live-status stamps. Report per entry: ID | status | corrected judgment | official judgment | confidence | severity | live probe record | recommended action. End with UNLEDGERED-DIFFERENCES section. Redact the API key everywhere.

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