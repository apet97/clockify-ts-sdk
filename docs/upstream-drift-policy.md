# Upstream API Drift Policy

Clockify's public API, published documentation, live behavior, local generator
diagnostics, and GOCLMCP generator output can drift independently. This repo does not pay a
hosted SDK vendor to notice or normalize that drift, so drift response must be a
local, explicit lifecycle.

## Drift lifecycle

| Step | Action | Source of truth |
|---|---|---|
| Detect | Notice a mismatch from a user report, live sandbox probe, local generator warning, OpenAPI inventory diff, operation coverage drop, or package test failure. | Issue intake, support bundle, live tests, and generated drift surfaces. |
| Classify | Decide whether the issue belongs to Clockify API behavior, GOCLMCP source generation, local generator limitations, wrapper ergonomics, CLI behavior, MCP behavior, or docs. | `docs/change-impact-contract.json` and `docs/issue-intake-policy.md`. |
| Record | Promote durable findings into `spec/evidence/discrepancies.md`; keep raw probe files out of git. | OpenAPI evidence ledger and data-handling policy. |
| Regenerate | Change GOCLMCP sources/generator data first, land and push the fix, update `docs/openapi-source-lock.json` to the new commit (H01-LOCK), then run `make sync-locked-openapi` and `make sdk-codegen`. Never hand-copy from an ambient `../GOCLMCP` checkout. | The verified source lock, GOCLMCP canonical OpenAPI, and the local SDK generator. |
| Reconcile | Refresh operation inventory, operation parity, product surface, README tables, naming taxonomy, and affected SDK/CLI/MCP docs. | Generated truth surfaces under `docs/`. |
| Prove | Run the local-only drift gates, then the networked lock/official proof, then package gates, pack smoke, and live proof when runtime behavior changed. | `make upstream-drift` (local-only marker/wiring consistency -- never external proof), `make openapi-source-lock` / `make locked-upstream-source` (networked: the locked commit itself is fetchable and byte-identical), `make official-openapi-fetch` / `make official-openapi-currentness` (networked: today's live official spec vs. the corrected contract), `make perfect-full`, and `make perfect-live` when safe. |

## Proof-class honesty

Three of the above prove different things, and none of them substitutes for
another:

- **`upstream-drift` / `local-contract-consistency`** (offline) -- local
  policy/generated-surface/discrepancy-ledger/corrected-snapshot internal
  consistency. It has no network access and proves nothing about what
  upstream currently contains.
- **`openapi-source-lock` / `locked-upstream-source`** (networked) -- the
  exact commit recorded in `docs/openapi-source-lock.json` is publicly
  fetchable and byte-identical to what the lock claims. Never run inside
  `perfect-fast`/`perfect-full`/`contract-gates`.
- **`official-openapi-fetch` / `official-openapi-currentness`** (networked) --
  today's live official OpenAPI compared against the corrected contract. A
  network/HTTP/parse failure is a hard failure here, not a silent skip.

## Routing rules

- Clockify server behavior belongs to Clockify support unless this repo's
  canonical spec, wrapper, CLI, MCP, or docs claim the wrong behavior.
- Missing endpoints, wrong generated shapes, SDK method stamps, pagination
  stamps, Last-Page markers, and phantom route quarantine belong in GOCLMCP
  first.
- Local generator limitations belong in the evidence ledger and risk register
  until the generator is fixed or the workaround is removed.
- SDK/CLI/MCP ergonomics belong locally only after the canonical API truth is
  understood.
- Documentation-only drift belongs in generated truth surfaces or docs-quality
  gates, not in local guesses.

## Raw evidence safety

Raw live evidence must stay under ignored probe paths or local scratch files.
Committed records should include sanitized behavior, operation IDs, request IDs,
status, stable error codes, and affected tools, not customer payloads or secrets.

## Required updates after real drift

When drift is real and user-visible, update the relevant subset of:

- `spec/evidence/discrepancies.md`
- `docs/openapi-operations.json` and `docs/openapi-operations.md`
- `docs/operation-parity.json` and `docs/operation-parity.md`
- `docs/product-surface.json` and `docs/product-surface.md`
- `docs/cli-commands.json` and `docs/mcp-tools.json`
- Package READMEs, migration guide, changelogs, support/runbook docs, and risk register

## Proof gates

Before claiming upstream drift is resolved, run or cite:

- `make upstream-drift`
- `make openapi-evidence`
- `make operation-coverage`
- `make openapi-lint`
- `make operation-parity-drift`
- `make generator-comparison`
- `make acceptance-scenarios`
- `make issue-intake`
- `make perfect-full` for generator or snapshot changes
