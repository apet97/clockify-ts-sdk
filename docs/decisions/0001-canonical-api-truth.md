# 0001: Canonical API truth starts in GOCLMCP

## Status

Accepted.

## Context

This repo packages a TypeScript SDK, CLI, and MCP server, but it does
not own the canonical Clockify OpenAPI generator. GOCLMCP owns canonical Clockify OpenAPI generation from curated sources, live evidence, discrepancy records, and drift gates.

`spec/corrected/clockify.corrected.openapi.yaml` is a snapshot copied from GOCLMCP. In other words, spec/corrected/clockify.corrected.openapi.yaml is a snapshot, not authoritative source. Editing it directly would fork truth and make the SDK look correct while the Go MCP and generated docs drift.

## Decision

API truth changes start in GOCLMCP sources or generator data. This repo
consumes the corrected snapshot, runs local SDK codegen, syncs generated output,
and adds product seams above the generated core.

## Consequences

- Do not hand-edit `spec/corrected/clockify.corrected.openapi.yaml`.
- Do not patch `output/ts-sdk/**` to hide generator problems.
- OpenAPI shape changes require GOCLMCP drift gates before local SDK
  package proof.

## Proof

- `make generated-edit-check`
- `make openapi-evidence`
- `make generator-config`
- `make perfect-full`
