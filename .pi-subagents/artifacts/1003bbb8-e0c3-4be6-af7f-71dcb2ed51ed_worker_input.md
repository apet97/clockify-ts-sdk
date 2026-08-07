# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/scheduling.md (create it).

YOUR GROUP: SCHEDULING (assignments, recurring, totals, publish).

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only)

LEDGER ENTRIES TO AUDIT (grep for IDs):
1. `scheduling.assignments.delete` (seed ~337): real route DELETE /scheduling/assignments/recurring/{id}; bare /scheduling/assignments/{id} 404s
2. `scheduling.createRecurring.returns-array-and-publish-is-range-scoped` (~1526): POST /scheduling/assignments/recurring returns 201 ARRAY; publish is range-scoped PUT /scheduling/assignments/publish
3. `scheduling.project-totals.get-vs-post` (~2187): single-project totals GET .../projects/totals/{projectId}?start&end (start/end REQUIRED); all-projects search POST .../projects/totals
4. `scheduling.list-per-project.start-end-required-camel-pagesize` (~2541): POST totals requires start AND end; body whitelist camel pageSize only (kebab page-size silently ignored)
5. `routes.literal-vs-parameterized.collisions` (~176) scheduling part: GET /scheduling/assignments/publish → 405 (PUT-only); GET /scheduling/assignments/{24hex} → 404 No static resource
6. `scheduling.calculateUsersTotals` (seed ~350): POST /scheduling/assignments/users/totals — 404 both verbs
7. NEW: live official spec now documents GET /workspaces/{workspaceId}/scheduling/assignments/projects/totals (getProjectTotals) — collection-level GET the corrected spec does NOT have. TEST LIVE: GET with start/end query params — works? shape?

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace):
- GET /scheduling/assignments/all?start&end (1-year window) — 200? Last-Page?
- POST /scheduling/assignments/recurring — create draft assignment (needs userId/projectId/dates/durationMinutes... use sandbox project+user; invalid body probes still confirm route + required fields) — response: 201 array? then DELETE /scheduling/assignments/recurring/{id}
- DELETE /scheduling/assignments/{assignmentId} fake 24-hex → 404 No static resource?
- DELETE /scheduling/assignments/recurring/{id} fake id → 400 (route exists)?
- PUT /scheduling/assignments/publish — empty/fake body: 400 vs 404?
- POST /scheduling/assignments/projects/totals — without start/end (expect 400), with camel pageSize vs kebab page-size (kebab ignored?)
- GET /scheduling/assignments/projects/totals/{projectId}?start&end (real project id) and WITHOUT (400?)
- GET /scheduling/assignments/projects/totals (collection GET — the NEW live-official op): with start/end query params — 200 or 404/405?
- POST /scheduling/assignments/users/totals — 404 No static resource?
- GET /scheduling/assignments/users/{userId}/totals?start&end — fake user id: 400/404?
- PATCH /scheduling/assignments/recurring/{id}, PUT /scheduling/assignments/series/{id}, POST /scheduling/assignments/{id}/copy, POST /scheduling/assignments/user-filter/totals — fake-id probes: route exists (non-phantom 4xx) vs No static resource?
- Use DSAUDIT_ prefixes; delete everything you create; note any failed cleanup.

Compare corrected vs official (committed AND live) vs live behavior. Note x-clockify-live-status stamps. Report per entry: ID | status | corrected judgment | official judgment | confidence | severity | live probe record | recommended action. End with UNLEDGERED-DIFFERENCES section. Redact the API key everywhere.

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