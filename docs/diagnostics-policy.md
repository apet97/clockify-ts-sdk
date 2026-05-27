# Diagnostics Policy

Diagnostics are a product surface across the SDK, CLI, and MCP. They must help a
non-coder or agent decide whether local configuration is ready before the first
live Clockify call, without leaking secrets and without pretending that local
checks prove live access.

## Rules

1. Diagnostics are no-network by default.

   SDK `clockifyDiagnostics()`, CLI `clk115 doctor`, and MCP
   `clockify://mcp/doctor` must not contact Clockify. Live verification belongs
   to `client.health()`, `clk115 status`, and `clockify_status`.

2. Diagnostics are redacted.

   Tokens must never be printed. Workspace identifiers should be absent or
   masked. Base URL overrides can be shown because they are operational context,
   not credentials.

3. Diagnostics return receipts, not prose only.

   SDK and CLI diagnostics should expose `ok`, readiness/status, checks,
   source attribution, warnings, and next steps. MCP diagnostics should document
   the same fields and tell agents what first live probe to run.

4. Diagnostics distinguish local readiness from live proof.

   A green local diagnostic means the process has enough local inputs to try a
   live probe. It does not mean credentials are valid, the workspace exists, or
   plan-gated features are available.

5. Diagnostics prefer recovery over blame.

   Missing auth, auth conflicts, unsupported runtimes, missing workspace IDs,
   and base URL overrides must include concrete recovery or next-step text.
   Source fields should distinguish explicit input, environment fallback,
   defaults, and unavailable values.

## No-network proof

Diagnostics code must not construct API clients, call `fetch`, import
`node:http` or `node:https`, or run live health/status helpers. SDK diagnostics
may point users to `client.health()` as the first live probe, CLI doctor may
point users to `clk115 status`, and the MCP doctor resource may point agents to
`clockify_status`; those are next steps, not work performed by diagnostics.

## Required surfaces

- SDK: `clockifyDiagnostics()` exported from the package root and the
  `clockify-sdk-ts-115/diagnostics` subpath.
- CLI: `clk115 doctor` documented in `docs/cli-commands.json`, README tables,
  shell completions, and tests.
- MCP: `clockify://mcp/doctor` advertised as a resource, not a tool.
- Product metadata: `docs/product-surface.json` and `docs/product-surface.md`
  should list diagnostics in the status/readiness workflow.

## Contract-shape rule

Diagnostics contract shape is part of local-readiness safety. `make diagnostics` must fail before trusting SDK, CLI, MCP, product-surface, policy, or docs-index evidence when `docs/diagnostics-contract.json` has an invalid schema version, missing purpose, missing explicit invariants, unsafe repo-relative evidence paths, untyped policy markers, malformed diagnostic surface/file marker lists, malformed forbidden secret patterns, or malformed Make/docs/audit wiring.

## Gate

Run `make diagnostics` after changing SDK diagnostics, CLI doctor behavior,
MCP resources, diagnostics docs, product-surface metadata, redaction rules, or
status/readiness workflow copy.
