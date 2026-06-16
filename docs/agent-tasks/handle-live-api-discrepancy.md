# Agent task: record a live-API discrepancy

**When to use:** you found a place where Clockify's live API behaves differently
from the official documentation or the corrected spec (wrong method, sparse body,
dead route, minor-unit amounts, pagination quirk, etc.) and need to capture it as
durable evidence.

## Files to read first

- `docs/openapi-evidence-policy.md` — the five questions every entry answers.
- `spec/evidence/discrepancies.md` — the ledger and its template.
- `docs/data-handling-policy.md` — raw probe payloads stay out of git; commit only
  sanitized behavior, operation ids, request ids, status, error codes, affected
  tools.
- `docs/upstream-drift-policy.md` — classification and routing rules.

## Files you may edit

- `spec/evidence/discrepancies.md` — add one atomic entry per discrepancy using the
  template (Official claim / Actual behavior / Live evidence / MCP tools affected /
  Open questions / Status).
- The affected tool layer if a compensation is needed: `mcp/src/tools/**` or a
  `wrapper/` helper, with its tests and `CHANGELOG.md`.

## Files you must NOT edit

- `spec/corrected/**` — the spec is read-only here; shape fixes start in
  `../GOCLMCP`.
- `spec/official/**`, `wrapper/src/**`, `output/ts-sdk/**`.
- Do not commit raw probe payloads, secrets, or customer data.

## Required tests / gates

```bash
make openapi-evidence        # ledger markers stay present
make official-openapi-report # refresh live-evidence-index.md / spec-confidence.md
make official-openapi-drift
# if you changed the tool/helper layer, also run its package gates + tests
make perfect-fast
```

## Required docs / changelog updates

- New entry in `spec/evidence/discrepancies.md` with an explicit `Status`.
- If a phantom/dead route is confirmed, ensure it is written as
  `` `slug` (`METHOD /path`) `` near a "No static resource" / "not bound" note so
  the drift pipeline quarantines it under PHANTOM_RISK.
- If you changed tool/helper behavior, add a `## [Unreleased]` entry to that
  package's `CHANGELOG.md`.

## Completion checklist

- [ ] One atomic ledger entry added, answering all five questions, with a `Status`.
- [ ] No raw payloads/secrets committed (sanitized evidence only).
- [ ] `make openapi-evidence` and `make official-openapi-drift` green.
- [ ] Any tool/helper compensation tested and changelog-bumped.
- [ ] `make perfect-fast` passes; output cited.
