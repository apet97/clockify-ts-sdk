# 0002: Generated core is a dependency, not the product surface

## Status

Accepted.

## Context

Local generation is valuable because it keeps the SDK broad and
repeatable. It is also replaceable infrastructure. If product behavior
leaks directly into generated files, every regeneration risks erasing
manual fixes.

The product layer is the durable wrapper package plus CLI and MCP
surfaces that speak stable domain language.

## Decision

Generated code is a dependency. `wrapper/src/**` is not a product-editing surface (the synced wrapper/src/** is not a product-editing surface). Durable SDK behavior lives in hand-written wrapper seams such as `createClockifyClient`, pagination helpers, webhooks, response helpers, error recovery, health, rate limits, scoped clients, and observability hooks.

Prefer upstream OpenAPI source or local generator fixes first. Durable wrapper seams are the normal place for product behavior. Deterministic post-generation cleanup is an escape hatch, not a product layer. Every generated-output mutator must be registered in `docs/generator-independence-contract.json`. No ad-hoc postgen scripts.

## Consequences

- Generated files can be wiped and recreated by the local generator.
- CLI and MCP depend on the packable SDK surface, not generated internals.
- Wrapper seams need tests, exports, docs, and contract checks.

## Proof

- `make generated-edit-check`
- `make generator-independence`
- `make sdk-public-api`
- `make sdk-runtime-contract`
