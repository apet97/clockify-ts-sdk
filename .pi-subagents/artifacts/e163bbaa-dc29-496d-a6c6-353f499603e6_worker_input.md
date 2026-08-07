# Task for worker

You are a PEER REVIEWER in an adversarial Clockify OpenAPI audit. Your job: attempt to FALSIFY the following five "missing/unledgered surface" findings produced by other agents. Fresh context — do not trust their conclusions. The repo /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY. Write your review to /tmp/clockify-openapi-audit/reviews/review-C.md.

Credentials: `source /tmp/clockify-openapi-audit/env.sh` in every shell (the key works; never decode/print it). Workspace is sacrificial. Use DSAUDITR_ prefixes; clean up everything.

FINDING 1 (MEDIUM): "GET /workspaces/{ws}/scheduling/assignments/projects/totals (collection-level GET, operationId getProjectTotals, deprecated:true in live official) is LIVE and functional (200 with ProjectAssignmentsTotal[] + last-page header), but ABSENT from the corrected spec."
- FALSIFY by: GET with ?start=2025-08-07T00:00:00Z&end=2026-08-07T00:00:00Z&page=1&page-size=2. If non-200 or phantom 404 (code 3000 "No static resource") → falsified. Also grep the corrected spec for that path+method (should be absent).

FINDING 2 (MEDIUM): "PUT /workspaces/{ws}/clients/{id} accepts and HONORS optional query params archive-projects=true and mark-tasks-as-done=true (both in the official spec; dropped from the corrected spec)."
- FALSIFY by: create client + project + task (project under the client, task on the project), then PUT /clients/{id}?archive-projects=true&mark-tasks-as-done=true {name, archived:true} → then GET the project (archived?) and GET the task (status DONE?). If either cascade did not apply → falsified. Clean up: delete client (archived already), project, task.

FINDING 3 (LOW): "GET /workspaces/{ws}/shared-reports accepts sharedReportsFilter=ALL|CREATED_BY_ME|SHARED_WITH_ME (official documents it; corrected spec omits it)."
- FALSIFY by: GET /workspaces/{ws}/shared-reports?sharedReportsFilter=CREATED_BY_ME&pageSize=2 → record status. If 400/ignored → falsified.

FINDING 4 (LOW): "GET /workspaces accepts roles as a multi-value param (repeated and comma forms both 200); corrected spec models it as an array with enum [WORKSPACE_ADMIN, OWNER, TEAM_MANAGER, PROJECT_MANAGER]; official models string."
- FALSIFY by: GET /workspaces?roles=WORKSPACE_ADMIN (expect 200), ?roles=OWNER&roles=TEAM_MANAGER (expect 200), ?roles=ADMIN (expect 400 code 501). If ADMIN returns 200 → falsified.

FINDING 5 (LOW): "pto.api.clockify.me is ALIVE — serves the same API gateway with the same credentials (200 on /api/v1/user with valid key, 401 code 1000 without)."
- FALSIFY by: curl -sS -o /dev/null -w "%{http_code}" https://pto.api.clockify.me/api/v1/user with and without the key. If connection fails or both 401 → falsified. NOTE: this finding does NOT change the routing decision — the corrected spec has no pto-bound operations and the maintainer has decided NOT to re-add the host; the finding is purely about the evidence wording ("dead host").

Report per finding: FALSIFIED / NOT-FALSIFIED / PARTIALLY-FALSIFIED with your own probe records (timestamp, method, redacted path, status, key body fields). Redact the API key everywhere. Write only to /tmp/clockify-openapi-audit/reviews/review-C.md.

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