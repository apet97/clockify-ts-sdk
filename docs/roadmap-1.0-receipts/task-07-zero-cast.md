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
named/aliased synchronous array callback effects on statically recoverable non-empty
receivers (`forEach`, `map`, `filter`, `every`, `some`, `find`, `findIndex`,
`flatMap`, `reduce`, and `reduceRight`), aliased `Object.assign`/`Reflect.set`
effects with bounded left-to-right patch-variable, spread-source, factory-return,
and definite same-key overwrite provenance, contributing
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

The seventh corrective review added RED/GREEN coverage for named and aliased
callbacks across all ten governed synchronous array methods, including
`reduce`/`reduceRight` argument substitution. It also covers patch variables,
object spreads, factory-returned patches, and direct/namespace/property aliases
of `Object.assign` plus direct/namespace aliases of `Reflect.set`. Known-empty
and unknown-emptiness receivers, definite logical short circuits, named async
callbacks, distinct mutation receivers, and unrelated local `assign` functions
remain unflagged. Overwritten mutation aliases and patch values are also cut
off by bounded reaching-write provenance. The final governance suite passes
**217/217** fixtures.

The eighth corrective review added RED/GREEN coverage for array receiver aliases
and reaching overwrites, multi-iteration `reduce`/`reduceRight` return-to-next-
accumulator propagation, and return/branch-aware termination for `some`,
`every`, `find`, and `findIndex`. Unknown returns remain conservative. Ordered
`Object.assign` sources and object spreads now honor JavaScript left-to-right,
last-definite-same-key semantics across direct, aliased, and factory-returned
patches. Unresolved computed and spread keys stay conservative when last, while
a later explicit same-key write safely dominates them. The final governance
suite passes **237/237** fixtures.

The ninth corrective review added RED/GREEN coverage for conditional, logical,
and sequence array receiver alternatives; nested helper effects from synthetic
inline callback invocations; and receiver-qualified dominance across sequential
`Object.assign`/`Reflect.set` calls. Unresolved direct assign sources now carry
the same ordered wildcard semantics as unresolved spreads. Destructured and
renamed built-in aliases follow reaching overwrite provenance without accepting
shadow objects. Explicit limits cap static alternatives at 64, synthetic
invocations at 256, and total expansion work at 10,000; overflow produces a
stable fail-closed governance error. The final governance suite passes
**254/254** fixtures.

The tenth corrective review made cross-statement dominance conditional on the
later effect being definitely executed: unknown `&&`, `||`, `??`, and ternary
branches retain prior unsafe writes, while statically forced branches can still
dominate. Direct request literals and `Object.assign` projections now trace
getter return values. Built-in-provenance-aware `Object.defineProperty` and
`Object.defineProperties` aliases contribute ordered descriptor `value`/`get`
effects without crossing receivers. The configurable total-work cap now stops
expansion at the exact limit and returns stable `{ work, exhausted }` analysis
statistics. The final governance suite passes **273/273** fixtures.

The eleventh corrective review separates conditional/reaching
`defineProperty` descriptor and `defineProperties` map alternatives into
mutually exclusive effect paths, so a safe branch cannot erase an unsafe peer.
Descriptor provenance now follows shorthand/aliased getter callables, object
spreads, aliases, and factory returns. Unresolved direct maps and map spreads
emit ordered wildcard effects: a later exact descriptor may dominate them, but
an unknown last write remains governed. Recursive conditional/logical reducer
return origins are charged and width-bounded before concatenation, with the
largest callback expansion included in observable analysis statistics. The
final governance suite passes **289/289** fixtures.

The twelfth corrective review gives `Reflect.defineProperty` the same
receiver-qualified descriptor paths, getter/alias provenance, conditional
semantics, and sequential dominance as `Object.defineProperty`. Built-in
provenance now recognizes literal and reaching const-literal element access for
`Object['assign']`, `Object['defineProperty']`, `Object['defineProperties']`,
`Reflect['set']`, and `Reflect['defineProperty']`. The resolver follows definite
key overwrites while retaining exact global symbol identity, so shadow
`Object`/`Reflect` values and unrelated local members remain non-effects. The
final governance suite passes **316/316** fixtures.

The thirteenth corrective review normalizes effective callees and arguments
before governed built-in effect classification. Direct, aliased, and computed
`Object.assign`, `Reflect.set`, `Object.defineProperty`,
`Reflect.defineProperty`, and `Object.defineProperties` now retain their
receiver-qualified descriptor/order semantics through Function `call`, static
tuple/array `apply`, and later-invoked `bind` captures. Normalization preserves
destructured aliases and reaching overwrite identity, stays bounded, and leaves
shadow globals, unrelated functions, overwritten aliases/keys, and uninvoked
binds as non-effects. The final governance suite passes **339/339** fixtures.

The fourteenth corrective review retains every reachable callee alternative
when a bound-function candidate is present, so a mixed local/bound path cannot
incorrectly establish cross-statement dominance. Equivalent governed paths may
still dominate only when every path has the same receiver and property effect.
Static `apply` arrays now flatten bounded, statically resolvable tuple/array
spreads and aliases while unresolved, non-array, or overflowing governed apply
lists fail closed. Invoked `bind.call`/`bind.apply` factories, including aliased
and computed bind members, normalize recursively; merely creating the bound
function remains a non-effect. The final governance suite passes **354/354**
fixtures.

The fifteenth corrective review adds global-provenance `Reflect.apply`
normalization for direct, aliased, literal/const-computed calls and governed
target aliases. Its third argument uses the same bounded static tuple/array and
spread flattening as Function `apply`; unresolved or overflowing lists for a
governed target fail closed. Bind recognition now proves that the reaching
member is the native lib-declared `Function.prototype.bind` and rejects
exact-callable property overwrites without conflating sibling functions,
including custom bind functions invoked
through direct, `call`, or `apply` paths. Shadow `Reflect`, unrelated targets,
custom bind members, and uninvoked native binds remain non-effects. The final
governance suite passes **370/370** fixtures.

The sixteenth corrective review orders reaching `Function.prototype.bind` and
`Reflect.apply` member values across direct assignment, `Object.assign`,
`Object.defineProperty`, `Reflect.defineProperty`, and `Reflect.set`. Definite
native restoration resumes normalization; conditional native/custom paths retain
both alternatives, and captured native `Reflect.apply` aliases remain stable
after later member overwrite. Invoked custom binders now propagate the captured
receiver substitutions of their returned callable through direct, `call`,
`apply`, and conditional-return paths. Sixteen of the initial 19 focused cases
failed against `d499b6b`; the three native-alias/conditional controls stayed
green. The finished focused set passes **19/19**, and the complete controller
suite passes **389/389** fixtures while retaining the prior 370 cases.

The seventeenth corrective review recognizes an unshadowed canonical
`Function.prototype.bind` value as native when assigned or restored, without
requiring `Function.prototype` itself to expose call signatures. Custom binders
now register their own synchronous invocation-time effects for direct, `call`,
and `apply` paths before their returned callable is invoked. Lifted effect
ordering preserves conditional alternatives: a later definite safe returned
write can dominate an earlier unsafe binder-body write, while a conditional safe
write cannot. Seven of the initial 10 focused cases failed against `b1fe041`;
the shadow/non-native and definite-overwrite controls stayed green. The finished
focused set passes **10/10**, and the complete controller suite passes
**399/399** fixtures while retaining the prior 389 cases.

The eighteenth corrective review preserves runtime order when a custom binder's
returned callable is invoked immediately in the same expression. Lifted effects
now carry an explicit execution phase after their source position: binder-body
effects are phase 0 and returned-callable effects are phase 1. A definite safe
returned write therefore dominates an earlier unsafe binder write for direct,
`call`, and `apply` forms, while unsafe-last and conditional-later-safe paths
remain findings. Three of the initial seven focused cases failed against
`5f61853`; all four unsafe/conditional controls stayed green. The finished
focused set passes **7/7**, and the complete controller suite passes **406/406**
fixtures while retaining the prior 399 cases.

The nineteenth corrective review makes intra-expression dominance path-complete:
a later returned-callable phase cuts off earlier binder effects only when every
registered mutually exclusive binder/return path performs an equivalent
receiver/name-qualified definite write. A safe write from one conditional path
cannot erase an unsafe write from another. Lifted direct property assignments
now retain their original within-phase source sequence and contribute definite
write metadata only when their path is unconditional and has no preceding
function exit. Eleven of the initial 19 focused cases failed against `9c32686`;
the eight all-safe, unsafe-last, conditional, early-return, and receiver controls
stayed green. The finished focused set passes **19/19**, and the complete
controller suite passes **425/425** fixtures while retaining the prior 406 cases.

The twentieth corrective review follows immediately invoked returned callables
recursively instead of stopping after one binder-return layer. Each nested call
increments its execution phase and refines its parent's mutually exclusive path
into concrete return leaves, so safe-final and unsafe-final writes are ordered
correctly across direct, `call`, and `apply` forms without merging exclusive
alternatives. Depth, work, and alternative caps plus unresolved invoked returns
fail closed; returning a nested callable without invoking it remains a
non-effect. Eleven of the initial 18 focused cases failed against `d03ece0`; the
seven conditional/noop, mutually exclusive, and non-invoked controls stayed
green. The finished focused set passes **18/18**, and the complete controller
suite passes **443/443** fixtures while retaining the prior 425 cases.

The twenty-first corrective review preserves mixed native/custom bind paths
through nested invocation, classifying native identity per reaching member
value and carrying execution phase plus alternative identity into normalized
built-in writes. Non-returning custom-binder branches remain registered and an
attempt to invoke their unresolved result fails closed without making an
uninvoked return an effect. Reachable governed request traces now also fail
closed at the depth bound, while below-limit and unreachable/uncalled chains
retain their prior behavior. Twelve of the initial 20 focused cases failed
against `cbad610`; the eight all-safe, non-invoked, below-limit, and unreachable
controls stayed green. The first canonical run then exposed that generic
structural depth also counted non-request inputs such as schema descriptions and
tool context. A real-shape 40-hop metadata argument reproduced that false
failure before helper depth was limited to request-contributing return paths.
The finished focused set passes **21/21**, and the complete controller suite
passes **464/464** fixtures while retaining the prior 443 cases.

The twenty-second corrective review makes request contribution govern every
trace-local assertion, annotated-any, and any-returning-helper finding. Ignored
metadata remains clean even through 40 helpers, while a parameter substituted
back into a request-producing return restores contribution and detection.
Source-wide generated-request assertions remain independently governed. Generic
AST and helper-depth exhaustion now use the same stable Set-backed failure before
either guard returns, so deeply nested returned-parameter calls cannot bypass the
ratchet or create duplicate noise. Five of the initial 10 focused cases failed
against `30b5c79`; the five contributing, public, legitimate non-request, and
below-limit controls stayed green. The finished focused set passes **10/10**,
and the complete controller suite passes **474/474** fixtures while retaining
the prior 464 cases.

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

Final twenty-second-correction results: wrapper **763 passed / 7 skipped**, CLI **388
passed / 12 skipped**, and MCP **708 passed / 12 skipped**, with blank live credentials;
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
