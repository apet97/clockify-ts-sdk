# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/expenses-money.md (create it).

YOUR GROUP: EXPENSES + MONEY UNITS + RATES.

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json (CURRENT live official, JSON)
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only)

LEDGER ENTRIES TO AUDIT:
1. `expenses.categories.list` (seed list ~line 340)
2. `expenses.categories.update` (~345)
3. `expenses.create.amount-units` (~2052 area)
4. `expenses.list.expanded-category-and-project-dropped` (~3271) — CRITICAL: verify ExpenseHydratedDtoV1 widening; is `task` really unobserved? test with a task-linked expense if possible
5. `expenses.list.start-end-ignored-client-filtered` (~2924)
6. `rates.put-minor-units-no-get` (~2152) — project-default rate route: PUT /projects/{id}/hourly-rate — phantom? test
7. `money.amount-units.expenses-major-invoices-minor` (~2052)
8. `invoices.items-unit-price-scale` (~2231) — unitPrice minor×100 scale; check via fixture not live if risky

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh in every shell — the key there works; never decode or print it; workspace is sacrificial):
- GET /workspaces/{ws}/expenses — inspect response shape: is it an envelope {expenses:[...],totals...}? do rows carry expanded category/project/task objects + fileName + flat ids? which fields null? (esp. task) — compare against ExpenseHydratedDtoV1 in corrected spec and ExpenseDtoV1 in official
- GET /workspaces/{ws}/expenses?start=...&end=... — are date bounds honored or ignored? (ledger says ignored)
- GET /workspaces/{ws}/expenses/{expenseId} — flat ids shape (categoryId/projectId...) vs list shape
- POST /workspaces/{ws}/expenses — create one with amount (major units?) then GET it back: does response total = amount×quantity in cents? delete it. NOTE official claims POST returns ExpenseDtoV1 body; corrected spec declares NO response body for create/update — test what the create response body actually is!
- Expense categories: GET list (pagination? page-size honored?), POST create, PUT update (name required?), PATCH /status archive, DELETE (archive-first?)
- GET /workspaces/{ws}/expenses/{expenseId}/files/{fileId} — corrected declares no response body, official says byte string. Try with an expense that has a file (fileId non-null) or a fake fileId — record status/body
- PUT /workspaces/{ws}/projects/{projectId}/hourly-rate — fake 24-hex id: 404 No static resource (phantom) vs 405 (wrong verb)?
- Rate PUTs: PUT /projects/{p}/users/{u}/hourly-rate (member rate) — with fake ids record status class
- Use DSAUDIT_ prefixes; clean up everything you create (archive-before-delete for categories; delete expenses directly).

Also verify in the specs: does the corrected spec still carry the blanket note about invoice item unitPrice scale? What x-clockify-live-status stamps do the expense ops carry? Compare corrected vs live-official params for GET /expenses and GET /expenses/categories.

Report per entry: ID | status | corrected judgment | official judgment | confidence | severity | live probe record (timestamp, method, redacted path, HTTP status, key body fields) | recommended action. End with UNLEDGERED-DIFFERENCES section. Redact the API key everywhere.

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