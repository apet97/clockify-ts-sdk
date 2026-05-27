# Generator Portability Plan

This repo must remain usable without paying for Stainless, Speakeasy, Fern Cloud,
or any other hosted SDK generator platform. Fern is currently a pinned local
smoke-test and TypeScript emitter, not the product architecture. The product is
the corrected OpenAPI truth, the package contracts, the hand-written wrapper
seams, and the SDK/CLI/MCP receipts.

## Portability principles

- The canonical API truth starts in GOCLMCP, not in a commercial generator UI.
- The corrected OpenAPI snapshot is an artifact, not an editing surface.
- Generated TypeScript is replaceable; hand-written SDK runtime seams are the
  durable product boundary.
- CLI and MCP must depend on public package surfaces, not generated internals.
- Every generator-specific workaround needs a discrepancy entry or contract so
  it can be re-evaluated when the generator changes.
- A future generator swap must be proven by public exports, package tests,
  packed-consumer smoke, and operation parity, not by diff size.

## Current local generation chain

1. GOCLMCP builds the canonical OpenAPI from curated sources.
2. This repo copies that canonical YAML into
   `spec/corrected/clockify.corrected.openapi.yaml`.
3. `spec/fern` runs pinned local Fern CLI and Docker generator versions.
4. Fern emits `output/ts-sdk/**`.
5. `wrapper/scripts/sync-sdk.sh` copies generated TypeScript into
   `wrapper/src/**` and regenerates resource docs.
6. Hand-written wrapper modules expose stable ergonomics, receipts,
   pagination, webhooks, scoped clients, rate limits, health checks, and errors.
7. CLI and MCP consume the SDK package surface and their own command/tool
   contracts.

## Vendor-exit checklist

Before replacing Fern or adding any generator platform, require evidence for:

| Area | Required evidence |
|---|---|
| OpenAPI truth | `make openapi-lint`, `make openapi-evidence`, and GOCLMCP drift gates still agree. |
| SDK method names | `make generator-comparison` or a replacement comparison proves SDK method stamps are preserved or intentionally remapped. |
| Public API | `make sdk-public-api` proves root exports and subpaths remain intentional. |
| Runtime seams | `make sdk-runtime-contract` proves hand-written behavior survived the generator swap. |
| CLI/MCP boundary | `make dependency-boundary`, `make cli-contract`, and `make mcp-contract` prove no generated internals leaked into product code. |
| Packed consumer | `make pack-smoke` proves real users can install and import/run the result. |
| Docs and migration | README, migration guide, operation parity, and discrepancy ledger explain any user-visible changes. |

## Forbidden portability shortcuts

- Do not edit `output/ts-sdk/**`, `wrapper/src/**`, or
  `spec/corrected/**` by hand to make a generator swap look smaller.
- Do not make CLI or MCP import from `output/ts-sdk/**` or `wrapper/src/**`.
- Do not accept a generator that requires a paid hosted account for ordinary
  local regeneration.
- Do not hide generator-specific casts or pagination workarounds outside the
  wrapper contracts.
- Do not claim portability from a green type-check alone; package, docs, parity,
  and packed-consumer evidence are required.
- do not buy or migrate to a paid generator just to satisfy proof for this repo (lowercase restatement of the rule below).

## Account-gated generator failures

This repo must remain reproducible with no API token, no hosted login, and no paid hosted account. If Stainless, Speakeasy, Fern Cloud, or any similar tool returns an `Upgrade Required`, quota, entitlement, workspace, or account eligibility error, classify that as an environment constraint, not an OpenAPI defect.

Do not buy or migrate to a paid generator to satisfy proof for this repo. The
correct response is to preserve the local OpenAPI truth chain, keep the current
generator path pinned and replaceable, or evaluate another local generator in a
branch with the vendor-exit checklist above.

## Acceptable generator roles

A generator may:

- Emit low-level resource clients and request/response types.
- Fail fast when the OpenAPI snapshot is inconsistent.
- Provide a reproducible local command path.
- Be pinned by version and covered by generator-config checks.

A generator may not:

- Own the product names, user-facing receipts, CLI command semantics, MCP tool
  envelopes, support runbook, or final proof claims.
- Become the only place where endpoint truth, quirks, or live discrepancies are
  documented.
- Require secrets, customer data, or live Clockify credentials to generate code.

## Replacement procedure

1. Add or update the generator config in a branch or local worktree.
2. Run the full OpenAPI truth chain from GOCLMCP through local generation.
3. Keep generated changes isolated from hand-written wrapper/CLI/MCP changes.
4. Update `docs/generator-portability-contract.json` if the proof path changes.
5. Run `make perfect-full` and `make pack-smoke` before any readiness claim.
6. Record user-visible changes in package changelogs and migration docs.
7. Keep the old generator path documented until the replacement proof is in the
   final receipt.
