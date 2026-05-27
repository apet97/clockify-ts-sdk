# 0004: Live proof is sandbox-only and cleanup-oriented

## Status

Accepted.

## Context

Live proof mutates Clockify state. SDK, CLI, MCP, and GOCLMCP live tests
can create, update, delete, and inspect real workspace objects. Running
those flows against a customer workspace would turn proof into an
incident.

Mock/replay proof is useful for deterministic local confidence, but it
is not the same as live API proof.

## Decision

Live gates run only against a sacrificial sandbox workspace with explicit
`CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID`. Live flows must use
identifiable prefixes, pair creates with cleanup, and surface cleanup
receipts. If sandbox credentials are unavailable, final proof may defer
live proof only with a concrete reason.

## Consequences

- `make perfect-live` must be explicit and env-gated.
- Deferring live proof is residual risk, not silent success.
- Deterministic mock proof remains required for local non-live runs.

## Proof

- `make live-safety`
- `make mock-contract`
- `make perfect-live`
- `make final-proof-receipt-check`
