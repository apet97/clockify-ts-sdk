# Task for worker

You are a group subagent in an adversarial Clockify OpenAPI discrepancy audit. The repository /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk is READ ONLY — never write to it. Write your findings ONLY to /tmp/clockify-openapi-audit/findings/webhooks.md (create it).

YOUR GROUP: WEBHOOKS (create, logs, token, statuses, signature).

First read:
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/evidence/discrepancies.md
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/official/clockify.official.openapi.yaml
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/spec/corrected/clockify.corrected.openapi.yaml
- /tmp/clockify-openapi-audit/official-live.json
- /Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk/../GOCLMCP/scripts/gen-clockify-openapi (read-only — PHANTOM_PATHS!)

LEDGER ENTRIES TO AUDIT (grep for IDs):
1. `webhook.signature-scheme.shared-secret-not-hmac-doc-only` (~1372)
2. `webhook.create.name-required-on-api-key-not-addon` (~1430): name requiredness is auth-scheme-dependent
3. `webhooks.logs.method-is-post-not-get` (~3136): GET /webhooks/{id}/logs → 405 allow:POST; POST is the real route (getWebhookLogs); GET quarantined in PHANTOM_PATHS
4. `webhooks.generateNewToken.phantom` (~3121): PATCH /webhooks/{id}/generateNewToken → 404; token rotation at PATCH /webhooks/{id}/token
5. `getWebhookEventStatusesWithLatestLog` (surface.audit.2026-06-23 ~1470): GET /webhooks/{webhookId}/statuses — 200 live; added via probe fragment

MANDATORY LIVE TESTS (source /tmp/clockify-openapi-audit/env.sh — key works; never decode/print; sacrificial workspace):
- GET /workspaces/{ws}/webhooks — list shape (corrected: envelope {workspaceWebhookCount, webhooks}? official: WebhooksDtoV1?)
- POST /workspaces/{ws}/webhooks — create with X-Api-Key auth: is `name` REQUIRED (400 without?) or optional? create with name + callbackUrl. GET it back.
- GET /workspaces/{ws}/webhooks/{id}/logs — expect 405 with Allow: POST header
- POST /workspaces/{ws}/webhooks/{id}/logs — with REAL webhook id: 200 with log array? with fake id: 400 "Webhook doesn't belong to Workspace"?
- PATCH /workspaces/{ws}/webhooks/{id}/generateNewToken — with real id: 404 No static resource?
- PATCH /workspaces/{ws}/webhooks/{id}/token — with fake id: 400 (route exists)? with real id: 200 (rotates token)? Do NOT print the new token — record status only.
- GET /workspaces/{ws}/webhooks/{id}/statuses — with real id: 200 with statuses + latest log?
- DELETE /workspaces/{ws}/webhooks/{id} — cleanup
- Probe POST /workspaces/{ws}/webhooks/{id}/test if present in corrected spec (seed list says no upstream endpoint — verify 404/405?)
- Use DSAUDIT_ prefixes. Clean up everything (delete created webhooks; Leftovers:0).

Also verify: does corrected spec still carry GET /webhooks/{id}/logs (quarantined or removed)? Does official-live.json still document it as GET? Corrected webhook create request: name required? Compare corrected vs live official for webhook ops.

Report per entry: ID | status | corrected judgment | official judgment | confidence | severity | live probe record | recommended action. End with UNLEDGERED-DIFFERENCES section. Redact the API key everywhere; never print webhook tokens.

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