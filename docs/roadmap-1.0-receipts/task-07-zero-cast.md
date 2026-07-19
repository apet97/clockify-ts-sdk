# Task 7 Receipt — Zero Request-Cast Ratchet

Date: 2026-07-19
Task base: `5485a65b33831c742f2d9dfe7eebcc4c164b6346`

## Canonical inventory

- Governed CLI request casts: **0**.
- Governed MCP request casts: **0**.
- Canonical CLI exception records: **0**.
- Canonical MCP exception records: **0**.
- Public blanket `any` adapter: **none**; the Task 6 public-package type fixture
  proves all root and `./ensure` adapter callback inputs are not `any`.

Machine-readable inventory summary: **CLI 0, MCP 0** request casts; **CLI 0,
MCP 0** canonical exceptions.

The source scan found and removed two residual MCP holiday request-object
assertions. Holiday create/update bodies now use `ClockifyRequestBody<T>` and
generated flattened request unions directly. `scopeFilter` exposes its precise
structural return type, so those assignments remain generated-type checked. The
CLI shared-report `exportType` property assertion remains valid: it narrows one
generated request property and is not a blanket request-object assertion.

## Fail-closed governance

`make consumer-cast-budget` owns one source-aware gate. It parses supported
`cli/src` and `mcp/src` TypeScript and rejects request-boundary `as never`, direct
or chained generated `*Request` assertions, angle-bracket assertions,
helper-hidden generic casts (including cross-file helpers), and `any`-typed
request adapters. It deliberately ignores non-request assertions, response
narrows, and test-only fixture casts.

A noncanonical exception validates only when it has all of:

- a unique id and owning source file;
- exactly one positive line range or one stable code marker;
- the exact generated request type;
- an existing discrepancy id;
- an existing risk whose status is `open`;
- an existing evidence path and anchor; and
- one exact Make target also owned by that risk's closure gate.

The referenced location must match exactly one current scanner finding. Missing,
partial, stale, duplicate-location, and orphaned records fail. The canonical
contract additionally rejects every non-empty exception array, even if the
record is otherwise complete.

## TDD fixture proof

The first fixture run failed because the importable validator did not exist.
Subsequent RED slices proved the old regex missed chained generated requests,
helper-hidden generic casts, and `any` request adapters. The final 29-fixture
suite covers every required assertion form, every governance field, missing
references, a stale marker, an orphaned record, both stable-marker and exact-range
locations, cross-file helpers, duplicate id/location ownership, canonical
non-empty rejection, and false-positive controls.

## Closure proof

```text
node --test scripts/check-consumer-cast-budget.test.mjs
npm run lint -w clockify-sdk-ts-115
npm run type-check -w clockify-sdk-ts-115
npm run type-check:breaking -w clockify-sdk-ts-115
npm run lint -w @apet97/clockify-cli-115
npm run type-check -w @apet97/clockify-cli-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w @apet97/clockify-cli-115
npm run build -w @apet97/clockify-cli-115
npm run lint -w @apet97/clockify-mcp-115
npm run type-check -w @apet97/clockify-mcp-115
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' npm test -w @apet97/clockify-mcp-115
npm run build -w @apet97/clockify-mcp-115
make consumer-cast-budget risk-register contract-gates
git diff --check
```

No OpenAPI, generator, synced generated tree, package contents, package version,
release workflow, tag, publication, GOCLMCP source, Task 8 surface, or live
Clockify state changed. No local mutation/Stryker command ran.
