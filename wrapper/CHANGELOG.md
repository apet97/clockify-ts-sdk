# Changelog

All notable changes to `clockify-sdk-ts-115` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/);
this project will adhere to [Semantic Versioning](https://semver.org/)
once v1.0.0 ships.

## [Unreleased]

### Added

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

### Changed

- Coverage thresholds in `vitest.config.ts` now mirror the measured floor in
  `docs/coverage-contract.json`, so a bare wrapper coverage run enforces the
  same floor as the cross-package ratchet.
- Removed deprecated `findOrCreateClient` from the root barrel (root public
  surface 93 -> 92 names). It remains available from the
  `clockify-sdk-ts-115/ensure` subpath; prefer `ensureClient`.
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

- Added a generated-client HTTP regression test for list wire shapes: projects
  remain bare arrays, invoices remain `{ invoices, total }` envelopes, and the
  in-progress time-entry route keeps `page-size` pagination wired through the
  local mock server.
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
  Probe re-pass against sandbox 65b382b606de527a7ee2b60e on
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
  upstream spec, Fern now generates 27 of the 31 resource modules
  with idiomatic names. **170 ops mapped in total** (90.4% of the
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
