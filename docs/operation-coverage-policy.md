# Operation Coverage Policy

Operation parity is not just a generated report. It is the regression budget for
how much of the corrected Clockify OpenAPI surface is intentionally named,
wrapped, documented, or exposed through SDK, CLI, TS MCP, and GOCLMCP.

## Coverage baseline

The current corrected snapshot has 169 operations. The operation coverage gate
uses the current parity summary as a no-regression floor:

| Metric | Governed count / floor |
|---|---:|
| OpenAPI operations | 169 |
| Generated SDK operations | 169 |
| Explicitly named SDK operations | 155 |
| OperationId-derived SDK operations | 14 |
| TS MCP exact operation/tool matches | 92 |
| GOCLMCP exact operation/tool matches | 82 |
| Curated parity overrides | 32 |

These numbers are not marketing claims. They are tripwires. If coverage falls,
the change must either restore coverage or update the contract with a deliberate
rationale, risk-register note, and migration/support wording.
## Rules

- `docs/openapi-operations.json` remains the operation inventory truth for this repo.
- `output/ts-sdk/codegen-receipt.json` is the generated SDK reachability truth.
- `docs/operation-dispositions.json` maps every operation to its receipt-derived
  generated group, method, public client path, naming class, and applicable
  evidence identifiers.
- `docs/sdk-operation-naming-classifications.json` governs the exact 14
  operationId-derived operations and fails closed on additions, removals,
  renames, duplicates, or reclassification.
- `docs/operation-parity.json` remains the cross-surface parity truth and keeps
  generated SDK reachability distinct from TS MCP and GOCLMCP coverage.
- `docs/operation-parity-overrides.json` is where non-mechanical mappings and intentional absences are explained.
- The generated SDK split is exact: 169 reachable operations = 155 explicitly
  named + 14 operationId-derived. Any change requires an explicit
  generator/source and classification decision.
- TS MCP and GOCLMCP exact matches may differ by product scope, but drops from the baseline must be intentional and reviewed.
- Adding operations should update OpenAPI inventory, operation parity, naming taxonomy, product surface, and README tables when user-visible.

## Required escalation

Escalate before accepting a coverage drop when:

- A workflow tool disappears from TS MCP or GOCLMCP parity.
- An OpenAPI operation no longer appears exactly once in the codegen receipt or
  disposition artifact.
- A generated group/method changes without updating the governed naming
  classification.
- A curated override is removed without a replacement inference or reason.
- The corrected OpenAPI operation count changes.

## Proof gates

- `make operation-coverage` checks no-regression coverage thresholds.
- `make openapi-lint` checks operation count, SDK stamps, pagination, and Last-Page invariants.
- `make operation-parity-drift` checks generated parity metadata is current.
- Its fixture suite proves new, renamed, unclassified, duplicated, missing,
  count-mismatched, and reclassified operations fail closed.
- `make generator-comparison` checks SDK stamps against generated TypeScript methods.
- `make naming-taxonomy` checks cross-surface vocabulary around the mappings.
