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

LANE C - PAGINATION, ORDERING, RESPONSE SHAPE, REPO SYNTHESIS (read-only API calls; repo reads only). Lane dir: /tmp/delent/c/ (mkdir -p). Evidence: /tmp/delent/c/evidence/. Findings: /tmp/delent/c/findings-c.json.
PHASE 1 (populate-wait): lane B is creating real deletions in parallel. Its timeline: /tmp/delent/b/timeline.jsonl (read it when present). Poll every 20s: GET /deleted?type=TAGS&start=2026-01-01T00:00:00Z&end=<now+1d> until response non-empty. Then wait until the newest deletion in the timeline is >=65s old. Max wait 5 minutes; if still empty, run Phase 2 against empty state and say so.
PHASE 2 (record HTTP + body for each):
C1: non-empty wrapper shape: top-level keys of the body ({"response":[...]} vs bare array). Compare with empty-case shape (bare []).
C2: ordering: walk all TAGS (limit=50, pages 0..n): order by deletedAt asc/desc? Any page metadata (totalCount, page, size) in body? Check response headers for x-clockify-last-page-header or similar pagination headers.
C3: pagination: with >=2 entries: limit=1&page=0; page=1; page=2; page=99; limit=50 default vs limit=500 (cap?); page=0&limit=1 first item equals page=0&limit=50 first item? Entries unique across pages?
C4: document semantics: for each type present in the log (TAGS, PROJECTS, CLIENTS, TASKS, TIME_ENTRY): jq keys of .response[].document; is it the full entity snapshot (id, name, workspaceId, archived)? Does documentCode equal the query type or a singular form (e.g. TAG vs TAGS)? Is .id the entity id (cross-check vs /tmp/delent/b/timeline.jsonl entity ids) or a log row id?
C5: deletedAt semantics: format (Z, ms, offset?), drift vs timeline deletion timestamps (seconds). Multiple deletions in the same minute: coalesced into one entry or separate?
C6: exact-instant range using a known deletedAt D from the log: start=D&end=D -> present? start=D+1s&end=D+10s -> absent?
C7: default range: query with NO start/end right after Phase 2 (deletions are <10 min old, inside the default 30-day window) -> appear?
C8: repo synthesis (READ-ONLY; never edit):
 - spec/corrected/clockify.corrected.openapi.yaml lines ~2095-2210: record documented schema (response PageableCollectionLogBinDocumentDto, params, enum count, x-fern stamps, x-clockify-evidence).
 - docs/operation-dispositions.json row getDeletedEntityInfo (~line 417): sdkNaming + clientPath.
 - docs/operation-evidence-map.json row (~line 208): evidence status.
 - spec/evidence/discrepancies.md: grep -n -i "deleted|LogBin|change" -> any entries about this endpoint?
 - docs/sdk-operation-naming-classifications.json + docs/operation-evidence-anchor-inventory.json: any getDeletedEntityInfo rows?
 - If /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/output/ts-sdk or wrapper/src exist: find the generated client file for entityChangesExperimental (grep -rn "listDeleted" or "entities/deleted" in those dirs) and record the generated request/response types. If absent, say "generated tree absent".
 - Compare the live truth vs the Clockify docs page vs the corrected spec; list every difference as a table row.
C9: sibling endpoints: GET /entities/created and /entities/updated with type=TAGS (wide range): response shape + wrapper vs bare array.
FINISH: findings-c.json + final message max ~60 lines, strongest facts first, evidence paths included.

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