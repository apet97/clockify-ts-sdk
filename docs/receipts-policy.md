# Receipts and Observability Policy

Every public surface should make automation easier to debug. A user,
script, or agent should be able to answer: what happened, what changed,
what identifier can I correlate, and what should I do next?

## Cross-surface receipt rules

| Surface | Required receipt behavior |
|---|---|
| SDK | Inject `X-Request-Id` by default, expose lifecycle hooks, expose `withResponse()` metadata, and keep OpenTelemetry hooks dependency-free. |
| CLI | JSON mode prints machine-readable success or failure payloads. Errors include stable `code`, `recovery`, and `retryable`. |
| MCP | Every tool returns a consistent envelope in text and `structuredContent`, advertises an output schema, and includes `changed`, `warnings`, `next`, or `recovery` when useful. |

## SDK correlation

The SDK request path should keep these pieces together:

- `composedFetch()` injects `X-Request-Id` unless disabled.
- `withResponse()` lifts `data`, `headers`, `requestId`, and `status`.
- `otelHooks()` maps request attempts into caller-provided spans
  without a runtime OpenTelemetry dependency.
- `getRequestIdFromError()` lets failed calls be correlated with logs.

## Agent receipts

MCP and CLI outputs are part of the product, not debug noise. Do not
replace structured envelopes with prose-only responses. Add fields
carefully and keep existing meanings stable unless the compatibility
policy and migration guide are updated.
## Required receipts

Before claiming receipt/observability readiness, run or cite:

- `make observability`
- `make sdk-public-api`
- `make cli-contract`
- `make mcp-contract`
- `make error-docs-drift`
- `make troubleshooting-drift`
