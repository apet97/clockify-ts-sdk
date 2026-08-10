# Changelog

All notable changes to `clockify-sdk-ts-115` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/);
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- README and cookbook now document six SDK-side helpers that shipped without
  discoverable docs: `otel-hooks` (OpenTelemetry span attributes for
  `composedFetch`), `wrapResource` (scope a bare resource client without a
  full `Workspace`), a `withResponse` usage example (was a single sentence),
  `paginatedList` (the single-value pagination handle, was undocumented),
  read-side rate-limit reading via `getRateLimit` (only the error-side
  `getRateLimitFromError` had an example), and an `invoiceUpdateBodyFromExisting`
  cookbook recipe (was a one-line table row). No behavior changed.

- `npm test` now also runs the type-only test suite (`tests/types/*.test-d.ts`)
  via a chained `vitest --typecheck.only --run`, so a public-type widening
  (e.g. a mutually-exclusive option pair losing its `never` guard) fails the
  ordinary test command instead of only the separate, easy-to-skip
  `npm run test:types` / `npm run build:smoke` path.

- New `examples/quickstart.ts`: the [quickstart receipt](../docs/quickstart-receipt.md)'s
  three steps (local diagnostics, client construction, a health probe) as one
  runnable, mock-safe script. `make examples-run` (repo `perfect-full` tier)
  proves it against a real mock Clockify server on every proof run.

### Changed

- The README now opens with absolute GitHub links to the cookbook, runnable
  examples, per-resource method docs, the repo documentation index, and the
  changelog, because relative links do not resolve on the npm package page.

- The first health-check guide and example now use `clockifyHealth`, and the
  webhook guide warns that `ClockifyWebhookEvent` is not live-verified and
  callers should pass an explicit payload type until a live probe confirms the
  delivery shape.
- The retry guide now explains that supplying `retryPolicy`, including
  `false`, disables the generated client's default retry layer and documents
  the per-request override that can re-enable it.

### Fixed

- `examples/first-health-check.ts` and `examples/list-all-projects.ts` now
  pass `environment: CLOCKIFY_BASE_URL` to `createClockifyClient` when that
  variable is set, matching their own header comment's mock-safe claim.
  Neither example nor `createClockifyClient` read that variable before, so
  pointing them at a mock server still hit the real API.
- `examples/invoice-client.ts`'s fixture now includes `dueDate`, `issuedDate`,
  and `tax2`. `invoiceUpdateBodyFromExisting` requires all three; the example
  crashed with an uncaught `TypeError` as shipped.
- `examples/webhook-express.ts`'s handler and its own smoke block now share
  one default token constant. They previously fell back to two different
  literals, so the example's "valid signature" demo case failed signature
  verification instead of printing the documented `200 ok`.
- `examples/auth.ts`, `examples/retry-custom.ts`,
  `examples/middleware-datadog.ts`, `examples/quickstart.ts`, and
  `examples/handle-rate-limit.ts` no longer throw when
  `CLOCKIFY_API_KEY` is set to an empty string. `?? "demo-key"` only
  triggers on `null`/`undefined`, not `""`, and this repo's own
  documented local-proof convention runs gates with `CLOCKIFY_API_KEY=''`
  to make live sandbox suites self-skip. Each example now treats a blank
  string the same as unset.
- All six examples above now run under `make examples-run`'s mock-safe
  allowlist (6 total) on every `perfect-full` proof run.

## [5.0.1](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v5.0.0...wrapper-v5.0.1) - 2026-08-09

### Fixed

- Binary operations now parse non-2xx JSON/text error bodies before creating
  the typed SDK error, so download/export failures retain Clockify's message
  and body code. Success responses that offer both JSON and binary media now
  carry the documented JSON schema as `BinaryResponse`'s default `.json()`
  type while retaining the streaming and download helpers.
- `isAbortError` now recognizes the raw `AbortError` reason from a default
  `controller.abort()` as well as `ClockifyAbortError`. The request runtime
  still preserves every exact `AbortSignal.reason`, including custom values.
- Custom routing now rejects empty service maps and non-HTTP loopback URLs.
  Its required custom-host opt-in also remains effective when the legacy
  `allowNonClockifyHttpsHost` option is explicitly `false`.
- `retryPolicy.computeDelay` now rejects negative and non-finite results
  instead of passing them to the platform timer as a tight retry.
- `iterPages` and `iterAll` now reject unsafe page bounds before dispatch, so
  floating-point overflow cannot make a bounded walk exceed `maxPages`.
- Repeated-page detection now pins stable item ids even when other fields
  change, uses collision-free JSON array encoding for adjacent ids, and falls
  back to page JSON without blocking a walk when it cannot be serialized.

### Removed

- The generator no longer emits three dead internal modules —
  `core/base64.ts`, `core/form-data-utils/`, and `core/runtime/` — that had
  zero importers anywhere in the SDK and were never part of the public API.
  The published tarball drops the 12 corresponding `dist/` files
  (ESM/CJS × `.js`/`.d.ts`). No public name or subpath changes.

## [5.0.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v4.0.0...wrapper-v5.0.0) - 2026-08-09

This major is driven by type-level breaking changes. Existing consumer code
can fail to compile against 5.0.0:

- `StartTimerTimeEntriesRequest` now requires `body`. It previously
  type-checked a bulk edit that sent nothing.
- 29 generated interfaces gained `[key: string]: unknown`, which widens
  `keyof`, disables excess-property checking on object literals annotated
  with those types, and makes them assignable to `Record<string, unknown>`.

### Fixed

- `build:smoke` now runs the type-level test suite (`test:types`), which no
  Makefile target or workflow previously invoked — 28 compile-time assertions
  were proof that nothing executed.
- The authenticated boundary's `redirect: "follow"` rejection is now a
  `RedirectNotAllowedError` instead of a plain `TypeError`, so the retry loop
  recognizes it and surfaces it at once. Before, this deterministic config
  error was retried with full backoff (1s, then 2s on the defaults) and
  counted in retry metrics as a network error. The error's message and
  `name` are unchanged; the class moved to a shared internal module so the
  boundary and `composed-fetch.ts` throw one identity.
- `iterPages`/`iterAll` now reject a `pageSize` above 200, agreeing with
  `expense-list.ts` and the documented Clockify maximum; the server silently
  clamps larger values, which desynchronized the full-page heuristic.
- `iterPages`/`iterAll` throw instead of hanging when the server returns the
  identical non-empty page twice in a row while signalling more pages — the
  one remaining true-infinite-loop shape (an empty page already terminated
  every walk). Legitimate unbounded walks are unaffected.
- `Retry-After` delays (both delta-seconds and HTTP-date) are now jittered
  positive-only and then capped, as the docblock always claimed — matching
  the `X-RateLimit-Reset` path and removing the thundering herd of clients
  rate-limited at the same instant retrying at the same instant.
- `validateRetryPolicy` now validates `initialDelayMs`, `maxDelayMs`, and
  `jitter` (finite, non-negative, jitter ≤ 1) — a negative `maxDelayMs`
  previously produced a tight retry loop with no error. Validation also
  moved from the first request to `composedFetch()` construction, matching
  the POST/PATCH method guard.
- `npm test` and `npm run type-check` now work on a fresh clone: a
  `pretest`/`pretype-check` hook generates the gitignored `wrapper/src/`
  tree via the same codegen pipeline `make sdk-codegen` runs when it is
  absent, and is a no-op when it is present.
- The abort-design comments in `composed-fetch.ts` no longer cite a
  "post-loop" rethrow that does not exist; the terminal cases throw from the
  loop's error branch. Behaviour unchanged.
- The coverage include list names `internal/**/*.ts` explicitly. Under the
  Vitest 4 v8 provider the auth-boundary and routing modules were already in
  the measured denominator (totals unchanged: 98.48 lines / 97.52 functions /
  93.67 branches / 97.21 statements before and after), so this is a
  clarification, not a re-baseline — the non-recursive `*.ts` pattern read as
  if they were excluded.
- The `name_reserved_after_delete` error entry no longer claims the list call
  hides archived rows. It returns archived and active rows unless `archived=false`
  is sent (live probe 2026-08-09). The text ships in `error-codes.ts`.
- A request type whose body contributes no named fields no longer offers a
  body-less arm. `PUT /workspaces/{id}/user/{id}/time-entries` takes an array
  body (`BulkEditTimeEntryRequest[]`), which cannot be spread across the request
  as named properties, so its flattened arm declared no `body` at all and the
  union type-checked a bulk edit that sent nothing. Such an operation now emits
  the envelope arm alone, and `body` is required. `StartTimerTimeEntriesRequest`
  is now an alias of `StartTimerTimeEntriesRequestBodyEnvelope`; the removed
  `…RequestFlattened` arm had no callers.
- An inline object schema keeps its declared properties instead of collapsing to
  `Record<string, unknown>`. `TimeEntryCreate.customFields` — a write path — had
  erased `customFieldId`, `sourceType` and `value`; it now types them. The shapes
  are emitted anonymously and inline, so no new public name is minted.
- The 29 schemas that declare `additionalProperties: true` alongside properties
  now emit `[key: string]: unknown`. The generated interfaces previously claimed
  the declared property set was exhaustive.
- An array of inline objects no longer gets redundant parentheses. Only a
  top-level union needs them before `[]`. The union splitter also stops reading
  a bracket inside a string literal as structure, which could have dropped the
  parentheses an array of unions does need.

### Changed

- **Breaking at the type level** (no runtime behaviour changes; the release
  decider should treat these as major). Two of the fixes above tighten types
  that consumers may already depend on:
  - `StartTimerTimeEntriesRequest` now requires `body`. Code that compiled
    before was the silent no-op this release fixes, so it should fail.
  - The 29 interfaces that gained `[key: string]: unknown` widen `keyof`, stop
    excess-property checking on object literals annotated with them, and become
    assignable to `Record<string, unknown>`.

- `classifyClockifyError` no longer re-tests `statusCode == null && cause != null`
  in its `connection_error` arm. It only ever sees the output of
  `promoteApiError`, which has already converted every statusCode-less error
  carrying a cause into `ClockifyConnectionError`, so the operand was
  unreachable. The abort arm's cause check stays: a pre-promoted
  `ClockifyConnectionError` passes promotion untouched, so an abort-shaped cause
  inside one is recognized only there. No observable change.

### Tests

- Two mutation kill-tests on `errors.ts`, which sat exactly on its floor of 93
  after 4.0.0. They pin that `clockifyErrorDetail` never splices a foreign
  error's `body` into its message, and that a subclass's `rawResponse` reaches
  the base error. No runtime change.
- A kill-test for the `isAbortCause` null guard. `typeof null === "object"`, so
  dropping the guard reaches a property read on `null` and throws inside the
  classifier; `cause` is a public `unknown` field, so a JS caller really can
  hand back `cause: null`. The remaining `errors.ts` survivors are classified as
  equivalent in `docs/rejected-findings.md`.

## [4.0.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v3.0.0...wrapper-v4.0.0) - 2026-08-08

### Removed

- **BREAKING:** `currencyCode` is gone from the client request bodies
  (`ClientCreateBody`, `UpdateClientsRequestBody` and their flattened forms).
  Clockify ignores the field on both `POST` and `PUT` — live-probed 2026-08-08,
  a create with `currencyCode: "USD"` produced a workspace-default client and a
  `PUT` with `currencyCode: "RSD"` left the currency untouched — so the type
  promised something the API never did. Delete the field from your call; there
  is nothing to replace it with, because the currency is the one client field
  Clockify keeps when a replacing `PUT` omits it. It is unchanged on the
  response types, which do return it. See `spec/evidence/discrepancies.md`
  `clients.write.currency-code-is-inert`.

### Changed

- **BREAKING:** `ClockifyApiError.message` no longer embeds the response body.
  It is now `"<ErrorName>\nStatus code: <n>"`. Clockify echoes submitted values
  into its error text, so the routine `log(err.message)` was a way to put
  request data in your logs. Nothing is lost: the full body was already on
  `err.body`, and the new `clockifyErrorDetail` is the opt-in string that
  combines both. If you print errors to the caller that submitted them, switch
  to `clockifyErrorDetail(err)`; if you log them, keep using `err.message`,
  which is now safe. Error *classification* is unaffected:
  `classifyClockifyError` reads the body directly, including the nested
  `body.error.message` envelope that the serialized message used to expose by
  accident.

### Added

- `clockifyErrorDetail(err)` (root and `clockify-sdk-ts-115/errors`): the full
  diagnostic string, the error's `message` plus Clockify's upstream explanation
  from the response body. This is the one accessor that can carry request data;
  `err.message`, `getErrorCode` and every `classifyClockifyError` field stay
  body-free.
- `ccEmails` (at most three addresses) and `currencyId` on the client update
  body. Both are honoured on `PUT` only — a create silently ignores them — and
  both are now declared, so a replacing update can carry them across instead of
  clearing them. `wrapper/examples/archive-then-delete-client-adapter.ts`, the
  documented replacement-body pattern, preserves `ccEmails`.

### Documentation

- `getErrorCode`'s note about logging is inverted: `err.message` is now the safe
  string, and `clockifyErrorDetail` is the one to keep out of shared logs.
- Corrected the description of body code `3000`. It is a generic
  malformed-request code covering both an unsupported method (405) and a bad
  query parameter (400), not an immutable-resource marker.

## [3.0.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v2.0.0...wrapper-v3.0.0) - 2026-08-08

### Fixed

- `getErrorCode` now reads Clockify's error codes. Clockify sends the body's
  `code` field as a JSON number (`{"message":"...","code":501}`), but the
  accessor required a string, so it returned `undefined` for every real
  Clockify error. Both the top-level and nested-envelope arms now convert a
  finite number with `String()`; the return type is unchanged (`string |
  undefined`). **Behavior change for consumers:** calls that previously
  returned `undefined` now return the code, for example `"501"` validation,
  `"1000"` missing or duplicated auth header, `"4003"` unknown API key,
  `"4017"` invalid add-on token, `"3000"` immutable resource.
- `classifyClockifyError().serverCode` is populated again. It reads through
  `getErrorCode`, so it was permanently unset by the same defect.

### Changed

- `entityChangesExperimental.listCreated`, `.listUpdated`, and `.listDeleted`
  now return `EntityChangeDocument[]`. Clockify's published spec declared the
  first two as `string` and the third as a paged object wrapper; live probing
  on 2026-08-08 showed all three answer with a bare array. Breaking for typed
  consumers of those three methods, who could not have been consuming them
  successfully — no response matched the declared types.

### Added

- `IterOptions.onTruncated` reports that `maxPages` stopped a walk that had
  more pages. `iterAll` flattens the page envelope away, so a bounded walk
  that stopped early was indistinguishable from a complete one. The callback
  carries the same precision as `hasNextPage`: exact on the endpoints that
  send `Last-Page`, and possibly over-reporting on the rest, where an
  exactly-full final page is ambiguous.

### Documentation

- `createClockifyClient` now states that `timeoutInSeconds` has no default and
  that a request otherwise waits until the socket gives up. No default was
  added: Clockify's detailed-report routes can legitimately run for minutes.
- `mapAddonTokenRestriction` no longer presents its list of add-on-restricted
  endpoint families as fixed. Which families are refused varies by add-on, and
  this repo's own evidence ledger records an add-on webhook-create path.
- The SDK README's `getErrorCode` example checked a string code that no
  Clockify route returns.
- README states the tested runtime contract: Node.js >= 22.13 and Cloudflare
  Workers (with `nodejs_compat` for the `node:crypto` and `node:os` imports),
  backed by the `workers-compat/` workerd CI gate.

## [2.0.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v1.0.1...wrapper-v2.0.0) - 2026-08-07

### Changed

- The generated request/response surface now matches behaviour re-probed
  against a live workspace on 2026-08-07. Breaking for typed consumers:
  `DeleteInvoiceItemsRequest.order` is a `number` (the path segment binds to a
  Java `int` with `minimum: 1`; `abc` returns a conversion error and `0`
  returns "must be greater than or equal to 1"), and
  `CreateTimeOffPolicyRequest.approve` is required (omitting it returns 400
  "must not be null" under every assignee shape).

- `deleteClient` and `deleteTag` are typed as returning the deleted entity.
  Both answer 200 with the full object; only `deleteExpense` is genuinely
  empty-bodied.

- The bare `GET /shared-reports/{id}` returns the new `SharedReportData`
  (`totals`, `donutChart`, `groupTotals`, `groupOne`, `filters`) instead of
  `SharedReport`. The two shapes share no top-level key: `SharedReport` is the
  list/create item, and the saved configuration comes back under `filters`.

- Restored query parameters that the corrected spec had dropped even though
  the API honours them: `strict-name-search` and `excluded-ids` on
  `listTags` (whose `sort-column` also widens to `ID | NAME`),
  `archive-projects` and `mark-tasks-as-done` on `updateClient`,
  `sharedReportsFilter` on the shared-report list, the six camelCase range
  and paging parameters on the bare shared-report GET, and `types` on
  `listApprovalRequests`.

- `CreateTimeOffRequest.note` is optional and the policy status enum drops
  `ALL` (it deserializes but the handler answers 400 "Invalid status");
  `TimeEntriesTimeEntry` carries `kioskId`.

### Fixed

- `name_reserved_after_delete`'s meaning and recovery were wrong. A name is
  held for as long as the entity exists — including while it is archived, which
  the default list call hides — and deleting releases it immediately
  (live-probed 2026-08-07 on clients and tags). The old text described a
  post-delete reservation window and told callers to wait for it, which never
  expires because it does not exist. The code keeps its identifier for
  compatibility; it is a misnomer and now says so.

- Two mutants in `ensure.ts`'s single-flight key and cleanup guard are marked
  equivalent rather than left as an apparent coverage gap. `includeArchived
  !== true` partitions the same three inputs into the same two classes and only
  swaps their labels, which nothing reads; and no caller can replace a live
  flight entry, so the cleanup guard cannot observably differ from `true`. The
  guard stays — it protects a future caller that clears the map.

### Removed

- `CLOCKIFY_AMOUNT_UNITS.expense`, deprecated since the expense money contract
  was split. Use `expenseAmount` for create/update writes (major units) and
  `expenseTotal` for reads (minor units) — those names say which side of the
  wire they describe, which is the whole reason the alias was deprecated.

- Raised three subpath size ceilings — `webhooks` to 2.45 kB, `webhook-events`
  to 1.4 kB, `ensure` to 2.35 kB. Comments ship in `dist`, and these files are
  largely comment, so documentation moves this gate: the webhook payload-shape
  deferral and the two equivalent-mutant notes above each pushed a file past a
  ceiling only `make perfect-full` measures. The ceilings guard runtime growth;
  this growth is documentation that genuinely ships.

### Fixed

- `ensureTag`/`ensureProject`/`ensureClient`'s single-flight coalesced by
  `scopeKey` alone. Two concurrent calls passing the SAME `scopeKey` with
  DIFFERENT names shared one in-flight operation, so the second caller
  silently received the first caller's entity instead of its own
  (`Promise.all([ensureTag({name:"Alpha",scopeKey:"k"}), ensureTag({name:
  "Beta",scopeKey:"k"})])` resolved both to `Alpha`). `Workspace`'s own
  scoped `ensureTag`/`ensureProject`/`ensureClient` already namespaced their
  internal `scopeKey` by noun+name and were unaffected; only the public API,
  where the caller supplies `scopeKey` directly, could hit this. The flight
  key now also includes the noun, the case-folded name, and
  `includeArchived`, mirroring `Workspace`'s existing `flightKey` semantics
  (so `"Acme"`/`" acme "`/`"ACME"` still coalesce as one flight; different
  names never do). The `includeArchived` flag joins as a raw boolean
  (`Array.join` coerces `true`/`false` to string) rather than through a
  `"1"`/`"0"` ternary -- fewer branches, so fewer mutation-testing
  equivalent-mutant dead ends on a purely internal map key.

- `Workspace` (the scoped client from `client.workspace(id)`) exposes
  `balanceAssignment`, matching the 30 resource getters on
  `ClockifyApiClient`. The getter was missing since the resource shipped on
  the generated client -- `ws.balanceAssignment` threw `TypeError: Cannot
  read properties of undefined` while `client.balanceAssignment` worked, and
  the 29-vs-30 count was invisible because the test that guards this
  asserted a hand-maintained 29-name list rather than checking the two
  getter sets match. The guarding test now asserts set equality against
  `ClockifyApiClient`'s own getters instead, so a future resource addition
  or removal fails it without another hand-edit.

- `errorCodeForMessage` (`error-codes.ts`, generated identically into the CLI
  and MCP packages by `scripts/generate-error-docs.mjs`) now matches a
  status-less upstream/gateway failure as the retryable
  `clockify_upstream_error` before the generic "invalid" validation token —
  a message that merely quotes a downstream failure (e.g. "upstream gateway
  error: invalid gateway") previously classified as non-retryable
  `invalid_request`. Reachable only when a caller-supplied error carries no
  HTTP status (the SDK's own `classifyClockifyError`/`errorCodeForStatus`
  already handle the status-bearing case).

### Changed

- Documented the unverified `constructEvent` default payload shape
  (`ClockifyWebhookEvent`, ported from an unrelated reference SDK's
  webhook typing) against the disagreeing, also-unverified envelope
  shape the fixture tests use instead (`{webhookEvent, payloadType,
  payload}`). No live probe has confirmed either. Added a JSDoc note
  on `constructEvent` and `ClockifyWebhookEvent` pointing to the new
  `spec/evidence/discrepancies.md` entry
  ("webhook.payload-shape.flat-vs-envelope"); the type-change decision
  itself is deferred to 2.0 pending a live probe, not resolved here.

- Corrected the `dual-build.test.ts` comment: it claimed both dual-build
  checks "compare against the same 17-name baseline". The vitest list has
  18 names and is a quick smoke; the shell script
  (`verify-dual-build.sh`) checks the separate, authoritative 93-name
  curated root surface. No test logic changed.

- Two tests now assert the diagnosis, not just the verdict. The
  `expenseAmountToWire` range tests checked the message's calling-context
  prefix but not its rule text, and the subdomain-label differential checked
  only `allowed`, leaving `category` and `reason` free to be emptied with no
  test noticing. Mutation run 31060903798 caught both.

  Adding that differential also raised real coverage on
  `internal/authenticated-boundary-fetch.ts` (total score 86.44 -> 88.98) while
  *lowering* its covered score (91.07 -> 89.74) below the pinned floor: newly
  covered but unkilled mutants enter the covered denominator. The floor is
  unchanged; the newly exposed mutants are killed instead.

  One mechanism is now pinned explicitly: `xn--acme` is rejected as an
  `unparseable` URL, because the parser refuses the invalid punycode before
  either validator runs -- not by the subdomain rule that also bans `xn--`.
  Same verdict, different mechanism.

## [1.0.1](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v1.0.0...wrapper-v1.0.1) - 2026-08-06

### Fixed

- `expenseAmountToWire` enforces the module's precision envelope instead of
  passing every input through. An amount past `Number.MAX_SAFE_INTEGER`
  (a summed total, for example) used to serialize to a silently rounded wire
  value while every other money helper threw. It now throws `RangeError`.
  The guard is the major-unit rule -- finite and inside the envelope -- not
  `assertSafeMinorUnits`: a major amount is legitimately fractional, so
  `19.99` and negatives stay valid. The guard costs 38 B brotlied, so the
  `money` subpath's size ceiling moves 1.85 -> 1.95 kB. Sharing the two
  guards' error text was measured as an alternative and costs more (+66 B)
  than the direct form, so each keeps its own message.

### Changed

- `webhook-url.ts` drops three branches that no input can reach: the
  `|| "no"` scheme fallback, the `host.length === 0` pre-guard in
  `classifyHost`, and the dotted-tail arm of `classifyIpv6`. A parsed URL
  always carries a non-empty scheme, the post-normalize guard already
  catches every empty host with the same reason, and the WHATWG parser
  serializes every accepted IPv6 literal as lowercase hex groups. No
  address changes its accept/reject decision or its reason string. The
  malformed-literal guard is kept: it is unreachable too, but removing it
  would let a wrong parser assumption throw out of `validateWebhookUrl`
  instead of returning a reason. Mutation run 31052073704 measures the guard
  at 97.11 (floor 94) after the new range batteries, and `composed-fetch.ts`
  at 95.39 (floor 95).

## [1.0.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.15.1...wrapper-v1.0.0) - 2026-08-05

First stable release. The public surface is frozen under semantic
versioning: 99 symbols across 28 subpaths, every one classified `stable`
in `docs/one-point-zero-classification.json`. No symbol, subpath, export
or type changed in this release -- 1.0.0 states that the 0.15.1 surface is
the one being committed to.

### Changed

- All 28 subpaths are kept, including the 13 that export exactly one
  symbol. Each already has a real importer, and `wrapper/.size-limit.json`
  enforces a per-subpath ceiling; merging the observability trio alone
  would grow a `health`-only import from 1.2 kB to 13.4 kB, which a CJS
  consumer cannot tree-shake away. The reasoning is recorded under `notes`
  in the classification file.

- Strict TypeScript is complete. `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals` and `noUnusedParameters`
  are on, and ESLint runs `strictTypeChecked`. The fixes retype boundaries
  rather than delete guards: `internal/host-env.ts` is new and states that
  `process` may be a shim without `env` or `versions`, the routing
  validator reads caller flags through an untrusted view so `!== true`
  still rejects a plain-JS `1` or `"yes"`, and `bulk.ts` holds its
  fail-fast state as one boxed error instead of a flag and a value that
  had to agree. `noPropertyAccessFromIndexSignature` is deliberately not
  adopted; it reported 1892 sites and added no safety over the already
  enabled `noUncheckedIndexedAccess`.

- The SDK generator no longer emits an unused `ClockifyApi` import into
  generated request and type files. Types are unchanged; 132 request files
  and every plain type file simply lose a dead import.

- The public 1.0 surface is now classified. All 99 public symbols and all 28
  subpaths carry a maintainer decision in
  `docs/one-point-zero-classification.json`; every one is `stable`, each with
  the evidence that supports it. No symbol, subpath, export or type changed --
  this records intent, it does not move the surface.

- The public 1.0 surface is now classified. All 99 public symbols and all 28
  subpaths carry a maintainer decision in
  `docs/one-point-zero-classification.json`; every one is `stable`, each with
  the evidence that supports it. No symbol, subpath, export or type changed —
  this records intent, it does not move the surface.

- Build with TypeScript 7. Two config options it removed are replaced:
  `baseUrl` is dropped from `wrapper/tsconfig.json` (the `paths` entries are
  already relative, so resolution is unchanged), and the CommonJS build moves
  from `moduleResolution: Node` to `bundler`. The emitted `dist/` is
  byte-identical and the pack snapshot still matches its 2860-entry baseline,
  so consumers see no change.

## [0.15.1](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.15.0...wrapper-v0.15.1) - 2026-08-05

### Added

- New `balanceAssignment` resource client:
  `createBalanceAssignment`, `getBalanceAssignmentsForUserAndPolicy`,
  `updateBalanceAssignment`, `deleteBalanceAssignment`. These manage a
  user's time-off balance for one policy.
- `approvals.submitWithType` and `approvals.submitForUserWithType`: submit
  an approval request with an explicit type (`TIMESHEET` or `EXPENSE`).
- `timeEntries.getMultipleTimeEntries`: look up several time entries by ID
  in one call.

### Fixed

- `toMinor`, `toMajor`, `invoiceItemUnitPriceToWire`, and
  `invoiceItemUnitPriceFromWire` now throw `RangeError` when a value falls
  outside the exact-integer envelope (`Number.isSafeInteger`, ±2^53−1)
  instead of silently returning an amount that already lost precision.
- `ApprovalRequestDtoV1` now includes the `type` field that the live API
  returns. The field was missing from the response type on six existing
  operations (`list`, `submit`, `submitForUser`, `resubmit`,
  `resubmitForUser`, `updateStatus`), not only the two new ones above.
- Both retry layers now recognize cross-realm and fetch-polyfill abort errors
  structurally (`name === "AbortError"`). GET and explicitly retryable
  PUT/DELETE requests stop after one dispatch instead of waiting and replaying.
- Webhook callback validation now rejects every IANA non-global literal range,
  including IPv4 documentation/benchmarking space and IPv6 translation or
  special-purpose prefixes. Only ordinary global-unicast IP literals pass;
  hostname DNS rebinding remains the separately documented offline limitation.
- Split the asymmetric expense money contract into explicit `expenseAmount`
  (major-unit writes) and `expenseTotal` (minor-unit reads) keys while retaining
  the original read-side `expense` minor-unit key as a deprecated compatibility
  alias.
- Enforced the documented retry-safety boundary in `composedFetch`: a custom
  `retryableMethods` list containing `POST` or `PATCH` now fails fast instead
  of silently enabling ambiguous mutation retries. Explicit `PUT`/`DELETE`
  opt-in remains supported.
- `createClockifyClient` no longer exposes the generated runtime's raw
  `serviceBaseUrls` or `auth` escape hatches. Runtime rejection closes the
  plain-JavaScript path that could replace the factory's credentials or bypass
  validated routing and regional acknowledgement; advanced auth remains on the
  direct `ClockifyApiClient` constructor.
- `ClockifyApiClient.fetch()` now inherits client-level
  `retryMutationMethods` and applies per-request add-on tokens when configured
  authentication is disabled. Configured Clockify authentication
  remains authoritative, and both typed and raw requests reject final merged
  headers containing both `X-Api-Key` and `X-Addon-Token`.
- Corrected live wire-shape coverage for scheduling empty-body 200 responses,
  nullable weekly totals, typed audit authors, entity-change document enums,
  and shared-report filter names. Binary responses now expose text/JSON readers.
- `withResponse()` and `getRequestIdFromError()` retain the injected request ID
  when echoed and fall back to Clockify's server correlation header otherwise;
  the error helper is also available from the `errors` subpath. Expense read
  totals are documented as minor units while expense write amounts remain major.

## [0.15.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.14.0...wrapper-v0.15.0) - 2026-08-01

### Fixed

- `runComposition` no longer reports a clean workspace when a step returned
  `created` refs without an `undo` compensator. Those creates were silently
  dropped from the rollback list, so a later required failure produced empty
  `rollbackWarnings` and `leftBehindNote` said "Nothing partial was left
  behind." while the entities still existed. They are now surfaced as a
  `no_undo` rollback warning naming each orphan. Compositions whose creating
  steps all supply `undo` (every in-repo caller) are unchanged.
- `resolveInstant` accepts the RFC 3339 §5.6 space datetime separator
  (`2026-06-01 10:30:00`), normalizing it to `T` before the datetime gate.
  Previously a space-separated value missed that gate and fell through to the
  relative-day parser, which sliced off the first 10 characters and returned the
  DAY edge — silently discarding the time of day and, on the `end` edge,
  widening an explicit `10:30` upper bound by ~13.5 hours. Reachable from
  `clk115 reports summary/detailed --from/--to` and the public SDK export. A
  space NOT followed by a digit (`2026-06-01 to 2026-06-05`) still takes the
  day-edge path, so range-ish strings are unaffected. **Behavior change:** the
  nonsense input `"2026-06-01 1"` now returns `undefined` (this module's
  documented "unparseable — clarify, never send" outcome) where it previously
  returned a day edge.
- `composedFetch` preserves a non-Error rejection as the wrapping `Error`'s
  `cause`. A custom `fetch` rejecting with a structured value (e.g.
  `{ code: "ECONNRESET" }`) surfaced as the raw object with no `retryPolicy` but
  as `Error("[object Object]")` with one, discarding the diagnostic payload on
  the retry path only.
- `composedFetch` cancels a blocked redirect's response body before throwing
  `RedirectNotAllowedError`. That 3xx `Response` is the only one the module
  neither returns to the caller nor cancels — nothing downstream can drain it
  (the error carries no `Response`, and the `onError` context has no `response`
  field), so its stream and socket stayed checked out until GC.
- `createClockifyClient` now rejects an explicitly-passed BLANK credential
  (`{ apiKey: "" }`, `{ addonToken: "   " }`) with the same
  "must provide exactly one of `apiKey` or `addonToken`" `TypeError` the env
  path has always thrown for `CLOCKIFY_API_KEY=""`. Previously such a client
  constructed happily and then 401'd ("Multiple or none auth tokens present")
  on its first call. A whitespace-only env value is rejected too. `Supplier`
  forms (a function or promise) are unaffected — only literal strings are
  inspected. **Behavior change:** `{ apiKey: "" }` with `CLOCKIFY_ADDON_TOKEN`
  set in the environment now throws instead of constructing a client that 401s.
  Ergonomic note: four hand-written examples (`examples/auth.ts`,
  `handle-rate-limit.ts`, `retry-custom.ts`, `middleware-datadog.ts`) fall back
  with `process.env.CLOCKIFY_API_KEY ?? "demo-key"`, and `??` does not fire on
  `""` — so running one under this repo's own `CLOCKIFY_API_KEY=''` convention
  now raises the new `TypeError` instead of building a demo client. No gate
  executes the examples; switch those four to `||` if that bites.
- `resolveInstant` accepts the RFC 3339 lowercase `t` datetime separator
  (`2026-06-09t10:30:00Z`), matching the lowercase `z` zone it already
  accepted. Previously such an input missed the datetime branch and fell
  through to the relative-day parser, which SILENTLY dropped the time of day to
  a day edge (`…T00:00:00.000Z` / `…T23:59:59.999Z`). Reached
  `clk115 reports --from/--to`. **Behavior change:** a lowercase-`t` datetime
  with an invalid time now returns `undefined` (clarify) instead of a silent
  midnight, matching the uppercase-`T` twin.
- `resolveUserRef` no longer resolves a wrong or stale 24-hex user id to a
  DIFFERENT user. When BOTH `id` and `name` were supplied and the id was not in
  the workspace list, control fell straight through to the name fallback and
  returned `ok:true` for whoever matched the name — on `trustIds:false`, i.e.
  exactly the permission-affecting write paths. It now clarifies, mirroring the
  guard `resolveEntityRef` has always carried. **Public-API behavior change**,
  though no in-repo call site is affected: all of them pass `{ id }` only.
- `invoiceUpdateBodyFromExisting` no longer lets an explicitly-`undefined` patch
  key erase a carried-forward field. `PUT /invoices/{id}` replaces the whole
  document, so `{ note: undefined }` from a JS caller (or a TS caller compiling
  without `exactOptionalPropertyTypes`) blanked `note` on the wire — the precise
  data loss this module exists to prevent. **Behavior change:**
  `invoiceUpdateBodyFromExisting(existing, { currency: undefined })` previously
  threw `currency is required`; it now carries the existing value forward.
- `mapBounded` with `continueOnError: false` preserves a non-`Error` rejection
  reason as the thrown error's `cause`. The collect path already passed the raw
  reason through verbatim, so the same rejection was recoverable in one mode and
  destroyed in the other. The thrown type and the `"Bulk operation rejected"`
  message are unchanged.

### Internal

- `ipv6Reason`'s five embedded-IPv4 branches (mapped, translated, NAT64, 6to4,
  IPv4-compatible) now share one `embeddedIpv4Reason(hi, lo, label)` helper
  instead of five byte-identical copies of the same bit-decoding. Verified
  behavior-identical over a 6,745-URL differential; every guard condition and
  every reason string is unchanged. Also dropped a provably dead trailing-dot
  strip in `classifyHostname` — `classifyHost` already collapses all trailing
  dots before calling it — and corrected the neighbouring comment that still
  pointed at it.
- `isRateLimitError`'s JSDoc, the wrapper README rate-limit snippet, and
  `examples/typed-errors.ts` now say that the guard classifies by STATUS: a live
  429 arrives as a base `ClockifyApiError`, so `retryAfterMs` /
  `rateLimitResetAt` are `undefined` until `promoteApiError`. Both call sites
  switched to `getRateLimitFromError(err)?.resetAt`, which reads the real
  server window instead of sleeping a flat 1000 ms. Predicate unchanged.
- `RetryContext.cause`'s JSDoc records that the response body stream is released
  before `onRetry` runs, so `cause.response` is no longer readable there — read
  bodies in `afterResponse`. Docs only.
- `entityId`, the negative RFC3339 UTC offset, and the leap-year day count in
  `expense-list.ts`'s private date parser gained behavioral tests; all three
  were shipped, governed, and completely unexercised. `client.health()`'s
  `latencyMs` is now pinned to an exact measured duration instead of
  `toBeGreaterThanOrEqual(0)`, which a hardcoded `0` satisfied.
- The wrapper README's Type safety row names all four enforced strictness flags
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`) instead of two, and no longer presents them as CLI flags
  the `type-check` script does not pass.
- `retryAfterMs` (the `clockify-sdk-ts-115/rate-limit` subpath) and
  `detailedFilter`'s `auditFilter` / `options` pass-through now have behavioral
  tests. Both were public, shipped, and completely unexercised: deleting
  `retryAfterMs`'s clamp (returning a negative delay straight into a caller's
  `setTimeout`) or either `detailedFilter` assignment left the suite green.
- Dropped a redundant `Number.isFinite` operand from the `mapBounded`
  `concurrency` and `PaginatedList#toArray` `limit` guards — `Number.isInteger`
  already rejects `NaN` and both infinities, so it could never be the deciding
  term. Same inputs rejected, same messages.
- `resolveUserRef` computes its trimmed lookup value once instead of under two
  names in adjacent blocks. Emitted strings are byte-identical.
- `CompositionStatus`'s `failed` arm now carries the raw thrown `error` from the
  failing step alongside `message`, so a caller (the MCP `create_work_package`
  workflow) can rethrow the original error with its class and status instead of
  rebuilding a bare `Error` that erases them.
- `resolveEntityRef`'s `notFoundHint` and `resolveProjectTaskRefs`'s
  `projectNotFoundHint` — both public options of the `resolve` subpath — now
  have behavioral tests. Neither populated arm was reachable from the suite.
- Dropped a redundant `Number.isFinite` operand from `composedFetch`'s
  `maxRetries` guard (`Number.isInteger` already rejects `NaN` and both
  infinities), matching the same cleanup already applied to `mapBounded` and
  `PaginatedList#toArray`. Same inputs rejected, same message.
- Collapsed a single-statement nested `if (!user) { if (query) { … } }` in
  `resolveUserRef` to `if (!user && query)`, matching the flat early-return
  shape of the sibling `resolveEntityRef`. Behavior-identical.
- Documented that `BulkResult.ok` is in COMPLETION order, not input order — the
  bounded-concurrency runner lets a later item finish first, so `ok[i]` does not
  correspond to `items[i]`. Doc-only; `BulkFailure.index` already carried the
  pairing on the failure side.

- `parseDay` / `resolveInstant` no longer accept a calendar day that does not
  exist. `Date.parse` NaNs an impossible month (`2026-13-99`) but silently
  ROLLS a bad day forward (`2026-02-30` became Mar 2), so a caller's date
  shifted without warning; `isRealDay` now round-trips the parse and requires
  the same literal back. `resolveInstant` validates only the literal date part,
  never the re-derived instant, so an explicit offset may still legitimately
  move the UTC day.
- `iterPages` (and therefore `paginate`) rejects non-integer `pageSize`,
  `maxPages`, and `startPage` instead of silently producing fractional page
  numbers. `maxPages` keeps accepting `Number.POSITIVE_INFINITY`, which is the
  documented "unbounded" default.

### Changed

- Removed three branches the mutation campaign proved unreachable: the
  `user === false` arm of `mergeRetryPolicy` (the sole call site
  truthiness-guards it) and the null-signal arms of `abortable` / `sleep`
  (every call site passes a real `AbortSignal`). Signatures narrow accordingly;
  no runtime behavior changes.
- Documented that `maxDelayMs` caps the exponential backoff BEFORE jitter, so a
  realised delay may exceed the cap by up to `jitter/2` (+10% at the default),
  while `Retry-After` / `X-RateLimit-Reset` are capped after jitter.

- `mapBounded` with `continueOnError: false` no longer swallows a rejection
  whose reason is nullish (`throw undefined`): the failure flag is now
  tracked separately from the recorded reason, so the call rejects with the
  `"Bulk operation rejected"` fallback instead of resolving with a
  success-looking partial result.
- `resolveRelativeDay` now honors its "unresolvable returns `undefined`"
  contract for non-finite or out-of-range `dayOffset` values: `NaN`,
  `±Infinity`, and offsets landing outside `0000-01-01..9999-12-31` return
  `undefined` instead of throwing `RangeError` from `toISOString()` (or
  returning a malformed `+012019-…` extended-year string).
- `validateRoutingOptions` now rejects an unknown `routing.services` key on a
  `custom` profile with a `TypeError` (e.g. the plain-JS typo `report` for
  `reports`), instead of validating the URL and then silently ignoring the
  override.
- `validateRoutingOptions` now also rejects a `custom` profile with a missing,
  `null`, or non-object `routing.services`, with a named `TypeError` instead of
  the opaque `Cannot read properties of undefined (reading 'regular')` a
  plain-JS caller got from deep inside `buildServiceBaseUrlOverrides`. Selecting
  `custom` grants the non-Clockify-HTTPS-host opt-in, so a services-less custom
  profile is rejected rather than tolerated.
- `composedFetch` no longer fails a retryable request when an `afterResponse`
  hook consumed the response body (`await ctx.response.json()`): the
  pre-backoff `body.cancel()` is best-effort, so the locked-stream
  `TypeError` no longer escapes and the retry proceeds. Restores the
  documented "a hook never blocks the request" contract.
- `composedFetch` now fires `onError` (and the error metrics) when a request
  is aborted *while* an async `beforeRequest` hook is awaited on the retry
  path, matching the single-shot path. Previously the retry path rejected
  without ever calling `onError`, leaking any span/timer opened in
  `beforeRequest`. The rejection value and the zero-dispatch guarantee are
  unchanged.
- `createClockifyClient({ debug: true })` no longer discards the user's
  `onMetric` hook. `debug` wraps four lifecycle hooks and previously replaced
  the whole hook set, silently disabling all metrics; the user's hooks are
  now spread as the base, so any hook `debug` does not wrap still fires.
- `Workspace.ensureTag` / `ensureProject` / `ensureClient` now pass a
  single-flight `scopeKey`, so concurrent calls for the same name on the same
  workspace share one list+create instead of racing into duplicate entities.
  The key is namespaced by client identity, so two clients with different
  credentials or hosts never coalesce.

### Changed

- Corrected the retry-jitter documentation: `composedFetch`'s own retry layer
  spreads symmetrically at ±10% (±jitter/2) at the default `jitter: 0.2`, and
  only its `X-RateLimit-Reset` path applies up to +20%. The generated client's
  layer — the one that runs when no `retryPolicy` is passed — uses factor 0.4,
  i.e. ±20%, so the README's Retries paragraph states ±20% again. Doc-only
  (`composed-fetch.ts` JSDoc, `wrapper/README.md`) — no behavior change.
- Documented the `RequestContext.headers` split: without a `retryPolicy` the
  hook sees the live request headers (mutations reach the wire); with a
  `retryPolicy` the headers are snapshotted into the retry template before
  hooks run, so mutations do not reach the dispatched request. Doc-only.
- Removed the redundant second `if (aborted) return;` guard in `mapBounded`'s
  worker (no await separates it from the loop-top guard, so it could never
  differ) and corrected the surrounding comments, which described a
  claim-then-suspend scenario that cannot occur. Behavior-identical.
- Removed the dead `options.startPage` / `options.pageSize` fallback arms in
  `paginate`'s fetcher adapter (iterPages always sets `page`/`page-size`),
  deduplicated the `parseLastPage` normalization in `expense-list.ts`, and
  fixed the stale "pads to equal length" comment on
  `constantTimeStringEqual` in `webhooks.ts`. Behavior-identical cleanups.

- Aligned the `typescript` devDependency range to `^5.7.0`, matching the
  CLI and MCP packages. Tooling-only; no runtime or public-type change.
- Hardened the `webhook-url.ts` test suite against mutation runs
  30420465438 and 30509504520: 27 new tests kill survived and NoCoverage
  mutants across the private-IPv4 range-guard operands (accept-side
  public neighbours of every blocked band), the parseIpv4 structural and
  digit-regex guards, the IPv6 unspecified/loopback discrimination
  branches (verbatim reason strings), the NAT64 / IPv4-mapped /
  IPv4-translated prefix conjunctions, the scheme and invalid-URL reason
  formatting, the truncate() 119/120/121 boundary, the dot-only
  empty-host guard, the full-form (no `::`) IPv6 parse arm, and the
  leading-dot `.localhost` suffix-anchor fail-open. 35 equivalent
  mutants are recorded in the test file's campaign ledger, mirroring the
  `errors.ts` and `composed-fetch.ts` treatment. Test-only; no runtime
  change.
- Hardened the `composed-fetch.ts` test suite against mutation runs
  30420465438 and 30509504520: 38 new tests kill survived and NoCoverage
  mutants across the abort/AbortError classification guards, the
  exhaustion fallbacks (no-response-no-error, last-response identity,
  last-error identity), the Retry-After seconds/HTTP-date and
  X-RateLimit-Reset delay math under pinned fake clocks, attempt
  durationMs arithmetic, retry-path hook receipt payloads and 1-indexed
  `retry.count` metric attributes, applyJitter's non-positive-jitter
  guard, the pre-aborted-signal entry guard, and safeHook's
  absent-hook/warning-prefix behavior. 20 equivalent or dead-branch
  mutants are recorded in the test file's campaign ledger, mirroring the
  `errors.ts` treatment. Test-only; no runtime change.
- Hardened the `errors.ts` test suite against mutation run 30420465438's 68
  survivors: classification branch guards (wrong-status fixtures for the
  addon-restriction/retry-after/active-delete/not-found branches), `errorText`
  body-arm observability (the generated ctor embeds the body into
  `err.message`, so tests now override the message to exercise the documented
  generic-message case), rate-limit header-parser boundaries, and
  `getErrorCode` nested-envelope edges. 26 equivalent mutants are recorded in
  the test file's campaign ledger — including the 7 `Error.captureStackTrace`
  guard->false mutants, reclassified after measuring that V8 already omits
  Error-subclass constructor frames from `.stack`. Test-only; no runtime
  change.

## [0.14.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.13.0...wrapper-v0.14.0) - 2026-07-29

### Added

- **The workspace-expenses list now types the data it actually returns.**
  `getWorkspaceExpenses` resolves through `WorkspaceExpensesDtoV1` ->
  `ExpensesWithCountDtoV1` -> `ExpenseHydratedDtoV1`, and that last schema had
  been reduced upstream to a bare `allOf: [ExpenseDtoV1]`. It therefore dropped
  **16 live field paths** and simultaneously declared three ids the list wire
  never sends.

  `ExpenseHydratedDtoV1` now declares the 14 fields the wire actually returns:
  `category` (`ExpenseCategoryDto` — `archived`, `hasUnitPrice`, `id`, `name`,
  `priceInCents`, `unit`, `workspaceId`), `project` (`ProjectInfoDto` —
  `clientId`, `clientName`, `color`, `id`, `name`), `task` (`TaskInfoDto`),
  `fileName`, plus `billable`, `date`, `fileId`, `id`, `locked`, `notes`,
  `quantity`, `total`, `userId`, `workspaceId`.

  **Practical effect:** listing expenses no longer requires a follow-up
  `getExpenseCategories` or `getProjectById` call to recover data that was
  already in the first payload.

  **`ExpenseDtoV1` is unchanged and still correct** for `getExpenseById`,
  `createExpense`, and `updateExpense` — those return the flat
  `categoryId`/`projectId`/`taskId` and no expanded objects. The two shapes are
  genuinely different; one schema could not mirror both.

  Evidence: union of keys across all 2845 expense rows on the sandbox
  workspace. Two caveats worth knowing: `task` was `null` on every row, so its
  `TaskInfoDto` shape comes from the upstream source rather than the wire and
  is the one part not live-proven; and `category`, `project`, `task`, `fileId`,
  `fileName` and `notes` all go null on the wire but are not declared
  `nullable` (this spec never combines `nullable` with `$ref`) — treat all six
  as possibly null.

- `BalanceDtoV1.negativeBalanceUsed` (`number`). The time-off balance wire
  reports it on every row — live-verified 50/50 — and the schema omitted it, so
  callers could not tell whether a negative balance had been drawn down.

### Removed

- **Six generated operations were removed** after a live existence sweep proved
  their routes are not served (404 / `No static resource` / Clockify code 3000).
  The generated surface goes 169 -> 163 operations (149 explicit + 14
  operationId-derived). Removed: `projects.archive`-shaped
  `PUT /workspaces/{workspaceId}/projects/{projectId}/archive`, the matching
  clients `PUT …/clients/{clientId}/archive`, the whole by-id time-off branch
  (`GET`/`DELETE` `…/time-off/requests/{requestId}` and
  `PATCH …/time-off/requests/{requestId}/status`), and
  `PATCH …/webhooks/{webhookId}/generateNewToken`.

  **These were never callable** — every one returned 404 — so no working code
  can break. If you referenced one, the live replacements are: archive via the
  update body envelope (`projects.update` / `clients.update` with
  `archived: true`, which the `ensure` helpers already do); time-off status via
  the policy-scoped `PATCH …/time-off/policies/{policyId}/requests/{requestId}`;
  and webhook token rotation via `PATCH …/webhooks/{webhookId}/token`.

### Changed

- Mutation testing now governs the two internal modules that select which host
  an authenticated request is dispatched to: `internal/routing.ts` (measured
  floor 88) and `internal/subdomain-label.ts` (80). They join their sibling
  `internal/authenticated-boundary-fetch.ts` (87), so all three host-selection
  modules are covered. Verification-only -- no published runtime or type
  surface change.

  Two real gaps surfaced and are now closed by tests: only `eu`, `us`,
  `developer` and `global` were exercised through `validateRoutingOptions`, so
  five of the six `knownRegions` entries could be blanked undetected (a silent
  narrowing of the region allowlist, with `uk` and `au` untested outright); and
  `subdomain-label.ts` had no direct test suite at all. `subdomain-label.ts`
  now sits at its achievable ceiling -- 8 of its 40 mutants are equivalent,
  guarding conditions that `SUBDOMAIN_LABEL_RE` already enforces on its own.

- Dev-dependency refresh: `eslint` `^10.5.0` -> `^10.8.0`, `typescript-eslint`
  `^8.64.0` -> `^8.65.0`, and `tsx` `^4.19.2`/`^4.22.3` -> `^4.23.1`. Build-time
  only; no published runtime or type surface change. All three packages now
  declare one `tsx` range, and `tsx` is additionally declared at the workspace
  root -- root-level gates run `node --import tsx` with the repo root as cwd,
  so they need it resolvable there rather than relying on npm hoisting a
  workspace copy.

### Fixed

- Comment only: `internal/routing.ts` still claimed "It does not wire request
  dispatch -- that is a later packet's job", which `29e1b45` made false.
  `createClockifyClient` applies the resolved map through `serviceBaseUrls`, so
  the header now states the shipped dispatch precedence
  (`suppliedBaseUrl > suppliedEnvironment > serviceBaseUrl > operationBaseUrl`).
  No behavior change.

### Removed

- `scripts/deno-smoke.ts`. Nothing ran it -- no Make target, no CI job, no npm
  script -- and the only thing referencing it was a `tsconfig.json` `exclude`
  entry keeping it out of the type-check. Removed along with that entry.

### Fixed

- Documentation only: the `README.md` quality table claimed CI jobs that do not
  exist. `ci.yml` has exactly two jobs (`packages`, `contracts`); there is no
  `lint` job, no `size` job, no `build-and-test` step, and no `bun-smoke` or
  `deno-smoke`. Bundle ceilings run under `make perfect-full`, not CI. The
  runtime-support table no longer claims Bun/Deno are exercised in CI.
- Documentation only: `README.md` advertised `Current release: 0.12.2`, two
  releases behind the published package. A new derived `versionProse` gate
  (`docs/version-policy.json` + `scripts/lib/version-prose.mjs`) now recomputes
  every documented version and peer range from the package manifests and fails
  on any stale occurrence, so this cannot recur silently. No runtime or type
  surface change.

## [0.13.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.12.3...wrapper-v0.13.0) - 2026-07-27

### Changed

- **Retries are read-only by default in both retry layers** (RETRY-001): a
  network failure or retryable 5xx after `PUT`/`DELETE` is ambiguous (the
  server may have already applied the mutation), so both the generated
  request runtime and `composedFetch`'s `DEFAULT_RETRY_POLICY` now only
  auto-retry `GET`/`HEAD`/`OPTIONS`. `POST`/`PATCH` were never retried by
  either layer and remain so. Opt `PUT`/`DELETE` back in to the same
  replay/backoff behavior via the new `retryMutationMethods: true` option
  (client-level or per-request, typed methods) or, for `composedFetch`'s
  own retry layer (only active when you pass `retryPolicy`), by adding
  `"PUT"`/`"DELETE"` to `retryPolicy.retryableMethods`. This is a behavior
  change for any caller relying on the prior implicit `PUT`/`DELETE`
  retry; see the README "Retries" section.

### Added

- Typed multi-service routing (`routing` option on `createClockifyClient`,
  `ClockifyRegion`/`ClockifyService`/`ClockifyRoutingOptions` types):
  select an approved region, workspace subdomain, or per-service custom
  host, resolved and validated synchronously at construction time and
  applied at request dispatch. Mutually exclusive with the legacy
  `environment`/`baseUrl` override. Only the `global` profile is
  live-confirmed; every other profile requires an explicit
  `acknowledgeUnconfirmedRegion: true`.
- The authenticated-dispatch host allowlist now also trusts the four
  approved regional hosts (`euc1`/`use2`/`euw2`/`apse2.clockify.me`) and any
  well-formed single-label workspace-subdomain host
  (`<subdomain>.clockify.me`), without needing the `allowNonClockifyHttpsHost`
  escape hatch.

### Removed

- `pto.api.clockify.me` is no longer an allowlisted host: H02-ROUTING
  confirmed it dead (zero backing operations, zero official-doc mentions).

## [0.12.3](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.12.2...wrapper-v0.12.3) - 2026-07-24

### Changed

- Dev-dependency refresh: `typedoc` `0.28.19` -> `^0.28.20` and `prettier`
  `3.8.3` -> `^3.9.5`. Build-time only; no published runtime or type surface
  changes.

## [0.12.2](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.12.1...wrapper-v0.12.2) - 2026-07-23

### Changed

- Documented the retry replay preflight in `composedFetch`: an eager
  `Request.clone()` still fails closed before hooks/dispatch when a retryable
  body cannot be replayed (behavior unchanged; contract-edge tests pin it).

### Added

- Authentication mutation coverage: the Stryker scope now mutates
  `wrapper/create-client.ts` (auth-mode selection, header wiring, base-URL
  validation entry) and `wrapper/internal/authenticated-boundary-fetch.ts`
  (host allowlist + authenticated fetch boundary) alongside the existing
  hand-written modules; scores are proven through the GitHub-only Mutation
  workflow.

- Exact-artifact release proof: `prepublishOnly` now ends with the shared
  pack-consumer-smoke engine in `--package=wrapper` mode, which packs the
  tarball, prints its name and sha512 integrity digest, and proves a
  temporary consumer can install it and import the ESM and CJS entry points
  before any publish.
- Authenticated-host equality proof: the hand-written allowlist
  (`CLOCKIFY_PROD_HOSTS`, now exported from the package-private
  authenticated-boundary module), the generated request-time allowlist, the
  emitter template, the emitted per-operation `baseUrl` hosts, and the
  config-precedence policy host list are pinned equal by
  `wrapper/tests/authenticated-host-equality.test.ts`, which fails closed on
  any drift between the authenticated configuration and request paths.

### Breaking

- Removed `allowInsecureBaseUrl`; use `allowNonClockifyHttpsHost`, whose name
  matches the enforced HTTPS-only behavior.
- Removed `findOrCreateClient`; use `ensureClient` with the same input, result,
  match, ambiguity, and single-flight behavior.
- Removed the blanket-`any` `ArchiveThenDeleteResource` seam. Archive/delete
  helpers now take `ArchiveThenDeleteAdapter<TCurrent>` under `adapter`, with
  typed current state and explicit `getCurrent` → `archive` → `delete` callbacks.
  The compile-checked client migration preserves every editable current field
  in the replacement-body archive request before deletion.

### Changed

- Kept discrepancy-ledger coverage exact by removing the stale compensated-test
  mapping after `consumer.cast-budget` became a resolved finding.
- Extended the existing public-package compile fixture to prove the root-exported
  archive/delete adapter callback inputs remain free of blanket `any` types; the
  zero request-cast contract reuses this proof rather than adding a parallel gate.
- Corrected operation coverage documentation to distinguish all 169 generated
  SDK methods from the exact 155 explicitly named / 14 operationId-derived
  naming split, backed by the local codegen receipt, a reviewed inventory of
  every discrepancy anchor, independent source/schema semantic expectations,
  an exact 169-row operation-evidence audit, and fail-closed dispositions.

### Fixed

- Expense update requests now type `file` as optional, matching the multipart
  wire contract; scalar updates compile without casts and receipt updates keep
  the binary file part.

### Added

- Added `listExpensesFiltered`, a bounded typed expense-envelope walker with
  strict inclusive client-side date filtering, `Last-Page` support, explicit
  warning, and lossless page/offset continuation metadata for the live route
  that ignores `start`/`end`. Requested scans are preflighted against the
  supported page ceiling and publish a continuation-specific `nextMaxPages` so
  every advertised next request remains runnable.
## [0.12.1](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.12.0...wrapper-v0.12.1) - 2026-07-14

### Fixed

- Aligned the root coverage provider with Vitest 4.1.10 so clean-workspace coverage proof
  resolves the matching provider
  ([273ff4a](https://github.com/apet97/clockify-ts-sdk/commit/273ff4a60f08b06cfd3a62f7e121c61024133876)).

### Changed

- Corrected the README's dual-build proof count to the governed 91 root names and 27
  subpaths; no package behavior changed.
- Refreshed compatible test and lint tooling (`@vitest/coverage-v8` and Vitest 4.1.10,
  `eslint-plugin-import-x` 4.17.1, `fast-check` 4.9.0, and `typescript-eslint` 8.64),
  including a root-aligned coverage provider for reproducible clean-workspace proof, without
  changing runtime APIs.

## [0.12.0] - 2026-07-12

### Breaking

- Removed the legacy request-body escape from the package root and `./requests`.
  Use generated operation request types and `ClockifyRequestBody<T>` body envelopes;
  `./requests` continues to export `ClockifyApi`, `ClockifyRequestBody`,
  `AUDIT_LOG_ACTIONS`, and `AuditLogAction`.

### Security

- Raw authenticated fetches reject cross-origin destinations before dispatch, validate dynamic
  base URL suppliers, preserve `Request` properties, enforce auth-header precedence, reject
  redirect following, and replay retryable bodies from fresh preflighted `Request` clones.
- Non-loopback cleartext origins always reject; `allowNonClockifyHttpsHost` replaces the deprecated
  `allowInsecureBaseUrl` alias.
- Replaced a real sandbox workspace identifier in the scoped-client JSDoc example with a neutral
  placeholder so compiled declarations and MCPB artifacts carry no governed workspace identity.

### Changed

- Require Node.js 22.13 or newer.
- Live sandbox proof now performs a prefixed tag create/get/update/delete round trip with
  dependency-safe cleanup through the root four-surface orchestrator.
- Workspace resources expose `ScopedResource<T>`, omitting `workspaceId` from scoped request types.
- Pagination/bulk numeric controls reject non-finite, fractional, and out-of-range values; fail-fast
  bulk work now settles already-started operations before rejecting.
- Ensure helpers accept `scopeKey` for in-process single-flight coordination.
- Audit actions are a canonical runtime constant/type generated from the corrected OpenAPI snapshot.
- Webhook literal-IP validation rejects deprecated IPv6 site-local `fec0::/10` destinations.
- The package remains configured as the unofficial, community-built
  `clockify-sdk-ts-115` package (not affiliated with CAKE.com or Clockify); any future
  publication remains tag-triggered CI on a pushed `wrapper-v*` tag.
- docs: the README headline now distinguishes the 169 total operations from the
  135 live-verified ones (links to `docs/spec-confidence.md`) instead of
  describing all 169 as "live".

### Added

- The shared error registry (`error-codes.ts`) gained the `setup_required` code
  (regenerated copy) for the MCP graceful no-credential startup path; no
  wrapper runtime behavior changed.

### Fixed

- Corrected the supported-runtime and CI documentation to Node.js 22.13 and 24,
  and wired diagnostics, documentation quality, release support, and release
  readiness into both aggregate verification gates.
- Adversarial-review pass (plan 011):
  - `parseRateLimitResetAt` no longer turns `Retry-After: 0` (or a finite negative
    delay) into a year-2000 reset `Date`; it now floors at "now".
  - Plan-gated `402` responses now classify as `feature_unavailable` instead of a
    catch-all `error` (error registry gains `sdk` as a `feature_unavailable` surface).
  - `composedFetch` no longer fires `onRetry`/`retry.count` for cancelled or
    timed-out (`AbortError`) requests — `onError`/error metrics still fire.
  - `iterPages` terminates on an empty page even when `Last-Page: false`, closing an
    unbounded-loop hole (the default `maxPages` is `Infinity`).
  - `PaginatedList.toArray({ limit: 0 })` now returns `[]` with zero fetches.
  - Scoped `ensureTag`/`ensureProject`/`ensureClient` walk every page before
    matching, so they no longer create duplicates of entities past the first page.
  - OTel hooks: the reserved metric name previously used as a span attribute is
    renamed to a namespaced, unit-explicit key, and `http.request.resend_count` is
    emitted only on retried attempts (semconv).
  - Generated SDK types: array-of-union item types now emit as `(A | B)[]` instead
    of the mis-parsed `A | B[]`, and structured union members keep balanced brackets.
- Restored `Client.ccEmails` and `Client.currencyId` to the generated types — both are
  returned by the live API (`GET /clients`) and present in official `ClientDtoV1`, but a
  thin upstream schema had dropped them (first-writer schema-name race in the generator).
- Corrected the `SharedReport` response type to the live wire shape: `isPublic` (was
  `public`), `link` (was `url`), plus `reportAuthor`/`visibleToUsers`/
  `visibleToUserGroups`/`fixedDate`/`workspaceId`/`userId`; dropped the phantom
  `url`/`createdAt`/`updatedAt`/`workspace`. The now-orphaned bare `WorkspaceSettings`
  schema is pruned (`Workspace` still uses `WorkspaceSettingsDtoV1`).
- `Webhook` gained `deliveryEnabled`/`planEnabled` (present on the live wire and in
  official `WebhookDtoV1`).

### Changed

- Internal generator maintenance: split `scripts/generate-sdk-from-openapi.mjs`
  into focused `scripts/sdk-codegen/*` modules with byte-stable output, and
  pointed the retry-delay regression test at the new emitter module.
- Re-snapshotted the corrected OpenAPI to the 2026-06-23 GOCLMCP surface refresh:
  **184 → 169 operations** (17 live-404/405 wrong-path ops removed, 2 missing official
  ops added) and **129 → 135 live-success**. Dropped the dead `.policies` scoped-client
  accessor — the bare `/policies` resource no longer exists; the live time-off policies
  surface is `.timeOffPolicies`.
- The SDK now compiles under `exactOptionalPropertyTypes` and `noImplicitOverride`
  (both enabled in `wrapper/tsconfig.json`, matching cli + mcp). The local
  generator (`scripts/generate-sdk-from-openapi.mjs`) now emits an
  EOPT/override-clean error scaffold + request runtime: `override` on the
  `ClockifyApiError`/`ClockifyApiTimeoutError` `cause` members, explicit
  `| undefined` on the error classes' optional fields/constructor params, and a
  `?? null` no-signal default in the generated `core/request.ts`. Generated
  `.d.ts` optional error fields now read `?: T | undefined` (read-compatible for
  consumers; the emitted runtime JS is byte-identical). The former
  hand-written-only EOPT differential check in
  `scripts/check-consumer-cast-budget.mjs` was retired now that `npm run
  type-check` enforces both flags across the whole wrapper. See
  `spec/evidence/discrepancies.md`
  `strictness.wrapper-eopt-noimplicitoverride-blocked` (resolved).

### Security

- Adversarial-review pass (plan 011):
  - The webhook SSRF guard now blocks the RFC 2765 IPv4-translated IPv6 prefix
    (`::ffff:0:0:0/96`) and normalizes 2+ trailing dots before host classification,
    closing two residual bypasses; public hosts stay allowed (boundary-pinned).
  - `verifyClockifyWebhook` / `constructEvent` fail closed when the configured
    webhook token is empty — an empty `Clockify-Signature-Token` header no longer
    matches an empty configured token.
- `validateWebhookUrl` / `assertSafeWebhookUrl` now reject IPv4 multicast
  (224.0.0.0/4), reserved Class E (240.0.0.0/4) and the 255.255.255.255 limited
  broadcast, plus IPv6 multicast (ff00::/8, e.g. `ff02::1`, `ff0e::1`). These
  non-unicast hosts pass `new URL()` un-folded and previously fell through the
  SSRF guard to `null` (allowed), so a webhook callback could target them. The
  single `a >= 224` arm in `ipv4Reason` and the `firstByte === 0xff` arm in
  `ipv6Reason` close the gap; `223.255.255.255` and `fec0::1` stay allowed
  (boundary-pinned in the unit + property tests).

### Added

- Re-snapshot of the corrected OpenAPI (from GOCLMCP): the generator now keeps
  `$ref` query parameters instead of pruning them, so several list methods regain
  query params that were silently dropped. `scheduling.list` (`assignments/all`)
  and the per-user/all schedule totals now carry the live-required `start`/`end`
  (the endpoint 400s code 3001 without them), and the policies, shared-reports,
  custom-fields, expenses, invoices, user-groups and tasks list requests regain
  their filter/pagination params. 184 operations (unchanged); no path parameters
  changed. The CLI `scheduling list` and the `clockify_scheduling_assignments_list`
  MCP tool now require a `start`/`end` range to match.
- `clockify-sdk-ts-115/ensure` now exports `archiveThenDeleteClient` alongside
  `archiveThenDeleteProject`, and both own the FULL live-allowed delete sequence
  (GET name → archive replace-PUT `archived:true` → DELETE) plus the empty-name
  guard — the project variant uses the flattened update body, the client variant
  the body-envelope quirk that bypasses the `clients.update` field whitelist. The
  CLI (`clk115 projects/clients delete`) and MCP
  (`clockify_projects_delete`/`clockify_clients_delete`) handlers now call these
  helpers instead of hand-copying the steps across four sites. Public surface is
  now 92 names (was 91).
- Re-snapshot of the corrected OpenAPI (from GOCLMCP): `scheduling.listOnProject`
  now carries required `start`/`end` query params (the live single-project
  schedule-totals GET 400s without them); `expenseCategories.list` carries
  `page`/`page-size`; and `ChangeTimeOffRequestStatusTimeOffRequest.note` is now
  optional (the live status PATCH accepts a `{status}`-only body). The `Last-Page`
  header is now stamped on 18 of the 21 paginated list endpoints (added expenses,
  invoices, expense-categories), and `createExpense` is promoted to `live-success`.

### Security

- `composedFetch` (and therefore every `createClockifyClient` request, which
  uses it as the fetch seam) now defaults `redirect: "manual"` and surfaces any
  3xx as an explicit error instead of silently following it — a followed
  redirect would re-send the auth headers (`X-Api-Key` / `X-Addon-Token`) to the
  redirect target, possibly a host outside the trusted Clockify allowlist. Every
  legitimate Clockify endpoint answers with a direct 2xx/4xx. A caller that
  explicitly sets `redirect` keeps full control, and a blocked redirect is never
  retried. (The generated `src/core/request.ts` builder sets no explicit
  redirect policy of its own; tightening that at the generator level is a
  separate GOCLMCP-template cycle.)
- Webhook SSRF guard (`webhook-url`) now blocks NAT64 well-known-prefix
  (`64:ff9b::/96`) literals whose embedded IPv4 is a private/loopback/metadata
  range (e.g. `64:ff9b::a9fe:a9fe` → `169.254.169.254`); these were previously
  allowed. A NAT64 address embedding a public v4 stays allowed.
- Webhook SSRF guard (`webhook-url`) now also decodes two more IPv6→IPv4
  embedding classes that previously slipped through: **6to4** (`2002::/16`, e.g.
  `2002:7f00:1::` → `127.0.0.1`, `2002:a9fe:a9fe::` → `169.254.169.254`) and
  **IPv4-compatible** (`::/96`, e.g. `::7f00:1` → `127.0.0.1`, `::a9fe:a9fe` →
  `169.254.169.254`). Each is decoded and re-checked through the same private/
  loopback/metadata `ipv4Reason` path as the NAT64 / IPv4-mapped branches; a 6to4
  or IPv4-compatible literal embedding a public v4 stays allowed.
- Corrected a false security claim in `README.md` and
  `examples/structured-logging.ts`: the SDK logging layer does **not** emit
  request/response headers, so there is no "auto-redaction" — callers that log
  `ctx.headers` via hooks must redact the auth header themselves.

### Fixed

- `mapBounded` (`clockify-sdk-ts-115/bulk`) with `continueOnError: false` no
  longer keeps sibling workers pulling new items off the queue after the first
  rejection. A shared abort flag now stops every worker from claiming or
  dispatching `fn` for not-yet-started items once a sibling has failed — so a
  fail-fast bulk run makes far fewer post-failure calls. In-flight,
  already-dispatched calls cannot be recalled; the resolved/rejected contract is
  unchanged.
- A wrong/missing id (live `400` code:501 "X doesn't belong to Workspace" /
  "... doesn't exist") now classifies to `not_found` instead of
  `auth_or_permission`; the bare `workspace` token is dropped from the auth
  message matcher so it can no longer claim that family.
- `resolveInstant` (`clockify-sdk-ts-115/dates`) no longer interprets a
  zone-LESS ISO datetime (`2026-06-10T08:30:00`) in the **host** timezone, which
  broke the module's UTC-determinism contract (the same input resolved to a
  different instant per TZ). It now appends `Z` before parsing when the input
  carries no explicit zone, so a zone-less datetime is always UTC; explicit-offset
  inputs (`+02:00`, `-0500`, `Z`) keep their offset, and malformed strings still
  return `undefined`.
- `otelHooks` (`clockify-sdk-ts-115/otel-hooks`) no longer orphans spans for
  concurrent same-method+url requests when `composedFetch({ requestId: false })`
  disables X-Request-Id injection. The span store was a strong `Map` keyed by a
  synthetic `method+url+requestId+attempt` string that collapsed to
  `"GET <url> [no-id] #0"` for every such request, so a second `beforeRequest`
  overwrote the first's span (never ended). It is now a `WeakMap` keyed by the
  per-request `Headers` instance — collision-proof across concurrent requests and
  genuinely GC-reclaimed, matching the JSDoc that already claimed a self-reclaiming
  WeakMap.

### Tests

- `wire-shape.test.ts` LEDGER_COVERAGE now maps the new compensated ledger entry
  `time-off.requests.delete.policy-scoped-only-pending` to its MCP test, keeping the
  ledger-coverage gate in lockstep with `spec/evidence/discrepancies.md`.
- Added mutation-killing tests for `composed-fetch.ts`, `dates.ts`, and
  `errors.ts`. The Stryker module floors in `docs/mutation-score-contract.json`
  rise accordingly (`composed-fetch` 72→82, `dates` 76→84, `errors` 74→80,
  wrapper global 77→82). No runtime code changed.
- Added tests pinning every `MONTHS`/`WEEKDAYS` literal in `dates.ts`
  (parses August–December and tuesday/thursday/saturday) and both edges of the
  `fe80::/10` link-local band in `webhook-url.ts` (`[fec0::1]` accepted just
  above the band, `[febf::1]` rejected at the inclusive `0xfebf` upper bound).
  Floors rise: `dates` 84→88, `webhook-url` 80→83. No runtime code changed.
- Added regression / mutation-killing tests for the fixes above and two existing
  surviving mutants: `dates.ts` (zone-less datetime parses as UTC; explicit
  offset preserved), `webhook-url.ts` (6to4 / IPv4-compatible reject + public-v4
  allow vectors in both the example and property suites; inclusive upper bounds
  of the `172.16.0.0/12` and `100.64.0.0/10` IPv4 bands via
  `172.31.255.255`/`100.127.255.255`), `otel-hooks.ts` (two concurrent
  requestId-less same-method+url requests each end their span — no orphan), and
  `iter.ts` (a garbage non-`true`/`false` `Last-Page` value falls back to the
  length heuristic on both a full and a short page).
- The dual-build smoke (`wrapper/scripts/verify-dual-build.sh`) now asserts the
  EXACT root barrel surface — the 92 curated names plus the 34 generated-core
  names re-exported transitively via `export * from "./src"` — and fails on any
  new leak or silent removal. It previously only checked the 92 were present
  (a subset check; `EXPECTED_ROOT_SURFACE_COUNT` was never read), so the barrel
  could silently drift. Narrowing the barrel to drop the pure-plumbing
  generated-core re-exports remains a deliberate public-API decision (not done
  here).

### Changed

- `archiveThenDeleteProject` is now resource-driven: it takes `{workspaceId, id,
  resource}` (pass `client.projects`) and owns the GET/archive/DELETE calls,
  rather than the prior injected `archiveProject`/`deleteProject` callbacks. The
  `ArchiveThenDeleteResult` now also carries `id` and `clientId` aliases.
- Corrected-OpenAPI re-snapshot: `ListExpensesRequest` and `ListInvoicesRequest`
  now carry the optional `page` / `page-size` pagination fields (regenerated
  resource docs updated). This lets the CLI/MCP expense and invoice list calls
  pass their request directly instead of casting around the missing pagination
  slot. Generated SDK types only; no hand-written wrapper code changed.

- `operation-receipt` now exports `entityId()`, the shared safe id extractor
  used by CLI/MCP receipts instead of each package carrying its own narrowing
  helper.
- Redacted typed response cassettes plus `make cassettes`, replayed through the
  typed SDK client and local mock server.
- Wrapper Stryker mutation scoring (`make mutation`) with pinned covered-mutant
  floors for hand-written helper modules.
- `wrapper/examples/sdk-helper-cookbook.ts` and `docs/cookbook.md` provide
  compile-checked snippets for `ensure`, `resolve`, `money`, `dates`, `reports`,
  `bulk`, and `compose`.
- `make build-determinism` verifies that two wrapper builds emit identical
  `dist/` bytes.
- New `clockify-sdk-ts-115/requests` subpath: re-exports the generated
  `ClockifyApi` request namespace plus `ClockifyRequestBody<T>` and
  `wireBody<T>()`, giving CLI/MCP and consumers a stable typed seam for
  body-envelope request construction. Public surface is now 93 names / 27
  subpaths.
- Committed redacted replay fixtures plus `make replay-fixtures` to keep
  money/time-off wire-shape quirks replayable offline; `wire-shape.test.ts`
  now treats the invoice `unitPrice` scale finding as a guarded fixture-backed
  contract.
- Measured code coverage: `@vitest/coverage-v8` (v4, version-matched) wired
  into `vitest.config.ts` over the hand-written wrapper surface (`*.ts` root;
  generated `src/**` and the flat `webhook-events.ts` catalog excluded). New
  `npm run test:coverage` script; floors pinned in
  `docs/coverage-contract.json` and enforced by `make coverage`.
- Documented (inline in `tsconfig.json`) why `noImplicitOverride` and
  `exactOptionalPropertyTypes` stay disabled on the wrapper package: both red on
  generated `src/**` the hard stop forbids editing. No behavioral change.
- New `clockify-sdk-ts-115/reports` subpath: typed report filter builders
  (`summaryFilter`, `detailedFilter`, `weeklyFilter`) and response-narrowing
  accessors (`detailedEntries` — coalesces the `timeEntries`/`timeentries`
  spellings, `summaryGroups`, `reportTotals`) that re-expose the generated
  report types, so callers stop casting report responses to ad-hoc shapes.
- New `clockify-sdk-ts-115/bulk` subpath: `mapBounded(items, fn, {concurrency,
  continueOnError})` runs an async op over many items with bounded concurrency
  and collected per-item failures, plus thin DI `bulkArchiveProjects` /
  `bulkDelete` wrappers. (Public surface: 81→90 names, 23→25 subpaths.)
- New `clockify-sdk-ts-115/compose` subpath: `runComposition(steps)` runs an
  ordered set of create-or-reuse steps with transactional rollback — a failed
  required step runs prior `undo()`s in reverse (only entities actually created,
  never reused), and `leftBehindNote` reports truthfully when a rollback itself
  failed. Pure orchestration (injected I/O, no transport dependency). The MCP
  `clockify_create_work_package` now uses it, so a partial failure no longer
  orphans a client/project/task. (Public surface: 90→92 names, 25→26 subpaths.)
- `ensureClient` (the `ensure` subpath) — renamed from `findOrCreateClient` for
  consistency with `ensureTag` / `ensureProject` (the old name stays as a
  deprecated alias, see below). (Public surface: 92→93 names.)
- A scoped `Workspace` (`client.workspace(id)`) now exposes ergonomic
  `ensureTag(name)` / `ensureProject(name)` / `ensureClient(name)` upsert
  helpers with the workspaceId and list/create callbacks wired for you — no DI
  boilerplate. (These are instance methods, not new root exports.)
- A scoped `Workspace` now also exposes scoped per-resource iterators
  `ws.iterProjects` / `ws.iterTags` / `ws.iterClients` — auto-paginating
  `iterAll` wrappers with the workspaceId and fetcher wired for you, no `.bind`
  ritual. (These are instance methods, not new root exports.)
- Expanded the shared error-code registry from 10 to 16 entries so SDK, CLI,
  MCP, troubleshooting, and recovery docs name rate-limit headers, add-on token
  scope, host routing, active-delete, dead-route, and delete-name-reservation
  failures consistently.
- `clockify-sdk-ts-115/webhooks` now exports the shared webhook callback URL
  safety guard used by the SDK-adjacent CLI and MCP surfaces.
- `ComposedFetchHooks.onMetric` now emits best-effort numeric samples for
  request duration, retry scheduling, and rate-limit remaining headers.
- `IterOptions.onPage` adds a per-page progress callback for `iterPages`,
  `iterAll`, and scoped workspace iterators.

### Changed

- Generated SDK retry delays now cap at 60 seconds and jitter exponential
  fallback delays to avoid synchronized retry bursts while still honoring
  server-provided retry headers.
- Synced the corrected OpenAPI snapshot from GOCLMCP after 19 new
  live-success promotions and required-field response schema fixes; generated
  resource docs now reflect the updated expense create request shape.
- Coverage thresholds in `vitest.config.ts` now mirror the measured floor in
  `docs/coverage-contract.json`, so a bare wrapper coverage run enforces the
  same floor as the cross-package ratchet.
- Wrapper builds no longer emit `.map` files into `dist`, removing dead source
  and declaration maps from the npm dry-run package.
- Tightened `.size-limit.json` ceilings on the root CJS entry and the `iter`,
  `webhooks`, `pagination`, `with-response`, `resolve`, `dates`, `compose`,
  `ensure`, `money`, `invoice-body`, `bulk`, and `reports` subpaths to track
  measured bundle sizes more closely.
- `Workspace.entityChangesExperimental` is now marked `@experimental` /
  `@beta` and warns once outside test runs.
- Removed deprecated `findOrCreateClient` from the root barrel (root public
  surface 93 -> 92 names). It remains available from the
  `clockify-sdk-ts-115/ensure` subpath; prefer `ensureClient`.
- Removed the `bulkArchiveProjects` and `bulkDelete` aliases from the root
  barrel and the `clockify-sdk-ts-115/bulk` subpath — they were identity
  no-op wrappers over `mapBounded` with no internal consumers. Call
  `mapBounded(ids, fn)` directly (root public surface 93 -> 91 names).
- `tsconfig.json` now sets `isolatedModules: true`, aligning the wrapper
  with the cli/mcp strictness baseline. (`noImplicitOverride` was held
  back: the generated `src/errors/*` classes override `Error.cause` /
  `Error.name` without an `override` modifier — a generator concern,
  out of scope here.)
- `.size-limit.json` now tracks the high-value `resolve`, `dates`,
  `compose`, `ensure`, `money`, `invoice-body`, `bulk`, and `reports`
  subpaths (calibrated compressed-size ceilings); the CJS root entry's
  ceiling was recalibrated to its current measured size.

### Deprecated

- `findOrCreateClient` — use `ensureClient` instead (identical behavior; the
  alias warns once via `warnOnce` and delegates). Will be removed in the next
  major. This is the deprecation subsystem's first real consumer.

### Fixed

- `iterAll` / `iterPages` now govern 14 confirmed paginated method pairs,
  excluding envelope-returning balance lists and unpaginated custom-field /
  holiday lists from the drift assertion.
- `composedFetch` retry backoff sleep now rejects promptly when the request
  `AbortSignal` aborts during the delay.
- Webhook callback URL validation now rejects common internal-only host suffixes
  (`.home.arpa`, `.lan`, `.corp`, `.intranet`).
- `WebhookSignatureMismatchError` no longer stores the attacker-supplied
  received signature token on mismatch errors.
- Added a generated-client HTTP regression test for list wire shapes: projects
  remain bare arrays, invoices remain `{ invoices, total }` envelopes, and the
  in-progress time-entry route keeps `page-size` pagination wired through the
  local mock server.
- Corrected the SDK README manual users-pagination example to use
  `client.users.list`, the generated SDK method, and broadened snippet method
  parity so README examples are checked against generated client methods.
- Pinned the SDK README webhook example to the compiled
  `examples/webhook-express.ts` source via the new `make snippet-compile`
  gate, preventing prose/example drift in tagged TypeScript fences.
- Base-URL host allowlist now lists the **real** audit-log host
  `auditlog-api.api.clockify.me` (with the hyphen). The prior
  `auditlog.api.clockify.me` was a typo: it rejected the host the SDK
  actually targets while accepting one that does not exist. The
  no-hyphen form is now rejected (regression-tested).
- `iterPages` (the `iter` subpath) now trusts an authoritative
  `Last-Page: false` response header and continues paginating even when
  a page comes back short (a legitimately filtered/partial page),
  instead of stopping on the length heuristic and silently
  under-fetching. The `maxPages` bound still caps a server that never
  flips to `Last-Page: true`. The length heuristic is used only when the
  header is absent. This also benefits `iterAll`/`paginatedList`/`toArray`.
- `resolveUserRef` (the `resolve` subpath) now matches its exact-id fast path against the
  trimmed id (`rawId`), consistent with `resolveEntityRef`, so a padded id like `" 64ab…"`
  resolves directly instead of falling through to name matching.
- `RateLimitError.retryAfterMs` now returns `0` (retry immediately) for `Retry-After: 0`
  instead of `undefined`, and the internal retry backoff treats `Retry-After: 0` as a 0ms
  wait rather than falling through to exponential backoff (RFC 9110 delay-seconds=0).

### Changed

- The generated SDK no longer exposes the dead `timeEntries.stopTimer`
  method: the `PATCH .../time-entries/stop` route 404s live and has been
  quarantined out of the canonical OpenAPI upstream (GOCLMCP). The live
  stop flow is `timeEntries.updateForUser({ workspaceId, userId, end })`.
  Live surface is now **184 operations** with method-name stamps on
  **172 of 184** (was 185 / 173 of 185). No hand-written name changed.
- `paginate` (the `pagination` subpath, also a root export) is now a thin
  adapter over `iterAll` instead of re-implementing its own page-walk —
  one page-walk, one source of `Last-Page` correctness. The name,
  `PaginateOptions`, signature, and observable behavior are unchanged.

### Documentation

- Updated the README pagination count to "15 of the 20 paginated endpoints"
  (was 18) to match the corrected-OpenAPI re-snapshot: the expenses and invoices
  list operations now carry `page` / `page-size`, so `PAGINATED_LIST_OPS` is 20.
  The `Last-Page` header count (15) and the wrapper's `KNOWN_PAGINATED_METHODS`
  drift list (14) are unchanged. Docs-only; no runtime code changed.
- Corrected the SDK-method coverage figure in `README.md` to 173 of 185 operations
  (93.5%) — the prior `172 ops mapped (93.0%)` line contradicted the header's
  `173 of 185` — and clarified the `composed-fetch.ts` `PACKAGE_VERSION` JSDoc to
  state that release-please rewrites it via the `x-release-please-version` marker
  (comment-only; no behaviour change).
- Fixed stale in-code comments (no behaviour change): `iter.ts` drops two outdated
  "as of v0.1.0" version anchors (the drift-tested `KNOWN_PAGINATED_METHODS` array is
  the source of truth), and `scoped-client.ts` corrects a comment that described a
  positional-id call path the generated client never takes.
- Documented the new `resolve` list/filter resolvers
  (`resolveUserRefs` / `resolveGroupRefs` / `resolveTagRefs` /
  `resolveUserFilter`) and the `errors` `mapAddonTokenRestriction` /
  `AddonTokenRestrictionError` exports in `README.md` (helper table +
  error table). Surface is now 81 public names / 23 subpaths.
- Fixed the TypeDoc cross-reference path in the generated resource docs
  (`wrapper/docs/resources/*.md`) and their generator
  (`gen-resource-docs.ts`): the reference now points at the repo-root
  `docs/api/` build (`../../../docs/api/`) instead of the non-existent
  `wrapper/docs/api/`.

### Added

- `matchByName` (the `resolve` subpath) gained an optional `matchKeys` (default
  `["name"]`) so a caller can match across extra fields — e.g. `["name","email"]` for
  users. This makes the SDK matcher the single source of name-matching truth: the MCP
  workflow surface, which used to re-derive multi-field matching, now routes through it.
- Added `mapAddonTokenRestriction(err, { authScheme, method?, path? })` and the
  `AddonTokenRestrictionError` class to the `errors` surface: when an
  `X-Addon-Token` request 401s with a body saying the endpoint is not accessible
  to add-ons, the helper names the structural restriction (some endpoint families
  — webhooks, custom-field management, account-level `GET /workspaces` — are
  off-limits to add-on tokens regardless of manifest scopes) instead of surfacing
  a bare 401. API-key 401s pass through unchanged. The SDK error does not record
  the auth scheme, so the caller passes `authScheme`. Pure / catch-site helper,
  like `promoteApiError`.
- Added the list/filter name→id resolvers to the `resolve` subpath:
  `resolveUserRefs` / `resolveGroupRefs` / `resolveTagRefs` (id/exact-name lists →
  ids + labels, order-preserving dedup, one list call max, grounded clarify on
  ambiguous/unknown) and `resolveUserFilter` (optional read-filter slot, trusts a
  24-hex id, configurable default-when-empty). Ported from the live-proven
  ai-assistant addon. Groups always verify a 24-hex value, tags/filters trust it;
  all four are pure (injected `list` callbacks) and reuse the existing
  `ClarifyResult` shape.
- Added the `ensure` subpath: `ensureTag` / `ensureProject` / `findOrCreateClient`
  do a case-insensitive list-then-match before creating, so a re-run reuses the
  existing record instead of silently making a duplicate (Clockify does not enforce
  name uniqueness). `archiveThenDeleteProject` encodes the live-verified rule that
  deleting an ACTIVE project 400s — it archives first, then deletes. All four are
  pure (injected `list`/`create`/`archive`/`delete` callbacks), like `resolve`.

### Fixed

- Mapped the new `time-off.policies.scope.status-active-not-all` ledger finding to
  its MCP regression tests in the `wire-shape.test.ts` `LEDGER_COVERAGE` table, so
  the wrapper ledger-coverage guard stays green for the time-off-policy
  `status:"ACTIVE"` scope-filter fix.
- Corrected stale headline counts in `README.md`: the dual-build smoke verifies
  71 public names + 22 subpaths (was the obsolete "47 exports + 15 subpaths"), and
  idiomatic naming is stated as 173 of 185 operations (was an inconsistent "28
  modules (93%)").

### Added

- Added the `money` subpath: `toMinor()` / `toMajor()` plus the
  `CLOCKIFY_AMOUNT_UNITS` table and `invoiceItemUnitPrice*` helpers encode
  Clockify's non-uniform money units in one place — invoices/payments/rates are
  minor (cents), expenses are MAJOR (dollars), and an invoice item `unitPrice` is
  minor×100 — so callers stop guessing and silently mis-billing.
- Added the `invoice-body` subpath: `invoiceUpdateBodyFromExisting()` builds a
  safe `PUT /invoices/{id}` body. It carries forward the editable fields the
  replace-semantics PUT would otherwise wipe, and maps the GET's ×100
  `discount`/`tax`/`tax2` integers to the PUT's `discountPercent`/`taxPercent`/
  `tax2Percent` fields — preventing the silent tax/discount zeroing that goclmcp
  (the spec source) still inherits. Live-verified via the ai-assistant addon.
- Added the `request-options` subpath: `requestOptions()`, `withHeaders()`,
  `withIdempotencyKey()`, and `withRequestTimeout()` give per-call timeout,
  retry, abort, query, and header behavior a stable public type without
  importing generated internals. `ClockifyRequestOptions` omits `addonToken`.
- Added the `operation-receipt` subpath: `toOperationReceipt()` and
  `toOperationErrorReceipt()` normalize SDK calls into the same success/error
  receipt vocabulary the CLI and MCP surfaces emit (status, headers, request
  id, rate limit, stable error code, recovery).
- Exported shared error-code and recovery helpers from the SDK error surface.
- Added `classifyClockifyError()` and `getStableErrorCode()` for SDK runtime recovery classification.
- Added deterministic mock Clockify server coverage for SDK health and pagination flows.
- Added `clockifyDiagnostics()` as a no-network SDK readiness receipt for auth, runtime, workspace ID, base URL override, warnings, and next steps.
- Added a Clockify base-URL host allowlist to `createClockifyClient`: a `baseUrl` / `environment` override must target an official Clockify API host (`api.clockify.me`, `reports.api.clockify.me`, `auditlog-api.api.clockify.me`, `pto.api.clockify.me`, `developer.clockify.me`) or a loopback host (`localhost` / `127.0.0.1` / `::1`, any port). Arbitrary HTTPS hosts are rejected unless the new `allowInsecureBaseUrl: true` option is set (which warns); plain `http://` on non-loopback hosts is always rejected. Exposed `validateClockifyBaseUrl()` / `classifyClockifyBaseUrl()`, and `clockifyDiagnostics()` now reports `checks.baseUrl.allowlist` (`allowed` / `rejected`).
- Added a wire-shape regression suite: `wire-shape.test.ts` pins the invoice-body
  and money-unit invariants and asserts every COMPENSATED finding in
  `spec/evidence/discrepancies.md` keeps a live test (a ledger-coverage guard — it
  now also tracks the `user-groups.get` and `time-off.requests.get` list-scan
  fixes and the projects/tasks archive-then-delete fix), and
  `wire-shape-http.test.ts` round-trips the invoice tax/discount + replace quirks
  through the generated SDK against an extended mock Clockify server (new invoice
  GET/PUT/POST routes reproducing the ×100 tax/discount and note/subject drop).
- Added the `resolve` subpath: `looksLikeClockifyId`, `matchByName`,
  `suggestOptions`, `resolveEntityRef`, `resolveProjectTaskRefs`, and
  `resolveUserRef` turn a name (or `me`) into a real Clockify id BEFORE the call —
  case-insensitive, with a grounded "did you mean?" clarify on a miss or ambiguous
  match — so a CLI flag or agent argument never ships a typo'd name to the wire as
  an id. The list lookups are caller-supplied callbacks, so the layer is
  client-agnostic.
- Added the `dates` subpath: `resolveRelativeDay`, `resolveInstant`,
  `resolvePeriod`, and `REPORT_PERIODS` resolve "yesterday" / "next Monday" / a
  period keyword to the `YYYY-MM-DD` or UTC instant the API wants, given an
  explicit `now` — so a model or remote clock never computes calendar dates.

### Changed

- Stamped the workspace user listing and manager-role grant/revoke operations
  under the `users` SDK group: `client.users.list`, `client.users.giveRole`, and
  `client.users.removeRole`. The single-method `roles` module is gone — its two
  ops now live under `users` (matching how Clockify/Go scope role writes to a
  user). `Workspace.scoped` drops its `roles` accessor accordingly.

### Fixed

- Routed operations whose OpenAPI definition carries a per-operation `servers`
  override to that host. The reports (`reports.api.clockify.me`), audit-log
  (`auditlog-api.api.clockify.me`), and shared-reports/expense-report methods
  previously hit the default `api.clockify.me/api/v1` host and 404'd; they now
  reach the correct sub-API. An explicit `baseUrl` / `environment` override
  still wins, so mock/replay routing is unchanged.

### Changed

- Replaced the required Fern TypeScript SDK emitter with the repo-owned local OpenAPI generator. The generated client now models `apiKey` and `addonToken` as mutually exclusive auth options, preserves the existing public SDK surface, and keeps generated `timeoutInSeconds`, `maxRetries`, `withRawResponse()`, binary response, and request-header behavior compatible with the wrapper helpers.
- Expanded the dual-build smoke surface to include generated error-code helpers, SDK classification helpers, and the diagnostics helper.
- Migrated to an npm workspaces layout. The wrapper, CLI, and MCP packages now share a single root `package-lock.json`; `wrapper/package-lock.json` is gone. No change to the published `clockify-sdk-ts-115` tarball contents.
- Bumped the `errors` subpath size-limit ceiling to 5 kB (was 3.5 kB) to accommodate the inlined error-code registry; measured size is 3.91 kB brotlied.
- Cleaned up three eslint diagnostics flagged on the hand-written surface (one unnecessary non-null assertion in the error-code template, two import-order fixes in `errors.ts` and `tests/mock-clockify.test.ts`).
- Rewrote the `tests/axioms-checklist.test.ts` header comment to point at `docs/axioms.md` (the canonical axioms doc) instead of a contributor's machine-local path.
- Documented `composedFetch`'s retry mutation-safety model: the default `retryableMethods` retries idempotent methods only (`GET`/`HEAD`/`OPTIONS`/`PUT`/`DELETE`); `POST`/`PATCH` stay excluded because a 5xx or transport timeout on a write can land server-side mid-mutation, so a blind retry could double-apply it. JSDoc-only clarification plus regression tests pinning the no-retry-on-transport-timeout guarantee for `POST`/`PATCH`; behavior unchanged.

### Internal

- Regenerated `wrapper/.packsnapshot` from current codegen so it matches the local generator output again: it had drifted from the renamed generated request types (e.g. `ClientCreate`, `UpdateStatusApprovalsRequest`) and now also carries the new `request-options` and `operation-receipt` subpath artifacts. Narrowed a `createClockifyClient` test's captured request body to `string` so the stricter `@typescript-eslint/no-base-to-string` rule passes.
- Raised the `.size-limit.json` ceiling for the CJS root entry from 2.5 kB to 3 kB. The `money`/`invoice-body`/`resolve`/`dates` root re-exports grew the bundled CJS barrel to 2.74 kB brotlied; the raw-size budget in `docs/performance-budgets.json` was already recalibrated for these helpers (CJS → 18500 B, ~9% headroom) but the brotli `size-limit` gate was missed in lockstep. The ESM root stays tree-shaken at 1.48 kB.
- Pinned the generated retry-delay template's sub-cap branch in `generated-retry-delay.test.ts`: a fake-timers `X-RateLimit-Reset` ~5s ahead now asserts the time-relative `5000ms` result (previously only the over-cap path was covered).

## [0.10.0](https://github.com/apet97/clockify-ts-sdk/compare/wrapper-v0.9.0...wrapper-v0.10.0) (2026-06-29)

### Features

* **mcp:** ship the low-risk read-tool tranche (135 -&gt; 140) + follow-up findings ([7c9b69a](https://github.com/apet97/clockify-ts-sdk/commit/7c9b69af9914c6b191139218f5d3927e2c386ba6))

### Bug Fixes

* implement 47 adversarial-review findings (plan 011) ([443b1a2](https://github.com/apet97/clockify-ts-sdk/commit/443b1a24509338d28482695df64b9a68194a44c0))

## [0.9.0] — 2026-05-25

Closes the Tier-1 and Tier-3 gaps from the "Stainless/Speakeasy
parity" audit. No breaking changes — all additions are opt-in.

### Added

- **Typed webhook events.** `ClockifyWebhookEvent` discriminated
  union of all 50 documented Clockify webhook event types.
  `constructEvent(payload, ...)` now returns `ClockifyWebhookEvent`
  instead of `unknown`. Callers get exhaustive `switch` checks.
- **Scoped resource clients.** `client.workspace(id)` returns a
  sub-client where `workspaceId` is pre-bound on every resource
  method. `ws.tags.list()` instead of
  `client.tags.list({ workspaceId })`.
- **OTel-typed observability hooks.** New `otelHooks(spanProvider)`
  helper that returns a `ComposedFetchHooks` object emitting
  OpenTelemetry-semantic-conventions HTTP span attributes. Zero
  runtime dependency on `@opentelemetry/api`.
- **`client.health()`** — one-call connectivity + auth check that
  resolves the current user's profile.
- **`debug: true` option** on `createClockifyClient()` — auto-wires
  `console.debug` request/response logging via the existing hooks.
  Off by default.
- **`getRateLimit(headers)` / `getRateLimitFromError(err)`** helpers
  — parse `X-RateLimit-*` headers into a `{ remaining, limit,
  resetAt }` snapshot.

### Documentation

- **Hosted TypeDoc** at `https://apet97.github.io/clockify-ts-sdk/`.
  Auto-published on every `main` push via
  `.github/workflows/docs.yml`.
- New README sections: "Typed webhook events", "Scoped clients",
  "Observability".

### Internal

- **release-please automation.** `.github/workflows/release-please.yml`
  watches conventional-commit messages and opens release PRs that
  bump `package.json`, prepend the CHANGELOG, and tag the release
  on merge.

## [0.8.0] — 2026-05-25

Closes the eight gaps identified against the SDK's user-facing
quality bar. No breaking changes — all additions are opt-in.

### Added

- `ClockifyConnectionError` and `ClockifyAbortError` subclasses of
  `ClockifyApiError`. `promoteApiError(err)` now detects network
  failures (TypeError/`fetch failed` causes, statusCode `undefined`)
  and AbortSignal cancellations (cause `name === "AbortError"`) and
  returns the typed subclass. Existing call sites that catch
  `ClockifyApiError` keep working — the new classes inherit from it.
- `getErrorCode(err)` helper. Probes a `ClockifyApiError`'s body
  for `body.code` first, then `body.error.code` (string). Returns
  `undefined` when no code is present or `err` isn't a
  `ClockifyApiError`. Stripe / OpenAI / Anthropic SDK convention.
- `PaginatedList<T>` class (subpath: `clockify-sdk-ts-115/paginated-list`).
  Async-iterable wrapper around `iterAll`/`iterPages` with
  `.pages()`, `.toArray({ limit? })`, and direct
  `for await (const item of list)` ergonomic.
- `isConnectionError(err)` and `isAbortError(err)` type guards.

### Documentation

- New README sections: "Idempotency keys" and "Connection / abort
  errors". Each follows the existing single-example + table format.
- New `wrapper/examples/`: `handle-abort.ts`, `handle-connection-error.ts`,
  `pass-idempotency-key.ts`. Each is a complete, runnable script.

### Internal

- Build version constant injection — `composed-fetch.ts`'s
  `PACKAGE_VERSION` and `package.json` `version` are now both bumped
  in this branch. (A future change should derive one from the other
  at build time.)

## [0.7.0] — 2026-05-25

Continued polish on top of v0.6.0. Adds one new public API symbol
(`isClockifyApiError` catch-all type guard), expands documentation
+ examples to cover every v0.6.0 surface, and fills test-coverage
gaps in pagination input validation and rate-limit header parsing.
No breaking changes.

### Added

- **`isClockifyApiError(err)` catch-all type guard.** Symmetric
  with the per-status guards added in v0.6.0
  (`isRateLimitError`, `isConflictError`, etc.). Returns `true` for
  the base `ClockifyApiError` and every subclass — useful at the
  outer edge of a `catch` to rethrow non-SDK failures.
- **5 new runnable examples** in `examples/`:
  - `typed-errors.ts` — three catch-block styles using the v0.6.0+
    error hierarchy (outer-edge guard, promote-then-narrow,
    direct type-guard narrowing).
  - `structured-logging.ts` — Pino-shaped `ILogger` plugged into
    the SDK's `logging.logger` + per-stage hooks for structured
    request / response / error / retry events.
  - `per-request-overrides.ts` — every `requestOptions` override
    worth knowing (timeout, maxRetries: 0, abortSignal, headers
    for `Idempotency-Key`).
  - `idempotency.ts` — `Idempotency-Key` pattern via
    `requestOptions.headers` with notes on Clockify's current
    server-side support state.
  - `bulk-archive.ts` — real-world job pattern: `iterAll` for
    memory-bounded pagination, bounded parallelism, per-item
    error isolation via `promoteApiError` + `isClockifyApiError`,
    dry-run/apply split.

### Changed

- **README**: replaced the now-stale "Why no linter" section with
  "Quality and tooling" — an 11-row matrix listing every CI gate
  (type-check, type tests, lint, format, size-limit, dual build,
  tarball snapshot, provenance, Bun/Deno smoke, CodeQL,
  spec-check). New "Deprecations" section showing the
  `warnOnce` convention.
- **README → Logging section**: fixed a bug — the prior code
  snippet showed `logger: (level, msg, meta) => ...` which is the
  wrong shape. Fern's `logging.logger` expects an `ILogger`
  object with `debug/info/warn/error` methods. Updated snippet
  + cross-reference to the new `examples/structured-logging.ts`
  for a fully-wired Pino adapter.
- **README badges**: added CodeQL workflow badge + sigstore
  provenance badge.
- **CONTRIBUTING.md**: added "Releasing a new version" section
  (9-step tag-day playbook) + "Debugging tips" section (5 recipes:
  live-test repro, `X-Request-Id` correlation, sync drift,
  bundle-size regression triage, tarball drift).
- **JSDoc polish** on `paginate` (added `@throws RangeError` +
  cross-reference to `iterAll`/`iterPages`), `withResponse`
  (clarified error propagation behavior), `composedFetch`
  (rewrote function-level paragraph + added `@throws TypeError`
  for the missing-fetch path).

### Tests

- `pagination.test.ts` (+3): `pageSize` / `maxPages` / `startPage`
  <= 0 should throw `RangeError` with a specific message — the
  validation paths in `pagination.ts:45-53` were untested.
- `errors.test.ts` (+4): rate-limit header parsing edge cases
  (past HTTP-date in `Retry-After`, malformed string,
  past epoch in `X-RateLimit-Reset`, case-insensitive lookup).

152 unit cases now (was 145).

## [0.6.0] — 2026-05-25

Polish-pass release: typed status-class errors, ESLint, bundle
ceiling, type tests, deprecation rails, stricter tsconfig, Node
20 + 22 CI matrix. No breaking changes — all additions are
backward-compatible with v0.5.0 catch sites.

### Changed

- **`noUncheckedIndexedAccess: true` enabled in tsconfig.json.**
  Stainless-default strictness — index/key access now narrows to
  `T | undefined` so callers can't accidentally treat an absent
  entry as present. Required a single test-only fix
  (`tests/iter.test.ts` — added `?.[method]` after the existing
  `toBeDefined` assertion). The synced SDK (`wrapper/src/**`)
  compiled clean under the flag on first try.
  The companion `exactOptionalPropertyTypes` flag is held back —
  it surfaces ~840 errors in the generated SDK that need an
  upstream fix in `apet97/go-clockify`'s
  `scripts/gen-clockify-openapi` first. Tracked as a follow-up.

### Added

- **Typed status-class errors: `RateLimitError` (429),
  `ConflictError` (409), `InternalServerError` (500),
  `ServiceUnavailableError` (503).** All extend `ClockifyApiError`
  so existing `instanceof ClockifyApiError` catches keep working.
  Available from the package root and the `clockify-sdk-ts-115/errors`
  subpath. `RateLimitError` parses `Retry-After` (seconds or
  HTTP-date) and `X-RateLimit-Reset` (epoch seconds) into
  structured `retryAfterMs: number | undefined` and
  `rateLimitResetAt: Date | undefined` fields — no more digging
  into raw response headers.
- **`promoteApiError(err)` helper.** No-op for non-`ClockifyApiError`
  values; for a base `ClockifyApiError` with status 409/429/500/503,
  returns the matching subclass instance with all fields preserved.
  Drop-in for any catch site. The Fern-generated client throws
  base `ClockifyApiError` for statuses not documented per-endpoint
  in the OpenAPI spec, so this helper fills that gap.
- **Type-guard predicates: `isRateLimitError`, `isConflictError`,
  `isInternalServerError`, `isServiceUnavailableError`.** Match on
  `statusCode` without re-allocating the error.
- **`warnOnce(key, message)` helper for deprecation paths.** Lives
  at the new `clockify-sdk-ts-115/deprecation` subpath and is also
  re-exported from the root. Dedupes by `key`; silent under
  `NODE_ENV === "test"` so the test suite isn't noisy. Two-phase
  removal convention documented in CONTRIBUTING.md
  (§ Deprecating a public symbol).

### Build / DX

- `"sideEffects": false` in `package.json` so bundlers can
  dead-code-eliminate unused exports. Safe — hand-written modules
  are pure exports and the synced SDK has no top-level effects.
- ESLint 9 flat config on the hand-written surface (`*.ts` at
  wrapper root + `tests/**`). Stack: `typescript-eslint`
  (recommended-type-checked) + `eslint-plugin-import-x`
  (order + no-cycle) + `consistent-type-imports`. Scoped to
  exclude `src/**` (regenerated on every sync). New `npm run lint`
  + CI lint job (Node 22).
- `vitest --typecheck.only` mode with 12 type-assertions covering
  `createClockifyClient` (apiKey XOR addonToken + env-fallback),
  `iterAll`/`iterPages` return shapes, and `withResponse`. Runs
  via `npm run test:types`; added as a CI step in `build-and-test`.
- Bundle ceilings via `size-limit` (file-size measurement, no
  bundling — right fit for a Node SDK shipped as-is). 9 ceilings
  at ~1.5-2× current size to alarm on regressions without
  flagging routine generator growth. New `npm run size` +
  dedicated CI job.
- Node 20 + 22 CI matrix in `build-and-test` (was Node 22 only).
- `.editorconfig` mirroring `.prettierrc` (4-space, LF,
  trim-trailing, 100-col) for contributors not on format-on-save.
- `composed-fetch.ts`: small `toError(unknown): Error` helper
  introduced to route caught fetch errors through a typed throw
  site (satisfies `@typescript-eslint/only-throw-error` without
  losing the original `Error` stack).
- `composed-fetch.ts`: User-Agent constant `PACKAGE_VERSION`
  refreshed to match the package version (was stale at `0.4.0`).

### Removed

- **Three more phantom routes quarantined (G.1 edge-case follow-up).**
  Probe re-pass against sandbox <REDACTED_WORKSPACE_ID> on
  2026-05-25 confirmed all three "needs investigation" routes from
  the post-v0.5.0 follow-up are dead on the live API:
  - `POST /workspaces/{wsId}/time-off/requests/users/{userId}`
    (HTTP 404 + code 3000). The live admin-creates-TOR-for-user
    flow is the policy-scoped `submitForUser` already shipped.
  - `GET /workspaces/{wsId}/time-off/requests` (HTTP 405). The
    POST on the same path remains (that's the documented
    POST-as-list `list` op).
  - `GET /workspaces/{wsId}/users/{userId}/time-off/balances`
    (HTTP 404). The live per-user balance read is the singular
    `balances.getForUser` already shipped.

  Added all 3 to GOCLMCP's `PHANTOM_PATHS` (now 9 entries total).
  Canonical operations drop 188 → 185; wrapper's `timeOff` module
  drops from 9 to 8 methods; wrapper's `balances` module drops
  from 5 to 4. Stamp count drops 170 → 169 (removed the now-stale
  `balances.listForUser` entry from `SDK_METHOD_NAMES` since its
  path is now phantom). Coverage 169/185 = 91.4%.

  Methods removed from the wrapper surface:
  - `client.timeOff.postWorkspacesWorkspaceIdTimeOffRequestsUsersUserId`
  - `client.balances.getWorkspacesWorkspaceIdTimeOffRequests`
  - `client.balances.listForUser`

  Any consumer of those would have been getting 404/405 errors;
  the SDK no longer pretends they work. Ledger entry:
  `spec/evidence/discrepancies.md` →
  `timeoff.legacy-policies-requests.phantom-path-quarantined` →
  Update 2026-05-25 (round 2).

## [0.5.0] — 2026-05-25

Closes the multi-session G-track sweep against the
`apet97/go-clockify` sister repo. Spec-side changes regenerated
the canonical OpenAPI; wrapper-side changes consume them through
the standard `npm run sync` chain. Major shift in surface
ergonomics — see "Changed (BREAKING)" below for migration notes.

### Removed

- **Three phantom `time-off-request` legacy paths quarantined.**
  Live-probed the three operations the canonical spec declared at
  `/workspaces/{wsId}/policies/{policyId}/requests` (POST + DELETE +
  PATCH); all returned `HTTP 404 + {"message":"No static resource
  ...","code":3000}` — the routes do not exist on the live API.
  Added to `PHANTOM_PATHS` in `../GOCLMCP/scripts/gen-clockify-openapi`;
  the merger quarantines them on every regen. Canonical operation
  count drops from 191 → 188; raw-allowlist drops 134 → 131; the
  wrapper's `timeOff` module exposes 9 methods (was 12). The live
  time-off request flow is exclusively under the scoped
  `/workspaces/{wsId}/time-off/policies/{policyId}/requests/*`
  paths (already stamped as `submit` / `withdraw` / etc.). See
  `spec/evidence/discrepancies.md` →
  `timeoff.legacy-policies-requests.phantom-path-quarantined`.

### Added

- **`createClockifyClient()` reads `CLOCKIFY_API_KEY` /
  `CLOCKIFY_ADDON_TOKEN` from env when auth options are omitted.**
  Matches the Stripe / OpenAI / Anthropic SDK convention:
  `createClockifyClient()` with no args now reads the env vars at
  construction time (`CLOCKIFY_API_KEY` preferred; falls back to
  `CLOCKIFY_ADDON_TOKEN`). Explicit `apiKey` / `addonToken` options
  still take precedence; both-explicit still throws; empty-string
  env-var values are treated as absent. The TS type adds a third
  union branch (`{ apiKey?: never; addonToken?: never }`) so `{}` is
  accepted at the type level; the runtime then enforces the env-var
  invariant. Six new vitest cases cover the env-fallback paths
  (each-env-alone, both-env-set-precedence, explicit-beats-env both
  directions, empty-string-treated-as-absent, throws-when-both-absent).
  Resolves the long-standing open question from
  `spec/evidence/discrepancies.md` →
  `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`
  (the "default to env vars" ergonomic), independently of the
  Fern-side typing fix tracked under G.3.
- **`iterPages` consumes the `Last-Page` response header (G.5).**
  When the fetcher returns a Fern-style `HttpResponsePromise<T>`
  (which exposes `.withRawResponse()`), the wrapper now uses the
  `Last-Page: true` header — emitted by 15 of the 18 paginated
  Clockify list endpoints — as the authoritative stop signal.
  More robust than the legacy `items.length === pageSize`
  heuristic, which fetched one extra empty page whenever a final
  page coincidentally filled. The heuristic remains as a fallback
  for the 3 endpoints that don't emit the header (custom-fields,
  holidays, project-scoped custom-fields) and for custom fetchers
  that don't expose `.withRawResponse()`; the wrapper also stops
  on a short page even when `Last-Page: false` to defend against
  server-inconsistency loops. Audit + per-endpoint behaviour
  documented in `spec/evidence/discrepancies.md` →
  `pagination.last-page-header.live-audit-2026-05-25`. Six new
  vitest cases cover the four header/length combinations + the
  case-insensitive parse + the no-`withRawResponse` fallback.
- **Upstream generator annotation (G.5).** The corrected-spec
  snapshot now carries `x-clockify-last-page-header: true` on each
  of the 15 audited-emitting list operations (stamped by GOCLMCP's
  `LAST_PAGE_HEADER_OPS` set + `stamp_last_page_header!` function).
  Downstream consumers (other SDK generators, MCP tools, custom
  client wrappers) can read the annotation to short-circuit their
  own pagination loops.

### Changed (BREAKING — gated behind v1.0.0 cut)

- **Idiomatic method names on 27 modules (G.1).** With both
  `x-fern-sdk-group-name` and `x-fern-sdk-method-name` stamped on the
  upstream spec, Fern now generates idiomatic names on 27 resource
  modules. **170 ops mapped in total** (90.4% of the
  188-op live API surface; see "Removed" below for the 3 phantom
  ops dropped from 191 → 188): 110 in the first G.1 cut + 39
  action-verb cleanups + 18 small/read-only module fills + 3
  domain edge-case fills:
  - `client.tags.{list,create,get,update,delete}` (5 ops).
  - `client.clients.{list,create,get,update,delete,archive}` (6 ops;
    `archive` is a Clockify-specific action verb).
  - `client.projects.{list,create,get,update,delete}` (5 ops). The
    archive/rate/template/membership action verbs keep their
    operationId-derived names.
  - `client.tasks.{list,create,get,update,delete}` (5 ops). Cost-rate
    + billable-rate verbs stay operationId-derived.
  - `client.timeEntries.{create,get,update,delete}` (4 ops on the
    `/time-entries/{teId}` family). No top-level workspace LIST
    exists on Clockify; the per-user `/user/{userId}/time-entries`
    family keeps its operationId-derived names.
  - `client.holidays.{list,create,update,delete}` (4 ops). No GET-by-id
    on the API; the `/holidays/in-period` filter route stays
    operationId-derived.
  - `client.sharedReports.{list,create,update,delete}` (4 ops on the
    workspace-scoped surface). The public `/shared-reports/{srid}`
    view route stays operationId-derived (no auth on that one).
  - `client.timeOffPolicies.{list,create,get,update,delete}` (5 ops).
    `changeTimeOffPolicyStatus` stays operationId-derived.
  - `client.userGroups.{list,create,get,update,delete}` (5 ops).
    Group-membership sub-resource ops stay operationId-derived.
  - `client.webhooks.{list,create,get,update,delete}` (5 ops).
    Token-rotation / logs / addon-webhooks endpoints stay
    operationId-derived.
  - `client.customFields.{listForWorkspace,createForWorkspace,
    updateForWorkspace,deleteForWorkspace,listForProject,
    updateForProject,removeFromProject}` (7 ops). Scoped names
    because the module covers both workspace + project surfaces;
    project scope lacks a create op (workspace-level create, then
    attach), and the project DELETE is `removeFromProject` because
    it unattaches rather than deletes the field itself.
  - `client.expenses.{list,create,get,update,delete}` (5 ops).
    `downloadExpenseReceipt` stays operationId-derived (binary file
    action).
  - `client.expenseCategories.{list,create,update,delete,archive}`
    (5 ops). `archive` is actually `PATCH .../status` on the API but
    semantically an archive flip.
  - `client.invoiceItems.{create,import,delete}` (3 ops). Clockify
    has no LIST or GET-by-id; items live on the parent invoice.
  - `client.invoicePayments.{list,create,delete}` (3 ops). No
    GET-by-id, no update on the API.
  - `client.policies.{list,create,get,update,delete,archive}` (6
    ops; full CRUDL + archive).
  - `client.approvals.{list,submit,submitForUser,resubmit,resubmitForUser,updateStatus}`
    (6 ops). Workflow verbs; `updateStatus` accepts a `status` body to
    approve / reject / withdraw. The `*ForUser` variants are admin
    endpoints; the un-suffixed verbs act on the caller's own entries.
  - `client.timeOff.{list,get,delete,updateStatus,submit}` (5 ops).
    `list` is the documented POST-as-list quirk (GET returns 405).
    `submit` is scoped under `/time-off/policies/{policyId}/requests`
    (user creates a TOR for a given policy). The legacy
    `/policies/{policyId}/requests` duplicate routes + the
    admin-creates-for-user variant stay operationId-derived.
  - `client.scheduling.{create,list,update,delete,publish,copy,createRecurring,updateRecurring,deleteRecurring}`
    (9 ops). Single-assignment CRUDL + the workflow actions
    (`publish`, `copy`) + recurring-assignment CRUD. The
    capacity-totals endpoints, per/on-project breakdowns, and the
    PUT-replace variants stay operationId-derived (specialised
    shapes).
  - `client.invoices.{list,create,filter,get,update,delete,duplicate,export,updateStatus}`
    (9 ops). CRUDL + the workflow actions. `filter` is the
    POST-with-body filter route at `/invoices/info` (distinct from
    the bare `list`). `updateStatus` matches the same PATCH .../status
    pattern as approvals / timeOff / policies. No `send` is stamped —
    the API has no such endpoint (the tool layer returns "unsupported").
  - `client.reports.{attendance,detailed,summary,weekly}` (4 ops).
    Each report family is a POST-with-body call; the verb is the
    family name directly, matching how Clockify users describe the
    reports surface.

  **Action-verb cleanups inside the 21 stamped modules (+39 ops):**
  - `projects` adds `createFromTemplate`, `archive`, `updateCostRate`,
    `updateEstimate`, `updateHourlyRate`, `updateMemberships`,
    `updateTemplate`, `updateUserCostRate`, `updateUserHourlyRate`.
    `assignOrRemoveProjectUsers` kept operationId-derived (semantic
    overlap with `updateMemberships`; needs domain disambiguation).
  - `tasks` adds `updateCostRate`, `updateBillableRate`.
  - `timeEntries` adds `markInvoiced`, `markInvoicedBulk`,
    `listInProgress`, `listForUser`, `createForUser`, `startTimer`
    (PUT on `/user/{userId}/time-entries` — start a running entry),
    `updateForUser`, `stopTimer`, `duplicate`. `deleteMany` stays as
    its existing idiomatic name.
  - `holidays` adds `listInPeriod`.
  - `sharedReports` adds `view` (the bare unauthenticated
    `/shared-reports/{srid}` route).
  - `timeOffPolicies` adds `updateStatus`.
  - `userGroups` adds `listMembers`, `addMembers`, `removeMember`.
  - `webhooks` adds `listForAddon`, `rotateToken`, `listLogs`
    (GET `/logs`), `searchLogs` (POST `/logs` with body),
    `updateToken`.
  - `expenses` adds `downloadReceipt`.
  - `scheduling` adds `listPerProject`, `listOnProject`,
    `replaceRecurring` (PUT-style replace on recurring assignments,
    paired with the existing `updateRecurring` PATCH),
    `getUsersCapacityFiltered`, `calculateUsersTotals`,
    `getUserCapacity`.
  - `timeOff` adds `submitForUser`.

  Legacy duplicate paths (e.g. `/policies/{policyId}/requests` mirroring
  `/time-off/policies/{policyId}/requests`) stay operationId-derived
  to avoid Fern method-name collisions inside the same module.

  **Small / read-only modules now fully stamped (+18 ops, 6 modules):**
  - `auditLogReport.search` (the single POST `/audit-log` route).
  - `balances.{listForPolicy, update, getForUser}` — the per-policy
    and per-user balance views plus the policy-level adjustment.
  - `entityChangesExperimental.{listCreated, listUpdated, listDeleted}`
    — one verb per event type in the change-event feed.
  - `invoiceSettings.{get, update}` — single-resource shape.
  - `memberProfiles.{get, update}` — per-user profile read + patch.
  - `workspaces.{list, create, get, update, updateCostRate,
    updateBillableRate, addUser}` — CRUDL on the workspace itself
    plus the two workspace-level rate updates and the addUser action.
    Per-user verbs (`updateUserStatus`, `updateUserCostRate`,
    `updateUserHourlyRate`) stay operationId-derived (already
    verb-noun shaped).

  **Modules intentionally left operationId-derived (~4 modules,
  ~5 ops):** `files.uploadImage`, `roles.{giveUserManagerRole,
  removeUserManagerRole}`, `expenseReport.generateDetailedReportV1`,
  the per-user `workspaces.updateUser*` family — each name is
  already a clean verb-noun and a rename would not improve clarity.

  **Final domain edge-case fills (+3 ops, step 8):**
  - `projects.setMembers` (POST `/projects/{projectId}/memberships`
    replaces the membership list — paired with the sibling PATCH
    `updateMemberships` for partial updates). Naming mirrors the
    `userGroups.{listMembers,addMembers,removeMember}` family.
  - `timeOff.withdraw` (DELETE on the policy-scoped request path
    is the user-side withdraw flow — paired with the admin
    workspace-level `delete` already stamped).
  - `balances.listForUser` (GET on the per-user
    `/users/{uid}/time-off/balances` plural route returns a list
    of balances across policies; the sibling singular `getForUser`
    returns a single balance object). 170/191 ops = 89% coverage.
  Root-cause analysis (method-name alone hoists ops to the root
  client) + the explicit-allowlist technique are documented in
  `spec/evidence/discrepancies.md` →
  `fern.x-fern-sdk-method-name.drops-resource-modules` (see "Update
  2026-05-24 (session 3)"). README's resource-modules section now
  describes the two name shapes side-by-side; sandbox tests,
  examples (`create-project.ts`, `log-time-entry.ts`,
  `paginate-all.ts`), `iter.ts`'s `KNOWN_PAGINATED_METHODS` drift
  union, doc comments, and per-resource markdown were regenerated
  to match.

## [0.4.0] — 2026-05-24

First release that exercises the rebuilt CI + release pipeline
(SBOM generation, post-publish smoke install, GH Pages docs
deploy). Wraps up the wrapper-side SDK-quality push (Phase 0-8
of the driving plan); the remaining cross-repo G-track lives in
`apet97/go-clockify`.

### Added

- **`withResponse()` ergonomic shim (Phase 1.7).** New
  `clockify-sdk-ts-115/with-response` subpath exposes
  `withResponse(promise) -> { data, response, headers, requestId,
  status }`. Thin wrapper over the synced
  `HttpResponsePromise.withRawResponse()` that lifts the
  X-Request-Id (injected by composedFetch) + status to top-level
  fields for log correlation. Re-exported from the package root.
  Updates: dual-build now asserts 18 names + 6 CJS subpaths;
  baseline `.packsnapshot` regenerated to match the new
  `dist/{esm,cjs}/with-response.{js,d.ts,...}` entries.
- **Sandbox live test refactor (Phase 4.3).** `tests/sandbox.test.ts`
  now constructs the client via `createClockifyClient({ apiKey })`
  instead of the raw `new ClockifyApiClient({ ..., addonToken: cast })`
  pattern — the wrapper-side factory is the documented entry point;
  the live suite should exercise it. Added two new live flows:
  iterAll across projects (asserting no duplicate IDs across pages)
  and withResponse against the tags list (asserting status,
  headers, and request-id propagation).
- **Prettier (Phase 8).** `wrapper/.prettierrc` and
  `wrapper/.prettierignore` enforce consistent formatting on the
  hand-written surface (`wrapper/*.ts`, `tests/`, `scripts/`,
  `examples/`, plus `*.{json,md}` not in the ignore list). The
  synced SDK under `wrapper/src/`, the build output `dist/`, the
  TypeDoc + per-resource `docs/`, the lockfile, and this CHANGELOG
  itself are explicitly ignored. New `npm run format` (apply) and
  `npm run format:check` (verify). prettier `^3.8.3` added as
  devDep. README "Why no linter" section updated to note Prettier
  is now wired alongside `tsc --strict` and `vitest` (Prettier is
  a formatter, not a linter, so the section's claim about ESLint
  still stands). All existing hand-written files reformatted in
  this commit; future PRs are expected to land Prettier-clean.
- **Webhook golden fixtures + fixture-driven tests (Phase 4.2).**
  Four synthesized payloads under
  `wrapper/tests/fixtures/webhook-events/` covering NEW_PROJECT,
  NEW_TIME_ENTRY, TIMER_STOPPED, and
  APPROVAL_REQUEST_STATUS_UPDATED. New
  `tests/webhook-fixtures.test.ts` exercises each fixture in 3
  ways: parses with the matching token, rejects with a wrong
  token, rejects with the header stripped. Fixtures are
  synthesized (not live-probed) — discrepancies entry
  `webhook.signature-scheme.shared-secret-not-hmac-doc-only`
  tracks the open question of swapping for real captures once a
  live probe is captured.
- **Dual-build vitest assertion (Phase 4.4).** New
  `tests/dual-build.test.ts` mirrors the existing shell smoke
  (`scripts/verify-dual-build.sh`) but runs as part of
  `npm test` — devs catch drift between ESM/CJS surfaces during
  the inner dev loop, not just on the `build:smoke` invocation.
  Uses `createRequire` to load the CJS bundle (Vitest's
  CJS-to-ESM interop spreads exports across top-level + default
  keys depending on the emit shape; `createRequire` gives the
  raw `module.exports`). Skipped automatically when dist/ is
  absent (no build → no test).
- **Governance (Phase 6).** Six new files at the repo root /
  `.github/`:
  - `SECURITY.md` — disclosure channels (GitHub private
    advisories preferred, email fallback), 72-hour acknowledgment
    SLA, 14-day fix target for critical, scope clarification
    (wrapper layer in / synced SDK out → upstream Fern or
    GOCLMCP), coordinated-disclosure policy.
  - `CONTRIBUTING.md` — human onboarding pointing at
    `AGENTS.md` for the contract. Covers local dev setup, the
    sync + test loop, sandbox-API testing safety, conventional-
    commits, code style, and the "add a new hand-written module"
    recipe.
  - `.github/ISSUE_TEMPLATE/bug_report.yml` + `feature_request.yml`
    — form schemas that prompt for SDK version, Node version,
    module system, runtime, minimal repro, etc. — no more chasing
    those down in follow-ups.
  - `.github/ISSUE_TEMPLATE/config.yml` — disables blank issues +
    routes off-topic reports (security, Clockify API behaviour,
    upstream spec/generator issues) to the right channel.
  - `.github/pull_request_template.md` — checklist mirroring
    AGENTS.md §4 verify-gates per surface area (wrapper, tests,
    build, examples, docs, CI, governance, discrepancies). Spot-
    checks the rules most often violated.
- **CI hardening (Phase 5.1-5.4).** Extended `.github/workflows/ci.yml`
  with four new gates:
  - **Drift check** — asserts `wrapper/src/` TS file count stays
    in `[700, 800]` after `npm run sync`; catches generator output
    drift early.
  - **Dual-build verification** — runs `npm run build:smoke` after
    every `npm run build`; ensures both ESM and CJS expose all
    17 expected names + all 5 CJS subpaths resolve.
  - **Pack snapshot** — diffs `npm pack --dry-run` output against
    a committed `wrapper/.packsnapshot` baseline (5812 file paths,
    one per line). Catches accidental tarball additions
    (e.g. leaked `.env`, oversized fixture). Baseline regenerated
    via the same pipeline + committed when changes are intentional.
  - **Spec check** (new job) — runs `fern check --warnings
    --from-openapi` against `spec/corrected/`; gates snapshot
    rot independently of the build pipeline.
  - **Bun smoke** (new job) — runs the unit test suite under Bun
    via `oven-sh/setup-bun@v2`. Catches accidental Node-only
    API usage that Vitest under Node masks.
  - **Deno smoke** (new job) — `denoland/setup-deno@v2` runs
    `wrapper/scripts/deno-smoke.ts` against the built ESM output;
    asserts 23 expected names + types resolve under Deno's
    `--node-modules-dir=auto`.
- **Release hardening (Phase 5.7-5.8).** Extended
  `.github/workflows/release.yml` with:
  - **SBOM** — `npm sbom --sbom-format spdx --sbom-type library`
    emits `sbom-vX.Y.Z.spdx.json`, attached to the GitHub Release
    via `gh release upload`. Every tagged version now has an
    SPDX-format SBOM alongside the tarball.
  - **Post-publish smoke install** — pulls the just-published
    version from npm into a clean Docker `node:22-alpine`
    container and verifies 8 names resolve via both `import()`
    and `require()`. Catches "looks fine locally; broken in the
    tarball" gaps that aren't visible until after npm publish.
- **CodeQL security scanning.** New
  `.github/workflows/codeql.yml` runs GitHub's `security-and-quality`
  query suite on push + PR + weekly cron. Scoped to the hand-written
  wrapper surface (`wrapper/*.ts`, `wrapper/tests/**`,
  `wrapper/scripts/**`, `wrapper/examples/**`, `.github/workflows/**`)
  — the synced SDK under `wrapper/src/**` is excluded because any
  finding there belongs upstream in GOCLMCP, not this repo's
  tracker.
- **Dependabot.** New `.github/dependabot.yml` watches
  `wrapper/`'s npm devDependencies and the repo's GitHub Actions
  versions on weekly cadence. Commit-message prefixes
  (`chore(deps)`, `chore(dev-deps)`, `chore(ci)`) align with the
  repo's conventional-commits scheme. Open-PR limits prevent
  dependabot from flooding the queue (5 npm, 3 actions).
- **Per-resource markdown reference** under `wrapper/docs/resources/`
  (31 files, one per resource, plus `README.md` index covering all
  190 methods). Each file has method list + JSDoc snippet +
  compact request-field summary with required/optional + per-field
  description. Generated by `wrapper/scripts/gen-resource-docs.ts`
  (parses `src/api/resources/*/client/{Client.ts,requests/*.ts}`
  with line-by-line regex; no AST dep). Output is **committed**
  (gives PR diffs a clear signal when synced SDK shape changes).
  Chained into `npm run sync` post-step + exposed standalone as
  `npm run docs:resources`. tsx added as devDep for the script
  runner.
- **TypeDoc reference site.** `npm run docs` builds an HTML
  reference for every exported name into `docs/api/` (gitignored
  at the repo root; the new `.github/workflows/docs.yml` builds
  and publishes it to GitHub Pages on every `v*.*.*` tag push).
  Entry points = `index.ts` + every resource client under
  `src/api/resources/`, so all 32 sub-clients + every type
  generate dedicated pages (~1610 HTML files). typedoc added
  as a devDep (`^0.28.19`).
- **`wrapper/examples/` directory** with 9 runnable starter scripts:
  `auth.ts`, `paginate-all.ts`, `log-time-entry.ts`,
  `create-project.ts`, `generate-report.ts`, `upload-image.ts`,
  `verify-webhook.ts`, `middleware-datadog.ts`, `retry-custom.ts`.
  Each imports from `clockify-sdk-ts-115` (package self-reference)
  so copy-pasting into a real project requires no path changes.
  Live-API examples skip cleanly if `CLOCKIFY_API_KEY` is missing
  and use timestamp slugs for safety. The conceptual examples
  (webhooks, middleware, retry) are pure illustrative wiring —
  no API calls.
- **Full README rewrite** with 14 sections (install, quick start,
  auth, resource modules, pagination — three primitives, error
  handling with the full hierarchy table, retries with policy
  override, timeouts + abort, logging, custom fetch + proxy,
  webhooks, middleware/hooks, ESM+CJS, Node+TS versions). Top:
  4-badge row (npm, CI, license, install size). Every code
  example uses the names that landed in Phases 1-2.
- **Per-status error classes re-exported flat** from the package
  root: `BadRequestError`, `UnauthorizedError`, `ForbiddenError`,
  `NotFoundError`, `MethodNotAllowedError`. Consumers can now do
  `import { NotFoundError } from "clockify-sdk-ts-115"` instead of
  the namespaced `ClockifyApi.NotFoundError`. Both forms work.
  `scripts/verify-dual-build.sh` checks 17 expected names per
  module system (was 12).

### Changed

- `iterAll` and `iterPages` no longer constrain `TRequest extends
  PaginatedRequest` — the constraint defeated TypeScript's
  bidirectional inference when callers passed an arrow-function
  wrapper. Pure type relaxation (no runtime behavior change);
  existing code that explicitly typed the fetcher still works.
  Recommended call pattern is now
  `client.foo.bar.bind(client.foo)` which preserves the method's
  full type signature so TS infers both request and item types.
  Documented in the JSDoc + README's pagination section.
- **Dual ESM + CJS build.** The package now ships both module
  systems from `dist/esm/` and `dist/cjs/`. CommonJS consumers can
  `require("clockify-sdk-ts-115")` and get the same surface ESM
  consumers get via `import`. Every subpath
  (`clockify-sdk-ts-115/{create-client, composed-fetch, iter, webhooks,
  pagination}`) is published in both module systems. Each `exports`
  entry uses the modern `{ import: { types, default }, require: {
  types, default } }` triple-tier shape so TypeScript resolves
  ESM types vs CJS types correctly per consumer's `moduleResolution`.
  Build chain is twin `tsc` passes (no bundler dep added):
  `tsconfig.esm.json` → `dist/esm/` and `tsconfig.cjs.json` →
  `dist/cjs/`, then `scripts/finalize-cjs.sh` writes
  `dist/cjs/package.json` with `"type": "commonjs"` so Node treats
  the subtree as CJS regardless of the parent's
  `"type": "module"`. Verification via
  `scripts/verify-dual-build.sh` (now also wired into
  `prepublishOnly`) — asserts 12 expected names resolve through
  both module systems and all 5 subpaths resolve under CJS.
- `publishConfig: { "access": "public", "provenance": true }` in
  `package.json`. The release workflow's `--access public
  --provenance` CLI flags become redundant (kept for defense-in-depth
  but no longer load-bearing). `npm publish` from any environment
  now publishes publicly with sigstore provenance by default.
- `npm run build:smoke` script that re-runs the dual-build
  verification standalone (useful in CI matrix legs).
- `composedFetch()` at the new `clockify-sdk-ts-115/composed-fetch`
  subpath — a `fetch`-compatible wrapper bundling four orthogonal
  concerns: `User-Agent` injection (default
  `clockify-sdk-ts-115/<ver> (Node.js <ver>; <platform> <arch>)`),
  `X-Request-Id` injection (default UUID v4 per request),
  lifecycle hooks (`beforeRequest`, `afterResponse`, `onError`,
  `onRetry`), and a configurable retry policy with all knobs
  exposed (`maxRetries`, `initialDelayMs`, `maxDelayMs`, `jitter`,
  `retryableStatusCodes`, `retryableMethods`, `computeDelay`).
  Honors `Retry-After` and `X-RateLimit-Reset` headers when
  computing the next delay. Each concern is independently
  opt-out / overridable.
- `createClockifyClient()` now **unconditionally wraps the
  underlying fetch with `composedFetch`** so every constructed
  client gets `User-Agent` + `X-Request-Id` headers by default.
  New options on `CreateClockifyClientOptions`: `userAgent`,
  `requestId`, `hooks`, `retryPolicy`. When `retryPolicy` is
  supplied, the factory automatically passes `maxRetries: 0`
  to Fern so the two retry layers don't nest. Backwards-compatible
  for existing callers — only behavior change is the addition of
  the two default headers, which Clockify already tolerates.
- `getRequestIdFromError()` helper exported from
  `clockify-sdk-ts-115/composed-fetch` and the root entry. Extracts
  the `X-Request-Id` from a thrown `ClockifyApiError`'s
  `rawResponse.headers` for log correlation.
- Webhook signature verification at the new
  `clockify-sdk-ts-115/webhooks` subpath. `verifyClockifyWebhook({ headers,
  expectedToken })` returns boolean for explicit handling;
  `constructEvent({ headers, payload, expectedToken })` verifies AND
  parses the JSON payload, throwing `WebhookSignatureMismatchError`
  on mismatch / missing header or `SyntaxError` on invalid JSON.
  Constant-time string compare via `node:crypto`. Accepts headers
  as `Headers`, `Map`, plain `Record`, or `Array<[name, value]>` —
  case-insensitive lookup. Header name exposed as
  `CLOCKIFY_SIGNATURE_HEADER` constant. Scheme: simple shared-secret
  token (32 chars, rotatable via webhook `/token` endpoint, sent as
  `Clockify-Signature-Token`) — NOT HMAC over payload. Source:
  GOCLMCP probe-lab `openapi-fragments/webhooks-a.yaml`; ledger
  entry `webhook.signature-scheme.shared-secret-not-hmac-doc-only`
  captures the doc-vs-live uncertainty (no live probe yet).
- `iterAll()` and `iterPages()` per-resource pagination helpers at
  the new `clockify-sdk-ts-115/iter` subpath. `iterAll` yields items
  flat across page boundaries; `iterPages` yields per-page
  envelopes (`{ items, page, pageSize, hasNextPage }`) for
  resumable pagination and progress UI. Both wrap any
  `(req) => fetcher(req)` callback whose request matches
  `PaginatedRequest` (`page?: number; "page-size"?: number`).
  Ships with a documentary `KnownPaginatedMethod` union +
  `KNOWN_PAGINATED_METHODS` constant covering the 19 currently-known
  paginated `(resource, method)` pairs as of v0.1.0; a CI drift
  assertion (in `tests/iter.test.ts`) verifies each pair still
  exists on a freshly-constructed client. The lower-level
  callback-style `paginate<T>` remains exported from
  `clockify-sdk-ts-115/pagination` for advanced use.
- `createClockifyClient()` factory at the new
  `clockify-sdk-ts-115/create-client` subpath — hides the documented
  `addonToken: (() => undefined) as unknown as () => string`
  workaround behind a discriminated-union options type that enforces
  "exactly one of `apiKey` or `addonToken`" at both compile and
  runtime. Raw `ClockifyApiClient` constructor still exported for
  advanced flows (custom `AuthProvider`, `auth: false`, etc.).
  Ledger entry:
  `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`.
- Package-root entry now re-exports both the synced SDK surface and
  the hand-written helpers (`createClockifyClient`, `paginate`),
  enabling `import { createClockifyClient, ClockifyApiClient,
  paginate } from "clockify-sdk-ts-115"` in one statement. Per-subpath
  imports (`clockify-sdk-ts-115/create-client`,
  `clockify-sdk-ts-115/pagination`) remain for intent-revealing
  imports.

### Changed

- Unified the wrapper-side TypeScript build into a single
  `tsconfig.build.json` (rootDir `.`). Removed
  `tsconfig.pagination.json` (superseded; pagination joins the
  unified config). The `build` script is now a single
  `tsc -p tsconfig.build.json` invocation. Tarball shape: the synced
  Fern code now lives under `dist/src/` (was: flat under `dist/`);
  hand-written modules continue to emit flat at `dist/<name>.js`.
  Public exports (`clockify-sdk-ts-115`,
  `clockify-sdk-ts-115/pagination`, `clockify-sdk-ts-115/create-client`)
  resolve identically to before — only internal package paths moved.

## [0.1.0] — 2026-05-24

Initial publish. TypeScript SDK for the Clockify API, generated
from the canonical Clockify OpenAPI by Fern and wrapped for npm
distribution as `clockify-sdk-ts-115`.

### Added

- 32 resource modules covering 193 Clockify API operations
  (`approvals`, `auditLogReport`, `balances`, `clients`,
  `customFields`, `entityChangesExperimental`, `expenseCategories`,
  `expenseReport`, `expenses`, `files`, `holidays`, `invoiceItems`,
  `invoicePayments`, `invoiceSettings`, `invoices`, `memberProfiles`,
  `policies`, `projects`, `reports`, `roles`, `scheduling`,
  `sharedReport`, `tags`, `tasks`, `timeEntries`, `timeOff`,
  `timeOffPolicies`, `userGroups`, `users`, `webhooks`, `workspaces`).
- `ClockifyApiClient` constructor exposing `X-Api-Key` header auth.
- `page` + `page-size` query parameters on 18 list endpoints,
  surfaced through every paginated `get…` method.
- `clockify-sdk-ts-115/pagination` subpath export with the hand-written
  `paginate<T>` async iterator, filling the gap left by Fern's
  unsupported bare-array pagination.
- Tightened enum surface on `getTimeOffPolicies`:
  `GetTimeOffPoliciesRequestSortOrder` (ASCENDING / DESCENDING),
  `GetTimeOffPoliciesRequestStatus` (ACTIVE / ARCHIVED / ALL).

### Known limitations (carried forward from the spec evidence ledger)

Each item below has a corresponding entry in
`addons-me/fern/spec/evidence/discrepancies.md` with the live
evidence, repro, and current decision.

- **No auto-pagination on bare-array responses.** Fern CLI 5.37.9's
  `x-fern-pagination` offset mode requires an envelope-shaped
  response (`results: $response.<field>`); Clockify's list endpoints
  return bare top-level arrays. Use the
  `paginate()` helper exported from `clockify-sdk-ts-115/pagination`
  (preferred) or write a manual `page` / `page-size` loop. Ledger
  entry: `fern.x-fern-pagination.bare-array-unsupported`.
- **SDK method names are operationId-derived, not CRUDL.**
  E.g. `client.tags.getWorkspacesWorkspaceIdTags(...)` rather
  than `client.tags.list(...)`. Stamping `x-fern-sdk-method-name`
  on operations triggered a Fern bug that silently dropped 12
  resource modules from the TS output; the heuristic is parked
  pending upstream investigation. Ledger entry:
  `fern.x-fern-sdk-method-name.drops-resource-modules`.
- **`addonToken` field typed as required.** Clockify's
  `X-Api-Key` and `X-Addon-Token` auth schemes are mutually
  exclusive at runtime (sending both yields HTTP 401), but Fern's
  current OAS-3.0.3 OR-security inference types both fields as
  required on `BaseClientOptions`. README quick-start shows the
  documented `addonToken: (() => undefined) as unknown as () =>
  string` cast. Ledger entry:
  `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`.

### Generator chain

This release ships from canonical OpenAPI generator commit
`apet97/go-clockify@c4859c9` and Fern CLI `5.37.9` with generator
container `fernapi/fern-typescript-node-sdk:3.71.2`.

[Unreleased]: https://github.com/apet97/clockify-ts-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/apet97/clockify-ts-sdk/releases/tag/v0.1.0
