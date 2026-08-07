# Task for worker

You are a PEER REVIEWER in an adversarial Clockify OpenAPI audit. Your job: attempt to FALSIFY the following four findings produced by other agents. Fresh context — do not trust their conclusions. The repo /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY. Write your review to /tmp/clockify-openapi-audit/reviews/review-A.md.

Credentials: `source /tmp/clockify-openapi-audit/env.sh` in every shell (the key there works; never decode/print it). Workspace is sacrificial — you may mutate and clean up. Use DSAUDITR_ prefixes.

FINDING 1 (HIGH): "time-off-policies.create.approve-is-optional is WRONG in the corrected spec — `approve` IS required on the wire." Claim: POST /workspaces/{ws}/time-off/policies WITHOUT approve → 400 {"message":"must not be null","code":501} even with users supplied; WITH approve → 201. The corrected spec's CreateTimeOffPolicyRequest marks approve optional; official marks it required.
- FALSIFY by: creating a policy without approve (isolate: also try without users, with users filter, with userIds), and with approve. If ANY no-approve create succeeds → finding falsified. Clean up any policy you create (archive → delete; note: DELETE of active policy → 400 "must be archived").
- Also check: does the corrected spec (grep CreateTimeOffPolicyRequest required) really omit approve?

FINDING 2 (MEDIUM): "Corrected spec DELETE /clients/{id} and DELETE /tags/{id} declare NO response body, but live returns the deleted entity object (200 + JSON body)."
- FALSIFY by: creating a client and a tag (DSAUDITR_ prefix), archiving the client (PUT {name, archived:true}), then DELETE each and capture the FULL response body + content-type. If the DELETE response has no body (empty) → finding falsified. Clean up afterwards.

FINDING 3 (MEDIUM): "Corrected spec models DELETE /invoices/{id}/items/{order} with `order` as string; live binds it as integer (400 conversion error on 'abc')."
- FALSIFY by: finding an existing invoice (GET /workspaces/{ws}/invoices, take first id), then DELETE /invoices/{invId}/items/abc → record status/body; DELETE /invoices/{invId}/items/0 → record. If 'abc' does NOT produce a conversion 400 → falsified. Do NOT delete a real item (use only invalid values).

FINDING 4 (HIGH): "Bare GET /shared-reports/{id} response schema is wrong in BOTH specs. Live returns {totals, donutChart, groupTotals, groupOne, filters}; corrected declares SharedReport (list-item shape {filter, fixedDate, id, isPublic, link, name, reportAuthor, type, userId, ...}); official declares TimeEntrySummaryReportDto {chart, groupOne, totals}."
- FALSIFY by: creating a shared report (POST https://reports.api.clockify.me/v1/workspaces/{ws}/shared-reports with name DSAUDITR_..., type SUMMARY, filter {exportType:"JSON_V1", dateRangeStart, dateRangeEnd, summaryFilter:{groups:["PROJECT"], sortColumn:"GROUP"}}), then GET https://reports.api.clockify.me/v1/shared-reports/{id} and compare the top-level keys against BOTH schemas. Record the exact key set. Delete the report afterwards (DELETE → 204 expected).

Report per finding: FALSIFIED / NOT-FALSIFIED / PARTIALLY-FALSIFIED with your own probe records (timestamp, method, path redacted, status, body keys). Redact the API key everywhere. Write only to /tmp/clockify-openapi-audit/reviews/review-A.md.

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