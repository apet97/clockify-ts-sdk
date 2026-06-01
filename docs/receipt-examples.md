# Golden Receipt Examples

This file shows the shape of good SDK, CLI, and MCP receipts. The goal is not
to freeze every Clockify response field. The goal is to freeze the operator
contract: successful calls identify what happened, failures include stable
codes and recovery, and agent-facing writes say whether anything changed.

## Stable fields

| Surface | Success must show | Failure must show |
|---|---|---|
| SDK | `requestId`, `status`, returned data, and headers when using `withResponse` | stable error `code`, `retryable`, `recovery`, and request correlation when available |
| CLI | `ok: true`, command result data, and identifiers for created or changed objects | `ok: false`, exit code, stable error `code`, `retryable`, and `recovery` |
| MCP | `structuredContent.ok`, `changed`, `warnings`, `next`, and identifiers | `structuredContent.ok: false`, stable error `code`, `retryable`, `recovery`, and safe next steps |

Receipts must not include raw `CLOCKIFY_API_KEY`, `CLOCKIFY_ADDON_TOKEN`,
`NPM_TOKEN`, or customer-only workspace data. Use IDs only when the user or
workspace already authorized the operation.
## SDK success receipt

```json
{
  "data": [{ "id": "tag_123", "name": "billable-review" }],
  "headers": { "x-request-id": "req_123" },
  "requestId": "req_123",
  "status": 200
}
```

## SDK error receipt

```json
{
  "code": "rate_limited",
  "message": "Clockify rate limit exceeded.",
  "requestId": "req_456",
  "retryable": true,
  "recovery": "Wait for the retry window, then retry the same idempotent request."
}
```

## CLI success receipt

```json
{
  "id": "entry_123",
  "description": "Daily standup",
  "ok": true,
  "action": "entries.log",
  "entity": "time_entry",
  "ids": { "entryId": "entry_123" },
  "changed": {
    "created": [{ "type": "time_entry", "id": "entry_123" }]
  },
  "warnings": [],
  "next": [
    {
      "command": "clk115 entries list --json",
      "reason": "Verify the entry appears in the expected date range."
    }
  ]
}
```

## CLI error receipt

```json
{
  "ok": false,
  "exitCode": 2,
  "code": "invalid_input",
  "message": "Missing required argument: workspace-id.",
  "retryable": false,
  "recovery": "Provide the missing argument or set CLOCKIFY_WORKSPACE_ID for commands that support it."
}
```

## MCP success receipt

```json
{
  "structuredContent": {
    "ok": true,
    "changed": true,
    "data": {
      "entryId": "entry_123",
      "workspaceId": "workspace_123"
    },
    "warnings": [],
    "next": ["Review the created entry before invoicing."]
  }
}
```

## MCP recovery receipt

```json
{
  "structuredContent": {
    "ok": false,
    "changed": false,
    "code": "not_found",
    "message": "Clockify project was not found.",
    "retryable": false,
    "recovery": "Confirm the project ID in the same workspace, then retry with the exact ID.",
    "next": ["Run a list/search tool before attempting the write again."]
  }
}
```

## Review rule

When a change alters output shape, update this file, `docs/receipt-examples-contract.json`,
and the relevant runtime tests or package README in the same change. A receipt
that looks friendly but omits identifiers, `changed`, `retryable`, or recovery
is not enterprise-quality output.
