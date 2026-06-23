# Operation Coverage Policy

Operation parity is not just a generated report. It is the regression budget for
how much of the corrected Clockify OpenAPI surface is intentionally named,
wrapped, documented, or exposed through SDK, CLI, TS MCP, and GOCLMCP.

## Coverage baseline

The current corrected snapshot has 169 operations. The operation coverage gate
uses the current parity summary as a no-regression floor:

| Metric | Minimum |
|---|---:|
| OpenAPI operations | 169 |
| SDK-named operations | 156 |
| TS MCP exact operation/tool matches | 92 |
| GOCLMCP exact operation/tool matches | 82 |
| Curated parity overrides | 32 |

These numbers are not marketing claims. They are tripwires. If coverage falls,
the change must either restore coverage or update the contract with a deliberate
rationale, risk-register note, and migration/support wording.
## Rules

- `docs/openapi-operations.json` remains the operation inventory truth for this repo.
- `docs/operation-parity.json` remains the cross-surface parity truth.
- `docs/operation-parity-overrides.json` is where non-mechanical mappings and intentional absences are explained.
- SDK naming coverage should never fall below the corrected OpenAPI stamp baseline without an explicit generator/source decision.
- TS MCP and GOCLMCP exact matches may differ by product scope, but drops from the baseline must be intentional and reviewed.
- Adding operations should update OpenAPI inventory, operation parity, naming taxonomy, product surface, and README tables when user-visible.

## Required escalation

Escalate before accepting a coverage drop when:

- A workflow tool disappears from TS MCP or GOCLMCP parity.
- An SDK-stamped operation no longer appears in generated TypeScript.
- A curated override is removed without a replacement inference or reason.
- The corrected OpenAPI operation count changes.

## Proof gates

- `make operation-coverage` checks no-regression coverage thresholds.
- `make openapi-lint` checks operation count, SDK stamps, pagination, and Last-Page invariants.
- `make operation-parity-drift` checks generated parity metadata is current.
- `make generator-comparison` checks SDK stamps against generated TypeScript methods.
- `make naming-taxonomy` checks cross-surface vocabulary around the mappings.
