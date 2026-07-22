# Task 22 — webhook delivery diagnosis

## Scope and head

Task 22 started from
`6904218a363bb7e7619cb453c12ceef0ea10ba22`. The receipt-bearing
implementation commit is `SELF`: this file is committed atomically with the
tool, tests, generated surfaces, and roadmap status update.

The shipped surface is one read-only MCP tool,
`clockify_webhooks_delivery_diagnose`. It does not change the webhook
subscription, token, callback URL, OpenAPI, generated SDK, or GOCLMCP, and it
does not use custom HTTP or `client.webhooks.searchLogs`.

## Generated API contract

- Operation: `getWebhookEventStatusesWithLatestLog`
- SDK call: `client.webhooks.getWebhookEventStatusesWithLatestLog(request)`
- Request: `ClockifyApi.GetWebhookEventStatusesWithLatestLogWebhooksRequest`
- Response: `ClockifyApi.WebhookEventStatusWithLatestLogDtoV1[]`
- Wire truth: `GET /workspaces/{workspaceId}/webhooks/{webhookId}/statuses`

The production request is constructed directly with `satisfies` and contains
only `workspaceId`, `webhookId`, `page`, generated `size`, and optional
generated `statuses`. Consumer request casts remain CLI 0 / MCP 0 with empty
exception registries.

## Result and safety contract

The result projects only `id`, `webhookId`, `webhookLogId`, `status`,
`statusCode`, `respondedAt`, and `retryCount`. It never returns `responseBody`
or `requestBody`. When at least one upstream row includes `responseBody`, the
result includes this stable warning:

```text
Webhook response bodies are omitted from MCP results for safety.
```

The focused security test supplied the unique marker
`recipient-secret-ignore-previous-instructions` as a response body and proved
it was absent from both `content[0].text` and `structuredContent`, while the
response status and retry count survived.

The tool is ID-only. Missing or empty `webhookId` values fail schema validation
without a webhook list/search call, write, clarification receipt, or invented
candidate. Shared `defineTool` error handling maps 403 to
`auth_or_permission` and 404 to `not_found` with the normal recovery envelope.

## TDD and deterministic proof

Focused RED:

```text
npm test -w @apet97/clockify-mcp-115 -- tests/webhooks-delivery-diagnose.test.ts
exit 1: 1 file; 7 failed, 2 passed. The new tool was not registered.
```

Focused GREEN after the minimal source/risk implementation:

```text
npm test -w @apet97/clockify-mcp-115 -- tests/webhooks-delivery-diagnose.test.ts
exit 0: 1 file; 9 tests passed.
```

The final prescribed proof ran in order:

```text
npm run lint -w @apet97/clockify-mcp-115
exit 0

npm run type-check -w @apet97/clockify-mcp-115
exit 0

npm test -w @apet97/clockify-mcp-115 -- tests/webhooks-delivery-diagnose.test.ts tests/webhooks-redact.test.ts tests/server.test.ts tests/tool-risk.test.ts tests/tool-manifest.test.ts
exit 0: 5 files; 57 tests passed.

CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_LIVE_CONFIRM='' CLOCKIFY_LIVE_PREFIX='' npm test -w @apet97/clockify-mcp-115
exit 0: 64 files passed, 1 live file skipped; 723 tests passed, 12 live tests skipped.

make mcp-tool-manifest operation-parity product-surface readme-tables
exit 0: manifest, parity, product surface, and README tables regenerated.

make mcp-tool-manifest-drift operation-parity-drift mcp-contract mcp-agent-ux mcp-write-safety consumer-cast-budget docs-counts readme-tables-drift product-surface-drift
exit 0: 141-tool contract; 141/56/18 write-safety summary; cast-budget fixtures 1463/1463; CLI 0/MCP 0 request casts and 0/0 exceptions; docs counts 141 = 22 + 119; generated surfaces current.

npm run build -w @apet97/clockify-mcp-115
exit 0

npm pack --dry-run -w @apet97/clockify-mcp-115
exit 0: apet97-clockify-mcp-115-0.6.2.tgz; 109 files; 111.8 kB packed, 578.2 kB unpacked.

git diff --check -- mcp docs
exit 0
```

The first unsanitized full-test attempt stopped at the live-suite import guard
because ambient Clockify credentials were present without
`CLOCKIFY_LIVE_PREFIX`. It exited 1 after 64 non-live files and all 723 executed
tests passed; no live test or request ran. The coordinator authorized the one
blank-credential rerun above as the authoritative deterministic closure. No
further full MCP rerun occurred.

## Surface receipt

- Tools: 141 total = 22 workflow + 119 domain.
- Risk distribution: read 59, routine write 26, business write 30, external
  side effect 5, privileged 3, destructive 18.
- Guarded tools: 56.
- Webhook domain group: 7 tools.
- Operation parity: the generated status/latest-log operation maps to
  `clockify_webhooks_delivery_diagnose` as a bounded, redacted workflow.

## Changed files

- `mcp/src/tools/webhooks.ts`
- `mcp/src/tool-risk.ts`
- `mcp/tests/webhooks-delivery-diagnose.test.ts`
- `mcp/tests/server.test.ts`
- `mcp/tests/setup-required.test.ts`
- `mcp/tests/tool-manifest.test.ts`
- `mcp/tests/tool-risk.test.ts`
- `mcp/tests/write-safety-missing-annotation.test.ts`
- `mcp/README.md`
- `mcp/CHANGELOG.md`
- `docs/mcp-tools.json`
- `docs/mcp-contract.json`
- `docs/mcp-agent-ux-contract.json`
- `docs/mcp-write-safety-contract.json`
- `docs/mcp-tool-manifest.json`
- `docs/mcp-write-safety-policy.md`
- `docs/operation-parity-overrides.json`
- `docs/operation-parity.json`
- `docs/operation-parity.md`
- `docs/product-surface.json`
- `docs/performance-budgets.json`
- `docs/product-north-star.md`
- `docs/mcp-backlog.md`
- `docs/decisions/0006-mcp-tool-surface-scope.md`
- `docs/agent-tasks/add-mcp-tool.md`
- `docs/roadmap-1.0.md`
- `docs/roadmap-1.0-receipts/task-22-webhook-diagnosis.md`
- `scripts/smoke-mcpb.mjs`

## Live-proof decision and boundaries

No live sandbox read probe was run. The roadmap does not require it, and the
deterministic in-memory proof covers the generated request, projection,
redaction, pagination/filter mapping, empty success, shared recovery, schema
boundary, and `tools/list` contract. No local mutation/Stryker, customer
workspace request, webhook mutation, push, tag, publish, release, or release-
workflow change occurred.
