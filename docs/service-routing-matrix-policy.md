# Service routing matrix policy

`docs/service-routing-matrix.json` is the evidence-backed source for every
Clockify service host this SDK, CLI, and MCP may route to. H02-ROUTING approved
it on 2026-07-27, and ROUTE-002 shipped runtime multi-service routing in SDK
0.13.0.

**No runtime code imports this file.** It stays evidence tooling; the wrapper
carries an equality-pinned hand-written copy of the approved global/regional
rows in `wrapper/internal/routing.ts`, and
`wrapper/tests/routing-matrix-equality.test.ts` fails closed if the two drift —
the same arrangement `authenticated-boundary-fetch.ts` uses for
`CLOCKIFY_PROD_HOSTS`. Change the matrix and the wrapper copy together.

## Evidentiary standard

Every row in `profiles.*` is one of:

- **Proven** — `url` (exact) or `urlTemplate` (parameterized) plus a required
  `sourcePointer` (exact citation into `spec/official` and/or
  `spec/corrected`) and `proofKind` (`spec-corrected`, `official-doc-only`,
  `spec-corrected+official-doc`, or a future evidence class). A row proven
  only from `spec/official` prose (not from a `spec/corrected` per-operation
  `servers` override or a live-evidence-manifest row) must set
  `liveConfirmationRequired: true`.
- **Unsupported** — `url: null` plus a required `unsupportedReason` explaining
  exactly what evidence is missing.

There is no third state. A row must never assert a URL without a source
pointer, and staleness/inference is never accepted as a substitute
(`scripts/service-routing-matrix.mjs` enforces this: missing `sourcePointer`,
missing `proofKind`, wildcard host text, credentials/query/fragment in a
service URL, plain HTTP on a non-loopback host, an unrecognized regional
prefix, and conflicting templates for the same profile/service key are all
hard rejections).

## Regenerating / updating

1. Re-derive the operation-to-service map: `node scripts/service-routing-matrix.mjs`
   recomputes it live against `spec/corrected/clockify.corrected.openapi.yaml`
   and asserts every operation resolves to exactly one recognized service host
   (currently `api`, `reports`, `audit` — see `operationServiceDerivation` in
   the matrix for the current counts, which are a review snapshot, not the
   enforced value).
2. Any new profile/service row requires a real `sourcePointer` you can quote
   verbatim from `spec/official` or `spec/corrected` — never a plausible
   guess, and never a copy of a sibling region's URL with the prefix swapped
   without checking the source text actually documents that substitution
   generally (the `regionalPrefixes` table in the matrix is the one place
   that substitution rule is proven; individual per-region URLs still need
   their own `sourcePointer`).
3. If official and corrected sources conflict, or a value cannot be proven
   either way, add an entry to `conflicts[]` with `needsHumanResolution: true`
   instead of picking an interpretation. Do not resolve a conflict by editing
   code in `wrapper/internal/authenticated-boundary-fetch.ts` or
   `scripts/sdk-codegen/emitter.mjs` from this matrix's evidence alone — that
   allowlist is runtime territory (ROUTE-002).
4. `make service-routing-matrix` runs the full validator plus the
   operation-service derivation.

## Human approval (H02-ROUTING)

A stale or unapproved matrix must never be treated as authorizing ROUTE-002
runtime work. The literal-executor remediation plan's H02-ROUTING checkpoint
requires a human to review every service/profile URL template and source
pointer, and resolve every open `conflicts[]` entry (by citing authoritative
documentation, or by explicitly authorizing a read-only live probe in a
sacrificial workspace) before routing implementation may begin. That
checkpoint was satisfied on 2026-07-27 (see `approved` / `approvedBy` /
`approvedDate` in the matrix), which is what authorized ROUTE-002; the bar
is unchanged for every future matrix change.
