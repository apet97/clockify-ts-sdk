# Agent task: handle official-vs-custom OpenAPI drift

**When to use:** you are reviewing how Clockify's official OpenAPI compares to this
repo's corrected snapshot — either because `make official-openapi-drift` reported
drift, or you ran `make official-openapi-fetch` and want to triage new upstream
endpoints.

## Files to read first

- `docs/official-openapi-drift-policy.md` — the lifecycle and command set.
- `docs/spec-diff-official.md`, `docs/spec-confidence.md`,
  `docs/live-evidence-index.md` — the generated trust surfaces.
- `scripts/official-openapi-report.mjs` (normalization + diff logic) and
  `scripts/official-openapi-drift.mjs` (the driver).
- `spec/evidence/discrepancies.md` — where decisions get recorded.

## Files you may edit

- `spec/evidence/discrepancies.md` — record a decision about a new official
  operation or a confirmed divergence (follow the five-question template).
- The report/driver scripts (`scripts/official-openapi-report.mjs`,
  `scripts/official-openapi-drift.mjs`) only to improve the comparison itself.
- `docs/official-openapi-drift-policy.md` if the lifecycle changes.

## Files you must NOT edit

- `spec/official/clockify.official.openapi.yaml` — the committed upstream snapshot;
  refresh it only via a deliberate snapshot update, never by hand.
- `spec/corrected/clockify.corrected.openapi.yaml` — read-only here. Spec-shape
  changes start in `../GOCLMCP`, then flow into the corrected snapshot.
- `docs/spec-diff-official.md`, `docs/spec-confidence.md`,
  `docs/live-evidence-index.md` — generated; run `make official-openapi-report`.

## Required tests / gates

```bash
make official-openapi-report     # regenerate the three surfaces (offline)
make official-openapi-drift      # gate: surfaces fresh + wired
make official-openapi-fetch      # OPTIONAL: live delta vs the custom spec (network)
make perfect-fast
```

## Required docs / changelog updates

- If you act on a `NEW_OFFICIAL_ENDPOINT`, record the import decision in
  `spec/evidence/discrepancies.md` and route the spec change through `../GOCLMCP`.
- If you import operations into the corrected spec (in GOCLMCP), the corrected op
  count changes — then update `scripts/lint-openapi-contract.mjs`,
  `docs/operation-coverage-contract.json`, regenerate `docs/openapi-operations.*`
  and `docs/operation-parity.*`, and re-run `make openapi-lint operation-coverage`.

## Completion checklist

- [ ] Reviewed `spec-diff-official.md` lines (NEW_OFFICIAL_ENDPOINT / CUSTOM_BETTER /
      CONFLICT / PHANTOM_RISK).
- [ ] Any decision recorded in `spec/evidence/discrepancies.md`.
- [ ] No hand-edit of `spec/corrected/**` or `spec/official/**`.
- [ ] `make official-openapi-drift` green and surfaces regenerated.
- [ ] `make perfect-fast` passes; output cited.
