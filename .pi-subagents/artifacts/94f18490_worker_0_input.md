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

LANE A - CONTRACT, AUTH, VALIDATION MATRIX (all read-only; no mutations). Lane dir: /tmp/delent/a/ (mkdir -p). Evidence: /tmp/delent/a/evidence/. Findings: /tmp/delent/a/findings-a.json.
Base URL: https://api.clockify.me/api/v1/workspaces/65b382b606de527a7ee2b60e/entities/deleted
Test matrix (number each case A###; record HTTP + body; full bodies to files):
A1 Auth: valid x-api-key; no key; empty key; garbage key "nope"; truncated key (first 20 chars); key as query param ?x-api-key=...; Authorization: Bearer <key>; x-addon-token garbage "badtoken"; valid x-api-key + garbage x-addon-token; garbage both; header case variants (X-API-KEY, Api-Key).
A2 Path: correct; /workspaces//entities/deleted (empty id); trailing slash; id "abc"; 23-hex id; 24-hex zeros 000000000000000000000000; 24-hex ffffffffffffffffffffffff; UPPERCASE hex of the real WSID 65B382B606DE527A7EE2B60E.
A3 type matrix (valid key, no start/end): missing; type= (empty value); type=FOO; type=time_entry; type=Time_Entry; each of the 17 valid values alone; type=TAGS&type=PROJECTS (two params); type=TAGS&type=TAGS (dup); type=TAGS,PROJECTS (comma in one param); type=TAGS;PROJECTS (semicolon); type%5B%5D=TAGS (bracket); types=TAGS (wrong name); type=%20TAGS%20 (whitespace). Record HTTP + body shape for each.
A4 start/end matrix (type=TAGS): none; only start; only end; start==end; start>end; start=2099-01-01T00:00:00Z; end=2020-01-01T00:00:00Z; start=1970-01-01T00:00:00Z; start=2024-13-99T00:00:00Z; start=2024-01-01 (date only); start=2024-01-01T10:00:00 (no Z); start=2024-01-01T08:00:00+02:00 (URL-encode the + as %2B); start=2024-01-01T10:00:00.123Z (ms); start=2024-01-01 10:00:00 (space); start=hello; start=1700000000 (epoch); start valid + end garbage; start with emoji.
A5 page/limit matrix (type=TAGS, start=2024-01-01T00:00:00Z, end=2026-08-31T23:59:59Z): default; page=0; page=1; page=999999; page=-1; page=abc; page=1.5; limit=1; limit=0; limit=-1; limit=abc; limit=1.5; limit=51; limit=100; limit=1000; limit=100000; limit=999999999999; page=1&limit=1.
A6 HTTP methods: POST, PUT, PATCH, DELETE, HEAD, OPTIONS on the same URL (record status + Allow header if present).
A7 Misc: Accept: application/xml; no Accept; Accept: */*; Content-Type: application/json on GET; 10 rapid identical calls (watch for 429); record response headers of one 200 (x-auth-checksum, cache-control, content-type, any x-clockify-* or rate-limit headers).
A8 Sibling endpoints (valid key, no params): GET /workspaces/65b382b606de527a7ee2b60e/entities/created and .../entities/updated -> record HTTP + body shape + missing-type behavior.
FINISH: findings-a.json with rows {case, method, url, params, http, bodyPreview, deviation?}; final message = compact table of every case + HTTP code, deviations from documented contract, and a weakest-valid-hypothesis note for each surprising behavior.

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