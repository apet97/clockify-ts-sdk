# 0005: Own the TypeScript SDK generator locally

## Status

Accepted.

## Context

GOCLMCP remains the canonical API truth, and
`spec/corrected/clockify.corrected.openapi.yaml` remains the local snapshot.
The TypeScript package needs reproducible code generation without a hosted
generator account, Docker-only generator container, API token, or paid
entitlement.

The generated SDK must still look like the current public lower layer:
`output/ts-sdk/**` is synced into `wrapper/src/**`, hand-written wrapper seams
stay outside generated output, and CLI/MCP keep importing only the public
package surface.

## Decision

Use a repo-owned local TypeScript generator at
`scripts/generate-sdk-from-openapi.mjs`. It reads
`spec/corrected/clockify.corrected.openapi.yaml`, emits `output/ts-sdk/**`, and
is wired through `make sdk-codegen` before wrapper sync and package gates.

Generator behavior belongs in that script and its tests/contracts. Product
ergonomics stay in hand-written wrapper seams unless the generator needs a
source-shape fix to preserve compatibility.

## Consequences

- `make perfect-full` must run the local generator path rather than Fern or a
  hosted SDK platform.
- Generator dependencies must be explicit local development dependencies, never
  SDK/CLI/MCP runtime dependencies.
- Existing SDK, CLI, and MCP compatibility gates remain the proof that the
  generated layer is a compatible replacement.
- `spec/fern/**` can remain as historical evidence or fallback input during the
  transition, but it is not the default TypeScript generation path.

## Proof

- `make generator-config`
- `make generator-independence`
- `make generator-portability`
- `make dependency-boundary`
- `make sdk-codegen`
- `make perfect-full`
