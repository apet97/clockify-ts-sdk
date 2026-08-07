# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/time-entries-pagination.md (create it).

YOUR GROUP: TIME ENTRIES + TIMER + PAGINATION + LIST ENDPOINTS.

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only — PAGINATED_LIST_OPS, LAST_PAGE_HEADER_OPS)
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/tests/iter.test.ts (regression tests)
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/wrapper/iter.ts (the pagination wrapper)

LEDGER ENTRIES TO AUDIT:
1. `entries.timer.stop` (seed ~line 340): idle stop is clean no-op (stopped:false, reason:"no timer running"), not 404
2. `entries.stoptimer.route-404-no-static-resource` (~238): the PATCH /user/{userId}/time-entries route — quarantined; callers bound to the working route
3. `time-entries.mark-invoiced.bulk-route-404-deferred` (~2326): PATCH /time-entries/invoiced/bulk → 404 (all verbs); singular /invoiced works
4. `pagination.last-page-header.live-audit-2026-05-25` (~1546): 15 endpoints emit Last-Page; 3 don't (custom-fields, holidays, projects/{id}/custom-fields — ignore page-size, return full collection)
5. `pagination.iter-known-set.envelope-and-unpaginated` (~1548): KNOWN_PAGINATED_METHODS set (14 entries); balances.getForUser returns {balances,count} envelope (966 count at page 1? re-verify); webhooks {workspaceWebhookCount, webhooks} non-paginated envelope; holidays/in-period bare array ignores page-size
6. `deferred-list-endpoints.not-paginated-or-not-live` (~992): re-probe
7. `gen-clockify-openapi.pagination-params-stamped` (~517): page+page-size stamped on 21 list endpoints
8. `getBalanceForUser.page-types.docs-claim-string` (~1120): balance user page types (docs claim string vs integer?) — check the balance list envelope {balances, count} and page types

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace):
- GET /workspaces/{ws}/user/{userId}/time-entries?page=1&page-size=2 — Last-Page header present?; page=999 → Last-Page:true?
- POST /workspaces/{ws}/user/{userId}/time-entries — create a time entry (start/end or start+duration; the workspace may require a project — use an existing project or create one with DSAUDIT_ prefix), GET it back, PATCH stop, DELETE it
- POST /workspaces/{ws}/time-entries (create for self): does the response return the created entry? (corrected spec: what response?) — official claims TimeEntryDtoV1
- PATCH /workspaces/{ws}/time-entries/invoiced/bulk — fake body: 404 No static resource (all verbs: GET/POST/PUT/PATCH/DELETE/OPTIONS)?
- PATCH /workspaces/{ws}/time-entries/invoiced — with fake time-entry ids: 400 (route exists)?
- Timer stop: PATCH /workspaces/{ws}/user/{userId}/time-entries with {end:...} when NO timer running — what status/body? (no-op vs 404?)
- GET /workspaces/{ws}/time-entries/status/in-progress — 200? shape?
- GET /workspaces/{ws}/time-off/balance/user/{userId} — envelope {balances, count}? Last-Page header? page=1&page-size=2 honored? (the ledger says 50 rows, count 966 — verify count/rows today)
- GET /workspaces/{ws}/webhooks — envelope {workspaceWebhookCount, webhooks}? page-size ignored?
- GET /workspaces/{ws}/holidays/in-period?start&end — bare array? page-size ignored?
- GET /workspaces/{ws}/custom-fields?page-size=2 — full collection returned? (confirm)
- GET /workspaces/{ws}/approval-requests?page=1&page-size=2 — Last-Page? (also check the `types` query param the live official documents — is it accepted?)
- Also test 3-4 of the 15 Last-Page endpoints at random: clients, projects, tasks, users — Last-Page header present?
- Use DSAUDIT_ prefixes; clean up everything you create.

Also verify in specs: which ops carry x-clockify-last-page-header:true in the corrected spec (count), do they match the 15 documented? Does the corrected spec carry page/page-size on the 21 PAGINATED_LIST_OPS? Compare corrected vs live official params for GET /user/{userId}/time-entries and GET /approval-requests (live official has `types` param — corrected does NOT — is that param functional live?).

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