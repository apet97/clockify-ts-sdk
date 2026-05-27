# OpenAPI Evidence Policy

The corrected OpenAPI snapshot is only trusted because every manual
shape decision can be traced back to source, live behavior, or a
documented generator constraint. This repo does not outsource that
trust to Stainless, Speakeasy, Fern, or any other hosted SDK platform.

## Evidence ledger contract

The canonical discrepancy ledger is
`spec/evidence/discrepancies.md`. New discrepancies should answer the
same five questions:

1. What does official documentation claim?
2. What does Clockify actually return?
3. Which live test proves it?
4. Which MCP tool depends on it?
5. Which uncertainty remains?

Every entry should also carry a status. Use explicit statuses such as
`fixed-in-canonical-generator`, `compensated-in-corrected-spec`,
`compensated-in-tool-layer`, `blocked-upstream`, `open`, or `wontfix`.

## Contract-shape rule

OpenAPI-evidence contract shape is part of evidence readiness. The checker must fail before reading the policy, discrepancy ledger, or supporting evidence when the JSON contract has unsafe repo-relative evidence paths, malformed ledger finding/status lists, duplicate supporting evidence paths, missing required Make targets, or missing Make/docs/inventory/audit wiring.

## What belongs in the ledger

Add an entry when any of these are true:

- Clockify's published spec disagrees with live API behavior.
- The generator applies a corrective transform that is not obvious
  from the source OpenAPI alone.
- Fern emits a warning or limitation that future agents could mistake
  for a product defect.
- The SDK, CLI, or MCP depends on a workaround or narrowed shape.
- A live probe created a finding that should survive beyond a raw
  probe file.

Raw probe files stay out of git unless explicitly promoted. Promote
the finding into the ledger, not the secret-bearing capture.

## Required receipts

Before claiming OpenAPI-generation readiness, run or cite:

- `make openapi-evidence`
- `make openapi-lint`
- `make openapi-operations-drift`
- `make operation-parity-drift`
- GOCLMCP drift gates from `make perfect-full`

This is intentionally evidence-first. Generated TypeScript is an output,
not a source of truth.
