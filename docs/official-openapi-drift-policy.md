# Official OpenAPI drift policy

The custom spec (`spec/corrected/clockify.corrected.openapi.yaml`) is the trusted
source for this repo's SDK/CLI/MCP surfaces, but Clockify's official OpenAPI keeps
evolving. New official endpoints, schema fixes, host changes, and auth-scheme
changes can appear upstream at any time. This pipeline makes that drift a
first-class, reviewable signal instead of something a maintainer has to notice by
hand.

## What the pipeline compares

It joins operations on HTTP method + path with positional parameters
(`/workspaces/{}/clients/{}`), because `operationId` matches only a minority of
operations across the two specs and the path-parameter names diverge by resource.
The official `/v1` prefix is normalized away before comparison.

It surfaces six dimensions of drift:

- **New official operations missing in custom** — `NEW_OFFICIAL_ENDPOINT`.
- **Custom operations not present in the official snapshot** — `CUSTOM_BETTER`.
- **Request/response shape differences on shared operations** — `CONFLICT`
  (shallow: response-code set + request-body presence; deep field-level shape
  differences live in the evidence ledger).
- **Server/host differences** — reported as `CUSTOM_BETTER` host-override notes.
- **Auth-scheme differences** — reported as `CUSTOM_BETTER` scheme notes.
- **Phantom/dead endpoints** — `PHANTOM_RISK`: a custom operation whose live
  route returns 404 / is not bound, per the evidence ledger.

## Commands

```bash
make official-openapi-report   # regenerate the three trust surfaces (offline)
make official-openapi-drift    # gate: fail if a surface is stale + verify wiring
make official-openapi-fetch    # OPTIONAL: compare the LIVE official spec (network)
```

`official-openapi-report` and `official-openapi-drift` are fully offline and
deterministic — they read the committed snapshot at
`spec/official/clockify.official.openapi.yaml`. `official-openapi-fetch` is the
only networked target; it pulls `https://docs.clockify.me/openapi.json` and lists
live official operations not yet imported into the custom spec. It is never part of
`make perfect-fast` / `make perfect-full`.

## Generated trust surfaces

- [`spec-diff-official.md`](./spec-diff-official.md) — the full diff with the
  prefixed report lines and summary table.
- [`spec-confidence.md`](./spec-confidence.md) — per-operation confidence derived
  from each operation's `x-clockify-live-status` stamp.
- [`live-evidence-index.md`](./live-evidence-index.md) — where custom claims meet
  real Clockify behavior, plus the quarantined phantom routes.

These are generated; do not edit them by hand. After refreshing the official
snapshot or the corrected spec, run `make official-openapi-report` to regenerate.

## Drift response

The corrected spec is read-only here (Hard Stop: no edits to `spec/corrected/**`).
Spec-shape changes start in the sibling `../GOCLMCP` generator, then flow into this
repo's corrected snapshot. When `make official-openapi-fetch` reveals a new official
operation worth importing, record the decision in
`spec/evidence/discrepancies.md` and route the change through GOCLMCP — never
hand-edit the snapshot. Phantom routes stay quarantined until the live API binds
them.
