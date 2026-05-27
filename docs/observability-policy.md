# Observability Policy

Observability is a product surface, not an afterthought. SDK users, CLI users,
MCP agents, and support operators should be able to correlate a request, know
whether a mutation happened, understand safe retry behavior, and collect a
sanitized support bundle without reading source code.

## Required observability surfaces

| Surface | Required behavior |
|---|---|
| SDK | `composedFetch()` injects `X-Request-Id`, preserves `User-Agent`, exposes lifecycle hooks, supports retry hooks, and keeps `otelHooks()` dependency-free. |
| SDK responses | `withResponse()` lifts `data`, `headers`, `requestId`, and `status`; failed calls should be classifiable through stable SDK error helpers. |
| CLI | `--json` output keeps success and error receipts machine-readable; errors include stable `code`, `retryable`, and `recovery`. |
| MCP | Tool results keep the canonical envelope in `structuredContent` with `changed`, `warnings`, `next`, `recovery`, and output-schema coverage. |
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
- If support bundles ask for new fields, prove they are sanitized and useful in
  `docs/support-runbook.md` before adding them to a checklist.

## Contract-shape rule

Observability contract shape is part of support readiness. `make observability`
must fail before trusting SDK, CLI, MCP, support, or policy evidence when
`docs/observability-contract.json` has an invalid schema version, missing
purpose, missing explicit invariants, unsafe repo-relative evidence paths,
untyped policy markers, malformed SDK/CLI/MCP/support evidence, or malformed
Make/docs/inventory/audit wiring.

## Proof gates

Before claiming observability readiness, run or cite:

- `make observability`
- `make data-handling`
- `make support-bundle`
- `make receipts-contract`
- `make receipt-examples`
- `make sdk-runtime-contract`
- `make cli-contract`
- `make mcp-contract`
