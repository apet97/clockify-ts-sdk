# Task 6 Receipt — 1.0 Breaking-Change Closure

Date: 2026-07-19
Task base: `fb1c18420ee3d4bc67466c2aeee7d9d4239f0326`

## Exact migration mapping

| Removed public name | Replacement |
|---|---|
| `allowInsecureBaseUrl` | `allowNonClockifyHttpsHost` |
| `findOrCreateClient` | `ensureClient` |
| `ArchiveThenDeleteResource` | `ArchiveThenDeleteAdapter<TCurrent>` |

No deprecated aliases remain. `allowNonClockifyHttpsHost` keeps the intended
security semantics: a caller may opt into a non-Clockify HTTPS host, while
non-loopback cleartext remains rejected. `ensureClient` retains the removed
helper's match/create/result/single-flight behavior.

## Typed archive/delete boundary

`ArchiveThenDeleteAdapter<TCurrent>` exposes three callbacks:

- `getCurrent({ workspaceId, id })` returns `Promise<TCurrent>`;
- `archive({ workspaceId, id, current })` receives
  `TCurrent & { name: string }` after the runtime name guard and returns
  `Promise<void>`; and
- `delete({ workspaceId, id })` returns `Promise<void>`.

The generic workflow owns `getCurrent` → `archive` → `delete` ordering, the
missing-name failure, already-archived behavior, and the result receipt. The
adapter owns resource-specific generated request shapes. CLI project deletion
uses the flattened project update; client deletion reconstructs the replacement
body and preserves editable current state. The dedicated client migration
example uses that same body envelope, preserves `address`, `currencyCode`,
`email`, and `note` (including empty strings), and is exercised by a runtime
ordering/body test.

## Fail-closed tests

The public type fixture uses real `@ts-expect-error` contracts for the removed
helper, removed resource type, and removed option. It compiles the replacement
under the regular NodeNext source configuration, a Bundler configuration, and
the built package's own `exports` map with source path aliases disabled. Type
utilities reject `any` callback inputs and prove `TCurrent` reaches `archive`.
Both removed exports are compile-negative through the root package and the
`./ensure` subpath; both replacement imports compile through the root package.

The named `make breaking-change-review` gate owns this proof: it regenerates and
syncs the SDK, builds the public package, runs the mapping/wiring regressions,
then compiles the Bundler and built-package fixtures before checking prose
markers. Its regression test pins that order and pins both adapter examples into
both compiler configurations.

The breaking-change validator tests remove each governed symbol and each
replacement field in turn. Every mutation must fail; the canonical three-row
mapping must pass. The dual-build smoke also rejects a returned runtime alias
and scans ESM/CJS declarations for the generic adapter and removed loose type.

## Closure proof

```text
node --test scripts/check-breaking-change-review.test.mjs
npm run lint -w clockify-sdk-ts-115
npm run type-check -w clockify-sdk-ts-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w clockify-sdk-ts-115
npm run build -w clockify-sdk-ts-115
npm run build:smoke -w clockify-sdk-ts-115
npm run type-check -w @apet97/clockify-cli-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w @apet97/clockify-cli-115
npm run type-check -w @apet97/clockify-mcp-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w @apet97/clockify-mcp-115
make examples-contract snippet-compile compatibility-contract breaking-change-review sdk-public-api
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make contract-gates
make pack-snapshot-check
npm pack --dry-run -w clockify-sdk-ts-115
git diff --check
```

Observed offline results: the mapping/wiring validator passed 9/9; wrapper passed 51
test files with one sandbox file skipped (763 passed, 7 skipped); CLI passed 38
files with one sandbox file skipped (388 passed, 12 skipped); and MCP passed 63
files with one sandbox file skipped (707 passed, 12 skipped). The dual-build
smoke exposed exactly 126 root names (92 curated plus 34 generated-core) in ESM
and CJS and resolved all 28 CJS subpaths. Dry packs contained 2,800 wrapper
files (302.3 kB packed), 36 CLI files (36.3 kB packed), and 109 MCP files
(111.3 kB packed); every path snapshot matched. The blank-credential
`contract-gates` run passed in full.

Task 7 remains open: this change does not alter its request-cast ratchet or
claim zero consumer request casts. No OpenAPI/generator/synced tree, package
version, tag, publication, release workflow, or GOCLMCP source changed. No live
Clockify operation or local mutation/Stryker run was performed.

## Independent-review closeout

Two independent reviewers approved the complete frozen range
`fb1c18420ee3d4bc67466c2aeee7d9d4239f0326..5485a65b33831c742f2d9dfe7eebcc4c164b6346`
with no blocking findings. Task 6 is complete at 2/2 approvals.
