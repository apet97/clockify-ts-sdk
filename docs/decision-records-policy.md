# Decision Records Policy

This repo keeps short decision records for choices that future agents
are likely to misread or "simplify" incorrectly. These records are not
release notes; they are guardrails for why the SDK, CLI, MCP, OpenAPI,
proof, and publishing boundaries look the way they do.

## Rules

1. Record decisions that change where work belongs.

   If a change affects whether work starts in GOCLMCP, Fern, wrapper
   code, CLI, MCP, docs, or final proof, add or update a decision
   record.

2. Keep each record operational.

   Every decision must include status, context, decision,
   consequences, and proof. The proof section must point to concrete
   gates, files, or contracts.

3. Do not hide residual risk.

   If a decision accepts a tradeoff, the risk register or final proof
   receipt must carry the closure gate.

4. Do not use decision records to bypass proof.

   A decision record explains why the contract exists. It does not
   replace `make perfect-fast`, `make perfect-full`, live sandbox proof,
   or final proof receipts.

## Required proof

- `make decision-records` checks the required records and headings.
- `make risk-register` checks accepted risks and closure gates.
- `make perfect-full` is still required after removing the
  temporary context and before marking the long-running goal complete.
