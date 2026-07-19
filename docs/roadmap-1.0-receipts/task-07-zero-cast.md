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

`make consumer-cast-budget` owns one TypeScript compiler-aware gate. It builds a
`Program`/`TypeChecker` over `cli/src` and `mcp/src`, proves generated request
provenance from the Clockify request modules, and traces request values through
bounded variable aliases, client aliases, helper calls, imports, namespaces,
properties, all potentially reaching receiver-qualified variable/property
writes (including computed keys), ordered conditional/logical/unknown receiver
aliases, parameter defaults, compound/destructuring assignments, property
declarations/accessors, recursively nested/defaulted/rest object and array
bindings, called same-file/imported helper side effects (including nested
receivers and synchronous `call`/`apply`/`bind`), documented synchronous
`forEach`/`map` callback effects, `Object.assign`, `Reflect.set`, contributing
binary/logical/sequence expressions, spread arguments and object spreads,
declaration-only casters, Function `call`/`apply`/`bind`, any-erased
receiver/method/helper/holder provenance including later holder writes and exact
`Function.call` trampolines,
and transitive/generic wrapper chains. It rejects request-boundary structural,
`any`/`never`, direct or chained generated-request assertions, angle-bracket
assertions, and request-producing generic adapters. It deliberately ignores
discarded comma operands, definitely overwritten values, unrelated local/third-
party `*Request` names, unrelated `any` parameters, response narrows, ordinary
non-request assertions, and test-only fixture casts.

A noncanonical exception validates only when it has all of:

- a unique id and owning source file;
- exactly one positive line range or one stable code marker;
- the exact generated request type;
- an existing discrepancy id;
- an existing risk whose status is `open`;
- an existing evidence path and anchor; and
- one exact Make target also owned by that risk's closure gate.

The referenced location and exact expected generated request type must match
exactly one current scanner finding. Risk ownership parses exact Make targets,
not substrings. Missing, partial, stale, duplicate-location, and orphaned
records fail. The canonical
contract additionally rejects every non-empty exception array, even if the
record is otherwise complete.

The canonical contract pins the complete governed roots, wrapper-root scan,
import closure, proof file, exact `IsAny`/`AssertFalse` semantics, the unshadowed
TypeScript `Parameters` built-in, both exact
public adapter imports/type arguments, all six exact adapter callback operands,
owning target, and compiler command. `make consumer-
cast-budget` depends on SDK codegen/build and executes the Task 6
`type-check:breaking` compiler proof; marker comments, hollow operands, and
comment-only Make prerequisites/recipes cannot satisfy the gate.

## TDD fixture proof

The corrective RED slices reproduced every review bypass: aliased and
parenthesized/element-access clients; indirect request values; direct,
angle-bracket, aliased `any`/`never`/generated assertions; imported aliases,
namespace/property helpers, helpers outside configured roots, transitive and
`Readonly<T>` wrappers, aliased-any adapters, and assigned helper results. The
suite also proves exact exception types/targets, canonical contract tampering,
comment-only proof rejection, and the unrelated `RetryRequest` false-positive
control.

The second corrective review added compiler-valid RED cases for annotated-any
variables, later assignment, object bindings, logical/nullish/sequence values,
spread arguments, structural request assertions, generic casts inside object
spreads, ambient/interface/imported declaration-only casters, and Function
`call`/`apply`/`bind`. It also proved unrelated logger `any` parameters remain
unflagged, pinned the exact six public-proof operands plus `IsAny`, and rejected
required Make wiring present only in comments. The final governance suite passes
**87/87** fixtures.

The third corrective review added RED/GREEN cases for branch-dependent reaching
writes and definitely-overwritten controls, receiver-specific property writes/
declarations/accessors, array bindings, direct and aliased receiver/method erasure to `any`,
and comma-expression contribution semantics. It also proved a compiler-green
local structural adapter counterfeit cannot replace the exact imported root and
`./ensure` `ArchiveThenDeleteAdapter<CurrentClient>` aliases. The final
governance suite passes **104/104** fixtures.

The fourth corrective review added RED/GREEN cases for receiver-qualified
property cutoffs, literal and unresolved computed writes, nested bindings,
omitted and explicit-`undefined` defaults, and interprocedural generated-call
recovery through any-typed helper parameters/results, holder values, and erased
Function `.call`. It preserves negative controls for different receivers,
definitely overwritten values, known different keys, unreachable defaults, and
unrelated any helpers. Compiler-green `type Parameters<T> = [unknown]` proof
counterfeits now fail. The final governance suite passes **123/123** fixtures.

The fifth corrective review added RED/GREEN cases for request-contributing
parameter defaults, reachable and unreachable `??=`/`||=`/`&&=` branches,
destructuring assignment targets, reaching-write-aware conditional/logical/
sequence/unknown receiver aliases, called versus uncalled same-file/imported
helper mutations, bounded recursive effects, computed binding keys, nested
object rest and array rest, later writes to any-valued function holders, and an
any-erased `Function.call` trampoline. Default and namespace type-import
counterfeits of `Parameters` now fail while the unrelated receiver, binding,
helper, property, and function controls remain green. The final governance
suite passes **154/154** fixtures.

The sixth corrective review added RED/GREEN coverage for destructured and
request-bearing object parameter defaults, exported/default-exported/escaped
callables, exact-receiver `??=`/`||=`/`&&=` reachability, typed object/array rest
assignments and defaulted assignment targets, bounded return-derived receiver
origins, nested helper receiver paths, synchronous helper `call`/`apply`/`bind`,
documented synchronous `forEach`/`map` callback effects, `Object.assign`, and
`Reflect.set`. Safe/unreachable structured defaults, distinct receivers, rest
exclusions, unused factory arguments, asynchronous callbacks, and unrelated-
object effects remain unflagged. The final governance suite passes **184/184**
fixtures.

Holiday update received a separate RED/GREEN regression. When list read-back
omits generated-required `occursAnnually`, preview now fails closed instead of
inventing `false`; no live/schema evidence supports that default.

## Corrective proof and review state

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
make pack-snapshot-check
git diff --check
```

Final round-four results: wrapper **763 passed / 7 skipped**, CLI **388 passed / 12
skipped**, and MCP **708 passed / 12 skipped**, with blank live credentials;
all three package lint/type/build gates and wrapper dual-build smoke passed.
Pack snapshots remained wrapper **2,800**, CLI **36**, MCP **109** paths; all
three dry packs passed and MCP remained **109 files / 111.3 kB**. The risk gate
passes with three deliberate readiness blockers, including this review-pending
risk, and the final full `contract-gates` run passes.

Verification also corrected two stale tests exposed by the broader run: holiday
name-resolution fixtures now include the required recurrence read-back, and the
wrapper discrepancy coverage map no longer classifies the resolved
`consumer.cast-budget` ledger item as compensated.

No OpenAPI, generator, synced generated tree, package contents, package version,
release workflow, tag, publication, GOCLMCP source, Task 8 surface, or live
Clockify state changed. No local mutation/Stryker command ran.

The inventory is green, but `consumer-request-casts` remains an open
release-readiness blocker until independent review approves this corrected
symbol/provenance gate and receipt.
