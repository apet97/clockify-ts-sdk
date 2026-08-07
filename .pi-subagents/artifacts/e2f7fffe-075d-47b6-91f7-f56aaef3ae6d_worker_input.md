# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/invoices.md (create it).

YOUR GROUP: INVOICES (incl. payments, items, settings).

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only)

LEDGER ENTRIES TO AUDIT (grep for IDs):
1. `invoices.update.replace-and-tax-discount-zeroing` (~2008) — PUT replaces whole doc; GET returns discount/tax as ×100 ints, PUT wants discountPercent/taxPercent plain percents
2. `invoices.create.note-subject-dropped` (~2031) — POST silently drops note/subject
3. `invoices.update.missing-bill-from-and-client-address` (~2892) — UpdateInvoiceRequest now has billFrom/clientAddress
4. `invoices.items-unit-price-scale` (~2231) — unitPrice minor×100
5. `invoices.payments.post-returns-invoice` (~2288) — POST payments returns the invoice doc (201), not the payment
6. `invoices.items.update` (seed list ~line 340: "invoices.send, webhooks.test, invoices.items.update: no upstream endpoint exists")

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace):
- GET /workspaces/{ws}/invoices (list shape + statuses param), GET /invoices/settings (works? compare InvoiceSettingsResponse corrected vs InvoicesSettingsDtoV1 official), PUT /invoices/settings
- POST /workspaces/{ws}/invoices minimal draft (clientId + currency + issuedDate + dueDate + number) with note/subject — then GET: were note/subject dropped? (expect placeholder "INPUT BILL INFO HERE")
- GET /workspaces/{ws}/invoices/{id} — full doc: discount/tax field names and scale (×100 ints?), billFrom/clientAddress present?
- PUT /workspaces/{ws}/invoices/{id} — sparse PUT (only number): do omitted fields get zeroed? Then full GET-then-PUT round trip with discountPercent/taxPercent names — does tax/discount survive? DRAFT invoice only.
- POST /workspaces/{ws}/invoices/{id}/payments — amount in minor units: does response contain the INVOICE (not payment)? Prefer a fresh draft; check whether DELETE /invoices/{id} still works after payment; if not, leave it and note it.
- GET /workspaces/{ws}/invoices/{id}/payments — list shape (id/amount/author/date/note)
- POST /workspaces/{ws}/invoices/{id}/items — add item with unitPrice; GET the invoice back: item unitPrice scale (minor×100?) and amount computation; itemType must resolve (try "Service"; if 404, list existing item types from the invoice GET); applyTaxes required (TAX1|TAX2|TAX1TAX2|NONE)
- DELETE /workspaces/{ws}/invoices/{id} — works on drafts? after payment?
- fake-id probes: GET /invoices/ffffffffffffffffffffffff (400 "Invoice doesn't belong to Workspace"?), GET /invoices/settings vs GET /invoices/ffff... (literal-vs-parameter precedence)
- Use DSAUDIT_ prefixes. Clean up drafts (DELETE). Note any undeletable invoice explicitly.

Also verify: corrected response schemas for invoice GET/list (InvoiceDtoFull vs official InvoiceOverviewDtoV1 — field differences?); x-clockify-live-status stamps; does official-live.json now have billFrom/clientAddress on UpdateInvoiceRequest (official caught up?)? Does live official still document the same PUT params for invoices?

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