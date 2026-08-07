# Task for worker

You are testing the Clockify "Deleted entities (Experimental)" API endpoint exhaustively. All prose in ASD-STE100-informed English: short active sentences, one idea per sentence, precise modals. Evidence-first: never invent a result; save every raw response body + HTTP status to files; record exact timestamps.

ENDPOINT: GET https://api.clockify.me/api/v1/workspaces/{workspaceId}/entities/deleted
API KEY (header x-api-key): YmQ4NTRjZWEtMjZkZC00ZTkwLWE2NjgtOTZkMDdjZTk0NzIy
WORKSPACE ID: 65b382b606de527a7ee2b60e (SACRIFICIAL SANDBOX - mutations allowed here only; never touch any other workspace)
Current date: 2026-08.

DOCUMENTED CONTRACT (Clockify API docs):
- Returns records deleted within a date range (start/end).
- Docs note: deletions reflect in this endpoint ~1 minute after deletion. Entities created AND deleted within the request date range will NOT appear.
- Auth: ApiKeyAuth (x-api-key) or AddonKeyAuth (x-addon-token).
- Path: workspaceId (string, 24-hex).
- Query: type (required, array; accepted values: APPROVAL_REQUESTS, BALANCE, CLIENTS, CUSTOM_FIELDS, HOLIDAYS, INVOICES, PROJECTS, PTO_POLICY, SCHEDULED_ASSIGNMENT, TAGS, TASKS, TIME_ENTRY, TIME_ENTRY_CUSTOM_FIELD_VALUE, TIME_ENTRY_RATE, TIME_OFF_REQUEST, USER, USER_GROUPS), start/end (optional, yyyy-MM-ddThh:mm:ssZ; if one is missing the other defaults to a 30-day range), page (default "0"), limit (default "50").
- Docs sample response: {"response":[{"deletedAt":"...","document":{},"documentCode":"string","id":"string"}]}. Live baseline shows a bare [] when the log is empty.
- Repo reference (READ-ONLY): /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml line ~2105; operationId getDeletedEntityInfo; response schema PageableCollectionLogBinDocumentDto {response:[LogBinDocumentDto]}; ChangeTrackerDocumentType enum = the 17 values above; SDK surface client.entityChangesExperimental.listDeleted.

RULES:
- REPO /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk IS READ-ONLY. Never write any file inside it. Write all scripts/evidence under your assigned /tmp lane dir only.
- Sleep 0.3-0.5s between API calls; send header "x-request-id: delent-<lane>-<seq>".
- Use curl + jq only. Full raw bodies go to files; summaries truncate at 300 chars.
- On a surprising result, run one focused follow-up probe to confirm before recording.
- End state: write findings JSON + return a compact structured summary (max ~60 lines), strongest facts first, plus exact evidence file paths.

LANE B - BEHAVIORAL LIFECYCLE (mutations in the sacrificial sandbox only). Lane dir: /tmp/delent/b/ (mkdir -p). Evidence: /tmp/delent/b/evidence/. Timeline: /tmp/delent/b/timeline.jsonl (append one JSON line per action: {step, action, entityType, id, tsUTC, http}). Findings: /tmp/delent/b/findings-b.json.
Entity API base: https://api.clockify.me/api/v1/workspaces/65b382b606de527a7ee2b60e/
Name prefix for all created entities: delent-B- (unique suffixes with timestamp+random).
Archive-then-delete rule: projects, clients, tasks need PUT {archived:true} before DELETE. Tags and time entries delete directly. If a DELETE returns 400/409, archive first then retry, and record.
UTC timestamps via: date -u +%Y-%m-%dT%H:%M:%SZ
Run these steps; for every /deleted query record {query, http, count, ids, documentCodes}:
B1: create tag T1, DELETE within 15s. Query 5s later (expect absent - delay note). Wait 70s. Query type=TAGS&start=T1del-5min&end=now (expect ABSENT per docs note: created+deleted in range).
B2: create tag T2, wait 90s, delete. Query A: start=T2create-2min&end=now (creation+deletion both in range -> docs say absent?). Query B: start=T2create+1min&end=now (creation OUTSIDE, deletion INSIDE -> appears?). Also query B': start=T2create+1min&end=T2del+1min. Record which queries return T2. This discriminates the exclusion mechanism.
B3: create project P1, wait 75s, archive, delete. Wait 75s. Query type=PROJECTS&start=P1create-1min&end=now -> present? Save the full document object.
B4: create client C1, wait 75s, archive, delete. Wait 75s. Query type=CLIENTS similarly -> present? Save document.
B5: create project P2, create task TASK1 in P2, wait 75s, archive+delete TASK1, archive+delete P2. Wait 75s. Query type=TASKS and type=PROJECTS -> does the task appear under TASKS (cascade)?
B6: create time entry TE1 (start=now-10min, end=now-9min, description "delent-B-TE1"), delete. Wait 75s. Query type=TIME_ENTRY&start=TE1create-5min&end=now -> present? Save document.
B7: with TAGS+PROJECTS entries present: query type=TAGS only, type=PROJECTS only, type=TAGS&type=PROJECTS. Record documentCode values for each type. Note whether one call with both types returns both.
B8: create tag T3, wait 70s, RENAME it (PUT name=delent-B-T3-renamed), wait 70s, query /deleted?type=TAGS&start=T3create-1min&end=now -> T3 must NOT appear (renames are not deletions). Then DELETE T3 and confirm it appears in a later query (control).
B9: timezone: use your own known deletion time T1 (from B1, wall clock). Query start=T1-5s&end=T1+5s with Z -> present? Same values with +02:00 offset (%2B02:00) -> present or shifted? Record.
B10: bounds on the log's deletedAt D (take D from the log for one of your entities): query end=D exactly; end=D-60s; start=D exactly; start=D+1s&end=D+120s. Determine inclusive/exclusive start and end bounds.
B11: try custom fields if the API supports create+delete: POST /custom-fields with {"name":"delent-B-CF1","type":"TEXT"} (if 400, try other minimal bodies; max 3 attempts), DELETE the custom field, wait 75s, query type=CUSTOM_FIELDS. If creation fails, record the error and skip.
CLEANUP PROOF (mandatory): list tags (GET /tags), projects (GET /projects?archived=true&limit=200), clients (GET /clients?archived=true&limit=200) and confirm ZERO active entities remain with prefix delent-B-. List any leftovers in findings (they are FAIL).
Note: this lane runs in parallel with read-only lanes. Only you create/delete entities.
FINISH: findings-b.json (rows: {step, query, http, count, present, documentCode, notes}) + timeline.jsonl. Final message: compact structured summary max ~60 lines, strongest facts first, evidence paths included.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

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