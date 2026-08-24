# Observability Policy

Observability is a product surface, not an afterthought. SDK users, CLI users,
MCP agents, and support operators should be able to correlate a request, know
whether a mutation happened, understand safe retry behavior, and collect a
sanitized support bundle without reading source code.

## Required observability surfaces

| Surface | Required behavior |
|---|---|
| SDK | Under HEADER-001, `composedFetch()` injects `X-Request-Id` and `User-Agent` defaults without replacing caller-provided values. It also exposes lifecycle hooks, supports retry hooks, and keeps `otelHooks()` dependency-free. |
| SDK responses | `withResponse()` lifts `data`, `headers`, the echoed/server correlation identifier when available, and `status`; failed calls should be classifiable through stable SDK error helpers. |
| CLI | `--json` output keeps success and error receipts machine-readable; errors include stable `code`, `retryable`, and `recovery`. |
| MCP | Tool results keep the canonical envelope in `structuredContent` with `changed`, `warnings`, `next`, `recovery`, and output-schema coverage. |
| Remote MCP service | Every HTTP request emits one bounded `http_request` JSON event. Every tool invocation emits one `mcp_tool_outcome` event with the ingress request ID, governed tool/risk, success or error outcome, bounded duration, retryability, and an allowlisted stable code. PostgreSQL `service_dependency` pool-pressure events contain only bounded total/idle/waiting/max counts and are deduplicated for 30 seconds. Startup, dependency, maintenance, and shutdown events use fixed fields. No event includes arguments, results, tokens, subjects, clients, workspaces, request bodies, previews, Clockify keys, raw database errors, or error objects. Logging failures never change a tool, HTTP, database, or readiness outcome. Local stdio does not install the remote tool observer. |
| Support | Diagnostic bundles include package/runtime/command metadata, prepublish gate metadata, sanitized receipts, request IDs, proof attempted, and explicit live/mock state. |

## Telemetry levels

Use the narrowest telemetry that answers the user's support question:

1. Correlation: request ID, command/tool/import path, status, stable error code.
2. Outcome: `changed`, created/updated/deleted IDs, retryability, recovery text.
3. Runtime context: package version, prepublish gate, package-lock metadata, Node version, OS, mock/live mode.
4. Generated/API context: OpenAPI operation ID, SDK method, MCP tool, discrepancy entry.

Do not jump from correlation to raw payload logging. Raw Clockify bodies are a
last resort and should stay out of committed docs and handoff files.

## Redaction rules

Observability output must not include raw `CLOCKIFY_API_KEY`,
`CLOCKIFY_ADDON_TOKEN`, `NPM_TOKEN`, webhook secrets, browser cookies, customer
workspace names, customer emails, invoice line details, expense receipts, or
production object payloads. Use `<redacted>` for secrets and role placeholders
such as `workspace_123`, `entry_123`, `invoice_123`, and `req_123` for examples.

## Change rules

- If an SDK hook, request ID, raw-response helper, rate-limit helper, or OTel
  helper changes, update this policy, the observability contract, and SDK tests
  or README evidence in the same change.
- If CLI JSON shape changes, update the CLI contract, receipt examples, and
  support runbook before claiming readiness.
- If MCP result envelopes, output schemas, resources, or prompt guidance change,
  update the MCP contract, receipt examples, and support runbook.
- If remote request, tool-outcome, lifecycle, dependency, or maintenance logs change, update
  this policy, `docs/mcp-remote-operations.md`, the observability contract, and
  the focused remote HTTP tests together. Keep log dimensions bounded and
  allowlisted; do not add principal, client, workspace, or payload dimensions.
- If support bundles ask for new fields, prove they are sanitized and useful in
  `docs/support-runbook.md` before adding them to a checklist.
## Proof gates

Before claiming observability readiness, run or cite:

- `make observability`
- `make data-handling`
- `make support-bundle`
- `make sdk-runtime-contract`
- `make cli-contract`
- `make mcp-contract`

Remote-service observability additionally requires the focused MCP tests and
`make mcp-remote-proof`. That credential-free PostgreSQL/OAuth proof is kept
outside `perfect-fast` because it owns container and fixture lifecycle.
