# Changelog

All notable changes to `clockify-sdk-ts` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/);
this project will adhere to [Semantic Versioning](https://semver.org/)
once v1.0.0 ships.

## [Unreleased]

### Changed (BREAKING — gated behind v1.0.0 cut)

- **Idiomatic method names on 19 modules (G.1).** With both
  `x-fern-sdk-group-name` and `x-fern-sdk-method-name` stamped on the
  upstream spec, Fern now generates 19 of the 31 resource modules
  with idiomatic names. 97 ops mapped in total (16 modules on pure
  CRUDL + 3 workflow-verb modules):
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

  The other ~12 modules continue to use operationId-derived names.
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
  `clockify-sdk-ts/with-response` subpath exposes
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
  Each imports from `clockify-sdk-ts` (package self-reference)
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
  `import { NotFoundError } from "clockify-sdk-ts"` instead of
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
  `require("clockify-sdk-ts")` and get the same surface ESM
  consumers get via `import`. Every subpath
  (`clockify-sdk-ts/{create-client, composed-fetch, iter, webhooks,
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
- `composedFetch()` at the new `clockify-sdk-ts/composed-fetch`
  subpath — a `fetch`-compatible wrapper bundling four orthogonal
  concerns: `User-Agent` injection (default
  `clockify-sdk-ts/<ver> (Node.js <ver>; <platform> <arch>)`),
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
  `clockify-sdk-ts/composed-fetch` and the root entry. Extracts
  the `X-Request-Id` from a thrown `ClockifyApiError`'s
  `rawResponse.headers` for log correlation.
- Webhook signature verification at the new
  `clockify-sdk-ts/webhooks` subpath. `verifyClockifyWebhook({ headers,
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
  the new `clockify-sdk-ts/iter` subpath. `iterAll` yields items
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
  `clockify-sdk-ts/pagination` for advanced use.
- `createClockifyClient()` factory at the new
  `clockify-sdk-ts/create-client` subpath — hides the documented
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
  paginate } from "clockify-sdk-ts"` in one statement. Per-subpath
  imports (`clockify-sdk-ts/create-client`,
  `clockify-sdk-ts/pagination`) remain for intent-revealing
  imports.

### Changed

- Unified the wrapper-side TypeScript build into a single
  `tsconfig.build.json` (rootDir `.`). Removed
  `tsconfig.pagination.json` (superseded; pagination joins the
  unified config). The `build` script is now a single
  `tsc -p tsconfig.build.json` invocation. Tarball shape: the synced
  Fern code now lives under `dist/src/` (was: flat under `dist/`);
  hand-written modules continue to emit flat at `dist/<name>.js`.
  Public exports (`clockify-sdk-ts`,
  `clockify-sdk-ts/pagination`, `clockify-sdk-ts/create-client`)
  resolve identically to before — only internal package paths moved.

## [0.1.0] — TBD (initial publish)

Initial publish. TypeScript SDK for the Clockify API, generated
from the canonical Clockify OpenAPI by Fern and wrapped for npm
distribution as `clockify-sdk-ts`.

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
- `clockify-sdk-ts/pagination` subpath export with the hand-written
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
  `paginate()` helper exported from `clockify-sdk-ts/pagination`
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
