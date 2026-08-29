# Contributing to clockify-ts-sdk

Thanks for considering a contribution. This guide is the engineering
contract for the repo: how the packages fit together, which paths are
generated, which gates you run, and the rules that keep releases safe.

The project is independent and community-built. It is **not affiliated
with, endorsed by, or sponsored by CAKE.com or Clockify**. "Clockify" is a
CAKE.com trademark used nominatively; the `-115` / `115` suffixes are
deliberate trademark distance. See [`NOTICE.md`](./NOTICE.md).

## Quick start

```bash
git clone https://github.com/apet97/clockify-ts-sdk.git
cd clockify-ts-sdk

npm ci

# Generate the local SDK core into output/ts-sdk/ and sync wrapper/src/.
make sdk-codegen

# Type-check + dual build + verify ESM + CJS surface
npm run type-check -w clockify-sdk-ts-115
npm run build -w clockify-sdk-ts-115
npm run build:smoke -w clockify-sdk-ts-115

# Test (unit tests + live sandbox flows; live ones skip if
# CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID are absent)
npm test -w clockify-sdk-ts-115
```

`node scripts/repo-doctor.mjs` runs a no-network repo-shape check first if
you want a fast failure before `npm ci`.

## The packages

The repo ships three sibling npm packages, wired as npm workspaces from the
root `package.json` (`workspaces: ["wrapper", "cli", "mcp"]`) with one root
`package-lock.json`. Run every script either as
`npm run <script> -w <package-name>` from the root or from the package
directory.

- **`wrapper/`** → `clockify-sdk-ts-115`. The TypeScript SDK: local-generator
  output plus hand-written ergonomics. Build artifact: `wrapper/dist/`.
- **`cli/`** → `@apet97/clockify-cli-115`. The `clockify115` / `clk115`
  command-line interface on top of the SDK. Output controls are
  `--output table|json|ndjson`, `--compact`, and `--select <dot-path>`.
  Build artifact: `cli/dist/`.
- **`mcp/`** → `@apet97/clockify-mcp-115`. A Model Context Protocol server
  with a local stdio transport and an authenticated stateless HTTP service.
  Every tool has a runtime risk class in `mcp/src/tool-risk.ts`; business,
  external-side-effect, privileged, and destructive writes use the
  exact-stored-preview `dry_run` → `confirm_token` path in `mcp/src/result.ts`
  and `mcp/src/orchestration/confirmation.ts`. `clockify_setup_webhook`
  validates callback URLs through `mcp/src/orchestration/webhook-url.ts`
  before preview or creation; that guard is offline and covers literal
  URL/host/IP risks, not DNS rebinding. Build artifact: `mcp/dist/`.

Current counts (tools, commands, public SDK names) are generated into
`docs/product-surface.json` and the package READMEs by `make product-surface`
and `make readme-tables`. Never type a count by hand.

The corrected spec marks 161/168 operations `x-clockify-live-status:
live-success`, verified against a sandbox workspace; `make docs-counts`
derives that figure, never hand-edit it.

## Runtime semantics you must preserve

These behaviors are public contract. Changing any of them is a breaking
change and needs a changelog entry, a migration note, and a major bump.

### HEADER-001: request headers preserve caller values

`composedFetch` adds the SDK `User-Agent` and a UUID `X-Request-Id` only when
the caller did not supply those headers. A caller-provided value always wins.
Callers can disable either default with `userAgent: false` or
`requestId: false`, or supply a custom User-Agent or request-ID generator.

### PAGE-001: `Last-Page` controls pagination

`iterAll` and `iterPages` treat a parseable `Last-Page` response header as
authoritative. `true` stops the walk. `false` continues after a non-empty
page, even when the page is shorter than the requested size. If the header is
absent or invalid, the iterators use the page length. An empty page always
stops the walk. Callers can set `maxPages` to cap the walk, and the
repeated-page guard stops an exact non-empty page from looping forever.

### ROUTE-002: service routing has two layers

1. **Per-operation.** The corrected OpenAPI carries a `servers` override and
   the generator emits `OperationSpec.baseUrl`, so reports reach
   `reports.api.clockify.me/v1` and audit-log reaches
   `auditlog-api.api.clockify.me/v1` without caller configuration.
2. **Client-level.** A typed `routing` option on `createClockifyClient`
   selects a profile: a bare `ClockifyRegion` (`global | eu | us | uk | au |
   developer`), a `subdomain` profile (region + workspace subdomain, which
   changes only `reports` routing), or `custom` (an explicit
   per-`ClockifyService` URL map, requiring `allowCustomHttpsHosts: true`).

Dispatch precedence is `suppliedBaseUrl > suppliedEnvironment >
serviceBaseUrl > operationBaseUrl > default`. A `custom` profile that names
only `regular` never erases another operation's route.

`routing` is mutually exclusive with the legacy `environment`/`baseUrl`;
`validateRoutingOptions` throws a `TypeError` synchronously at construction so
plain-JS callers get the same defence as TypeScript ones.

**Only `global` is live-confirmed.** Every other profile requires
`acknowledgeUnconfirmedRegion: true`. Do not remove that gate;
`docs/service-routing-matrix.json` records that no regional or subdomain
sandbox workspace exists to prove the others against. `pto.api.clockify.me`
is not allowlisted (zero backing operations); do not re-add it.

The routing table lives in two places on purpose: `wrapper/internal/routing.ts`
holds a hand-written copy of the approved `docs/service-routing-matrix.json`
rows (runtime code does not import the JSON), and
`wrapper/tests/routing-matrix-equality.test.ts` fails closed if they drift.
`authenticated-boundary-fetch.ts` keeps `CLOCKIFY_PROD_HOSTS` in sync the same
way. Change both together.

The CLI exposes this as `--region`/`--subdomain`; CLI and local MCP stdio also
read `CLOCKIFY_REGION`/`CLOCKIFY_SUBDOMAIN`, and the CLI accepts rc-file
`region`/`subdomain`. Precedence is flag > env > rc, mutually exclusive with
`--base-url`/`CLOCKIFY_BASE_URL`. Remote MCP loads each principal's encrypted
credential, workspace, and routing profile from PostgreSQL, fails startup if
local Clockify credential variables are present, and never falls back to a
process-wide key.

### RETRY-001: retries are read-only by default

Both retry layers — the generated request runtime and `composedFetch`'s
`DEFAULT_RETRY_POLICY` — auto-retry only `GET`/`HEAD`/`OPTIONS`. A network
failure or retryable 5xx after a mutation is ambiguous: the server may already
have applied it, so replaying risks a duplicate write.

`PUT`/`DELETE` can opt back in with `retryMutationMethods: true` (client-level
or per-request) or, for `composedFetch`'s own layer, by adding them to
`retryPolicy.retryableMethods`. **`POST`/`PATCH` are excluded from both layers
and cannot be opted in.** This is a deliberate safety default.

When `retryPolicy` is present, `createClockifyClient` passes `maxRetries: 0`
to the generated client, so generated retries are off. `retryPolicy: false`
disables the wrapper layer too. A positive per-request `maxRetries` overrides
the client setting and can re-enable generated retries, so do not combine it
with `retryPolicy`. If `retryPolicy` is absent, `maxRetries` controls the
generated layer.

## The build chain

Each arrow is a script invocation that must succeed before the next stage is
valid. Never run a pack or publish gate with an upstream gate red.

```text
upstream sources (GOCLMCP/docs/openapi/sources/**)
        │  (cd ../GOCLMCP && make gen-openapi)
        ▼
GOCLMCP/docs/openapi/clockify-openapi.yaml  (canonical)
        │  make {openapi,catalog,selfinspect,raw-allowlist}-drift   ← all 4 must exit 0
        │  go test ./internal/tools/...                              ← must pass
        │  cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml \
        │     spec/corrected/clockify.corrected.openapi.yaml
        ▼
spec/corrected/clockify.corrected.openapi.yaml  (frozen snapshot)
        │  npm ci                    ← from the repo root
        │  make sdk-codegen          ← local generator + wrapper sync
        │  make sdk-codegen-drift    ← reproducibility check
        │  make sdk-codegen-test     ← generator fixture/golden tests
        ▼
output/ts-sdk/**  (gitignored; regen wipes the tree)
        │  cd wrapper && npm run sync   (staged copy into wrapper/src/;
        │                                regenerates wrapper/docs/resources/*.md)
        ▼
wrapper/src/**  (gitignored; populated by sync)
        │  npm run type-check / npm test / npm run build / npm run build:smoke
        ▼
wrapper/dist/**  (the packable artifact)
        │  npm pack --dry-run   (compare with <pkg>/.packsnapshot in CI)
        ▼
clockify-sdk-ts-115@<version>.tgz  (published to npm by CI on a tag push)
```

The canonical Clockify OpenAPI is **not** in this repo. The sister project
[apet97/go-clockify](https://github.com/apet97/go-clockify), cloned beside
this repo as `../GOCLMCP/`, generates it from curated sources. The file at
`spec/corrected/clockify.corrected.openapi.yaml` is a snapshot refreshed by
`cp` after every regen there. `make sdk-codegen` needs no Docker, hosted
generator account, or Clockify credentials. Because `output/ts-sdk/**` is
gitignored, a fresh clone needs `make sdk-codegen` before SDK package gates
can run; validators that depend on `wrapper/src/**` skip with a warning when
the tree is absent.

## Verification gates

The root README lists the aggregate gates. The full catalogue, with exact
commands per tier, is in [`docs/quality-gates.md`](./docs/quality-gates.md);
`make help` prints every focused target. The rules that matter most:

- Run `perfect-fast` alone and with credentials blanked:
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`. The
  `performance-budgets` startup checks (`cli-version` ≤600ms,
  `mcp-tools-list` ≤1200ms) flake under CPU contention.
- `perfect-fast` also runs `lint` (including the MCP eslint config), which the
  per-package `type-check`/`test`/`build` scripts do not. Run
  `npm run lint -w <pkg>` before claiming a package green.
- `make contract-gates` is the CI-enforced doc/contract drift suite;
  `make perfect-full` runs it plus the heavy proof (GOCLMCP drift, codegen and
  build determinism, packed-consumer smoke, coverage, mutation-workflow
  wiring).
- Mutation score is measured only by the GitHub **Mutation** workflow. Never
  run Stryker locally.

Per change scope:

| You changed | Run |
|---|---|
| `scripts/generate-sdk-from-openapi.mjs` | `make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison`, then the wrapper type-check/test/build/smoke |
| `wrapper/*.ts` root files or `wrapper/internal/*.ts` | `npm run type-check && npm test && npm run build && npm run build:smoke && npm pack --dry-run` in `wrapper/` |
| `wrapper/scripts/sync-sdk.mjs` | `npm run sync` and confirm the synced file count is plausible |
| `cli/**` | `cd cli && npm run type-check && npm test && npm run build && npm pack --dry-run` |
| `mcp/**` | `cd mcp && npm run type-check && npm test && npm run build && npm pack --dry-run`; for behavior changes also probe `tools/list`, one success envelope, one recovery envelope, and cleanup over stdio or in-memory transport |
| `docs/**` | `make docs-drift docs-index-drift docs-quality` |
| `.github/workflows/**` | `make ci-contract`; lint with `gh workflow view <name>` |
| `wrapper/typedoc.json` | `npm run docs` (regenerates `docs/api/`) |

After any spec or generator change, the full chain above must run end to end
before you push.

## Critical conventions

1. **Never edit `spec/corrected/clockify.corrected.openapi.yaml`.** It is a
   regenerable snapshot. Edits land in the upstream sources
   (`GOCLMCP/docs/openapi/sources/**`) or in the generator script. The only
   legitimate local diff is a straight copy from
   `../GOCLMCP/docs/openapi/clockify-openapi.yaml` after the GOCLMCP generator
   and drift gates are green; run the final full gate with
   `CLOCKIFY_ALLOW_GENERATED_DIFF=1` for that handover.
2. **Before auditing a response type, confirm which schema the operation
   resolves to.** Chase the `$ref` chain from the operation's `200` response.
   `getWorkspaceExpenses` resolves `WorkspaceExpensesDtoV1` →
   `ExpensesWithCountDtoV1` → `ExpenseHydratedDtoV1`, not `ExpenseDtoV1`, and
   the two carry different shapes. A schema whose body is a bare
   `allOf: [Other]` is a shadowing stub, not a definition. See
   `spec/evidence/discrepancies.md`.
3. **Never edit `output/ts-sdk/**` or `wrapper/src/**`.** Both are wiped and
   repopulated by `make sdk-codegen` / `npm run sync`. Hand-written code lives
   at the `wrapper/` root and in `wrapper/internal/`.
4. **Never commit raw probe files** (`spec/evidence/probes/*.{json,hdr}`).
   Promote canonical findings into `spec/evidence/discrepancies.md` and
   reference the probe by relative path.
5. **Never run `npm publish` from a developer laptop.** Publication happens in
   CI on a pushed version tag (`wrapper-v*`/`cli-v*`/`mcp-v*`) through
   `.github/workflows/**`. Changing release triggers, auth, or provenance
   needs explicit maintainer approval.
6. **Never push a tag that does not match the package version.** The release
   workflow's tag-vs-version guard fails the job and leaves a tag to clean up.
7. **All four GOCLMCP drift gates and `go test ./internal/tools/...` must pass
   after every spec change.** The Go tool layer derives its catalog from the
   canonical YAML; skipping a gate is silent data corruption.
8. **No `it.skip` / `test.skip` / `xit` / `xdescribe` in `wrapper/tests/`.**
   Use the env-gated `describe.skip` pattern from `tests/sandbox.test.ts` for
   live tests.
9. **MCP id-slots resolve a name to an id before any write.** Holidays,
   time-off, expenses categories, scheduling, groups `add_member`, and users
   grant/revoke-role tools resolve supported names first. A 24-hex id passes
   through; unresolved or ambiguous names stop before mutation. Arg-shape
   coercion (`zStringList` / `zNumberLike` in `mcp/src/arg-shapes.ts`) keeps
   the model-visible JSON Schema unchanged. Change the tool, its test, and
   the discrepancy ledger together.
10. **CLI/MCP request casts stay at zero.** `make consumer-cast-budget`
    rejects every escape hatch that lets an untyped value reach a generated
    request. Build request unions directly and use `ClockifyRequestBody<T>`
    for typed bodies. Both exception arrays in
    `docs/consumer-cast-budget-contract.json` are empty and stay empty
    without a maintainer decision.

## The wrapper layout

```
wrapper/
├── package.json              ← clockify-sdk-ts-115 manifest
├── tsconfig.json             ← type-check (noEmit; src/**, hand-written *.ts, tests/**)
├── tsconfig.esm.json         ← ESM emit → dist/esm/
├── tsconfig.cjs.json         ← CJS emit → dist/cjs/ (+ scripts/finalize-cjs.sh writes
│                                dist/cjs/package.json {type: commonjs})
├── vitest.config.ts          ← test runner (testTimeout 30s)
├── index.ts                  ← package root — re-exports synced SDK + hand-written helpers
├── create-client.ts          ← createClockifyClient(): exactly-one-auth discriminated union,
│                                env fallback for CLOCKIFY_API_KEY / CLOCKIFY_ADDON_TOKEN,
│                                auto-wraps fetch with composedFetch
├── composed-fetch.ts         ← User-Agent + X-Request-Id injection, lifecycle hooks,
│                                retry policy (Retry-After / X-RateLimit-Reset aware)
├── iter.ts                   ← iterAll + iterPages (Last-Page aware)
├── webhooks.ts               ← verifyClockifyWebhook + constructEvent (Clockify-Signature-Token)
├── pagination.ts             ← low-level paginate<T>
├── with-response.ts          ← { data, response, headers, requestId, status } shim
├── internal/                 ← routing.ts, subdomain-label.ts, authenticated-boundary-fetch.ts
├── scripts/                  ← sync-sdk.mjs, finalize-cjs.sh, verify-dual-build.sh, gen-resource-docs.ts
├── examples/                 ← runnable scripts (not in the tarball)
├── docs/resources/<name>.md  ← generated per-resource docs (committed)
├── .packsnapshot             ← baseline of `npm pack --dry-run` paths
├── tests/                    ← one file per behavior area; sandbox.test.ts is the env-gated live suite
├── src/                      ← gitignored; populated by sync
└── dist/                     ← gitignored; populated by `npm run build`
```

`"files": ["dist", "README.md", "LICENSE"]` whitelists what `npm pack`
includes; `CHANGELOG.md` is intentionally omitted. The governed subpaths in
`package.json` `exports` are listed in `docs/sdk-public-api.json` and kept in
lockstep with the tsconfig aliases and `verify-dual-build.sh` by
`make sdk-public-api`.

The local generator models `apiKey` and `addonToken` as mutually exclusive.
Do not reintroduce the historical
`addonToken: (() => undefined) as unknown as () => string` cast.

## Live tests

Three live sandbox suites run under `scripts/run-live-proof.mjs`, which
provides `CLOCKIFY_API_KEY`, `CLOCKIFY_WORKSPACE_ID`, an exact matching
`CLOCKIFY_LIVE_WORKSPACE_CONFIRM`, and one generated
`clockify115-live-<timestamp>-<random>-` prefix. They skip only when
credentials are wholly absent; partially armed, unconfirmed, or unprefixed
mutation runs fail closed.

- `wrapper/tests/sandbox.test.ts` — SDK-level CRUD, pagination walks,
  `withResponse` headers.
- `cli/tests/sandbox.test.ts` — CLI flows through `main()` in `--json` mode.
- `mcp/tests/sandbox.test.ts` — MCP flows through `InMemoryTransport`,
  including one guarded write through rejection, dry-run preview, and
  one-use execution.

**Never run live tests against a customer workspace.** Every round-trip
creates and deletes records on the pinned sandbox.

When adding live flows: pair create with delete in the same `it`; derive every
mutable name from `CLOCKIFY_LIVE_PREFIX`; keep the entity discoverable by the
dependency-ordered cleanup in `scripts/live/cleanup.mjs`; treat any 401 / 5xx
as a test bug until proven otherwise.

Run `make perfect-live` only in the sacrificial sandbox. The root orchestrator
runs wrapper, CLI, MCP, and GOCLMCP independently, then requires cleanup
success and zero leftovers in one sanitized JSON receipt. Run
`make mcp-remote-live-proof` only after `make mcp-remote-proof`, serialized
with `make perfect-live` (they share one live lock). The broader operation
evidence run is `make live-evidence-campaign`; see
[`docs/live-tests.md`](./docs/live-tests.md) and
[`docs/maintenance-playbook.md`](./docs/maintenance-playbook.md).

## Secret hygiene

- `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` belong in your shell. Never
  commit, echo unredacted, or paste them into issues or chat.
- `make secret-hygiene` catches bare and quoted `KEY=value` forms; `.env*` is
  gitignored. It is best-effort and defers to gitleaks for deep audits.
- `NPM_TOKEN` lives in the repo's GitHub Actions secrets: an automation token
  with Publish scope, rotated after every publish.
- CI uses the per-job `GITHUB_TOKEN` for read-only checkout.

See [`SECURITY.md`](./SECURITY.md) for reporting.

## Commit and branch hygiene

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:`. One
  logical change per commit. Subject ≤ 72 chars, body wrapped at 72.
- Generated code is gitignored; describe the change to the generator, not
  the generated diff (`feat(gen): stamp page+page-size on 21 list endpoints`).
- Open a PR and wait for CI green before merging. Direct pushes to `main` are
  reserved for hotfixes you can defend in writing.
- Do not amend a published commit, skip hooks (`--no-verify`), or bypass
  signing.
- Publication is CI tag-push only; a bare `vX.Y.Z` tag is rejected by
  `make tag-hygiene` and triggers nothing.

## Hard stops

Do not do any of these without explicit maintainer agreement:

- Edit `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**`.
- Change CI, release auth, provenance, or workflow triggers, or edit
  `.github/workflows/release.yml` so a publish could fire without a tag.
- Run live tests against a non-sandbox workspace or post to a production
  webhook.
- Edit the merge/dedup logic of `../GOCLMCP/scripts/gen-clockify-openapi`.
  Adding entries to its data tables (`PATH_PARAM_PATTERNS`,
  `PAGINATED_LIST_OPS`, `TAG_RENAMES`, `LAST_PAGE_HEADER_OPS`,
  `SDK_METHOD_NAMES`, `PHANTOM_PATHS`) is fine.
- Rename the npm packages, or restore a hosted SDK generator as the active
  generation path.
- Force-push, delete branches, or reset `main`.

<!-- BEGIN GENERATED CONTRIBUTOR PROOF MATRIX -->
<!-- Generated from docs/change-impact-contract.json by scripts/generate-contributing-matrix.mjs. Do not edit by hand. -->

## Contributor proof matrix

Use the row whose canonical change-impact scopes match the files being changed. Each proof cell contains copy-paste commands; scope ownership is derived from `docs/change-impact-contract.json`.

| Change surface | Canonical change-impact scopes | Copy-paste proof |
|---|---|---|
| OpenAPI truth and generated SDK | `openapi-truth`<br>`schema-quality`<br>`upstream-drift`<br>`generator-portability`<br>`operation-coverage` | `cd ../GOCLMCP`<br>`make gen-openapi`<br>`make openapi-drift catalog-drift selfinspect-drift raw-allowlist-drift`<br>`go test ./internal/tools/...`<br>`cd ../clockify-ts-sdk`<br>`cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml spec/corrected/clockify.corrected.openapi.yaml`<br>`make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison`<br>`npm run type-check -w clockify-sdk-ts-115`<br>`npm test -w clockify-sdk-ts-115`<br>`npm run build -w clockify-sdk-ts-115`<br>`npm run build:smoke -w clockify-sdk-ts-115`<br>`make openapi-lint operation-coverage` |
| SDK wrapper and public package | `sdk-runtime` | `npm run type-check -w clockify-sdk-ts-115`<br>`npm test -w clockify-sdk-ts-115`<br>`npm run build -w clockify-sdk-ts-115`<br>`npm run build:smoke -w clockify-sdk-ts-115`<br>`npm pack --dry-run -w clockify-sdk-ts-115`<br>`make sdk-public-api sdk-runtime-contract examples-contract wrapper-gates changelog-drift` |
| CLI surface | `cli-surface` | `npm run build -w clockify-sdk-ts-115`<br>`npm run lint -w @apet97/clockify-cli-115`<br>`npm run type-check -w @apet97/clockify-cli-115`<br>`npm test -w @apet97/clockify-cli-115`<br>`npm run build -w @apet97/clockify-cli-115`<br>`npm pack --dry-run -w @apet97/clockify-cli-115`<br>`make cli-contract cli-write-safety changelog-drift` |
| TypeScript MCP surface | `mcp-surface`<br>`mcp-agent-ux` | `npm run build -w clockify-sdk-ts-115`<br>`npm run type-check -w @apet97/clockify-mcp-115`<br>`npm test -w @apet97/clockify-mcp-115`<br>`npm run build -w @apet97/clockify-mcp-115`<br>`npm pack --dry-run -w @apet97/clockify-mcp-115`<br>`make mcp-contract mcp-write-safety changelog-drift` |
| Authenticated MCP remote service | `mcp-remote-service` | `make mcp-gates mcp-remote-proof`<br>`make mcp-container-smoke mcp-container-service-proof`<br>`make env-contract secret-hygiene data-handling security-threat-model observability dependency-boundary`<br>`make changelog-drift` |
| MCP Reports App | `mcp-reports-app` | `make mcp-gates mcp-contract mcp-agent-ux mcp-tool-manifest-drift`<br>`make data-handling security-threat-model mcpb-smoke changelog-drift` |
| Cross-package runtime, configuration, and observability | `observability`<br>`diagnostics`<br>`config-precedence` | `make observability diagnostics config-precedence`<br>`make sdk-runtime-contract cli-contract mcp-contract`<br>`make user-docs docs-index-drift` |
| Documentation, first-run support, and examples | `first-run-support`<br>`docs-and-contracts`<br>`axioms-contract`<br>`docs-quality`<br>`snippet-safety`<br>`quickstart-receipt`<br>`support-bundle`<br>`issue-intake`<br>`examples-matrix`<br>`acceptance-scenarios`<br>`operator-onboarding`<br>`operator-toolbox`<br>`naming-taxonomy` | `make workflow-cookbook acceptance-scenarios examples-matrix`<br>`make diagnostics support-bundle issue-intake`<br>`make axioms-contract naming-taxonomy`<br>`make snippet-safety docs-quality user-docs docs-index-drift docs-drift`<br>`make contract-inventory change-impact` |
| Security, data handling, and live/test lifecycle | `security-threat-model`<br>`data-handling`<br>`live-proof`<br>`test-data-lifecycle`<br>`mutation-safety` | `make secret-hygiene data-handling security-threat-model`<br>`make live-safety test-data-lifecycle mock-contract`<br>`make mutation-safety`<br>`make fixture-mock-parity cassettes` |
| Release, compatibility, and supply chain | `release-ci-supply-chain`<br>`breaking-change-review`<br>`release-readiness` | `make package-contract supply-chain release-support-contract`<br>`make release-readiness version-policy tag-hygiene ci-contract`<br>`make breaking-change-review changelog-drift`<br>`node scripts/check-npm-audit.mjs` |
| Runtime floor and dependency changes | `dependency-license`<br>`performance-calibration`<br>`maintenance-playbook` | `make repo-doctor developer-environment runtime-support`<br>`make dependency-boundary dependency-license performance-budgets`<br>`make maintenance-playbook change-impact` |
| Receipts and compatibility evidence | `receipt-examples` | `make observability diagnostics`<br>`make sdk-runtime-contract cli-contract mcp-contract compatibility-contract` |

<!-- END GENERATED CONTRIBUTOR PROOF MATRIX -->

## What ships, what doesn't

- ✅ **Hand-written modules** under `wrapper/` root (`index.ts`,
  `create-client.ts`, `composed-fetch.ts`, `iter.ts`, `webhooks.ts`,
  `pagination.ts`) — edit freely; tests in `wrapper/tests/` cover them.
- ❌ **Synced SDK** under `wrapper/src/**` — wiped on every
  `make sdk-codegen`. Don't edit; fix generated shape in the local
  generator (`scripts/generate-sdk-from-openapi.mjs`) or fix API truth
  in the spec-generator at
  [apet97/go-clockify](https://github.com/apet97/go-clockify).
- ❌ **OpenAPI snapshot** at `spec/corrected/clockify.corrected.openapi.yaml`
  — regenerable; edits land in the upstream sources at
  `../GOCLMCP/docs/openapi/sources/**` or in the generator script.

## Live API testing

Never run live gates against a customer or production workspace. Use only the
pinned sacrificial workspace. The live gates create and delete real records.

Set the API key and workspace ID for that workspace. Set
`CLOCKIFY_LIVE_WORKSPACE_CONFIRM` to the exact same workspace ID. Do not print
or commit these values.

Run the root gate:

```bash
make perfect-live
```

The gate validates the workspace confirmation before it writes data. It runs
all governed live surfaces and performs cleanup. A successful receipt must
report zero leftovers.

Do not run a package test command as a live-test shortcut. Without the live
variables, package tests skip their live cases and run deterministic tests
only. See [`docs/live-tests.md`](./docs/live-tests.md) for the full safety and
cleanup contract.

## Conventions

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`,
`build:`. Subject ≤ 72 chars. Body wrapped at 72.

```
feat(wrapper): add createClockifyClient() factory

The factory hides the addonToken cast workaround...
```

### Pull requests

- Run `npm run type-check && npm run build && npm run build:smoke
  && npm test && npm pack --dry-run` locally before opening a PR.
- Reference the relevant section of this guide in the description.
- For any spec/runtime discrepancy your change touches, add or
  update an entry in
  [`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md)
  using the five-question format.
- The PR template at `.github/pull_request_template.md` has the
  full check-list.

### Code style

- TypeScript strict mode, ES2022 target, NodeNext module resolution.
- 4-space indentation in hand-written modules (matches the synced
  SDK).
- No `console.log` in shipped code. `console.warn` for best-effort
  failures (hook fallbacks). `console.error` only in scripts /
  examples.
- No `it.skip` / `test.skip` / `xit` / `xdescribe` in
  `wrapper/tests/`. Use the env-gated `describe.skip` pattern from
  `tests/sandbox.test.ts` for live tests, but never skip silently.

### Adding a new hand-written module

Recipe:

1. Drop the `.ts` at `wrapper/` root (outside `src/`).
2. Add it to `tsconfig.json` `include`,
   `tsconfig.esm.json` `include`, `tsconfig.cjs.json` `include`.
3. Add a subpath entry in `package.json` `exports` with both
   `import` and `require` conditions (each with `types` + `default`).
4. Re-export from `wrapper/index.ts` for the one-import-fits-all DX.
5. Add the symbol names to `scripts/verify-dual-build.sh`'s
   `surface` array so the CI smoke catches missing exports.
6. Write tests at `wrapper/tests/<module>.test.ts`.

The twin `tsc` build picks up the new file automatically.

### Deprecating a public symbol

Two-phase soft removal: add the warning in the version that intends
to break, then delete the symbol in the next major.

1. Tag the declaration with a JSDoc `@deprecated` note in the form
   `@deprecated since vX.Y.Z — use <replacement> instead.` Tooling
   (IDE strikethrough, tsdoc, generated docs) picks this up
   automatically.
2. At the runtime entry of the deprecated function, call
   `warnOnce(key, message)` from `clockify-sdk-ts-115/deprecation`:

   ```ts
   import { warnOnce } from "clockify-sdk-ts-115/deprecation";

   /** @deprecated since v0.7.0 — use `newName` instead. */
   export function oldName(...args: A): R {
       warnOnce(
           "oldName",
           "`oldName` is deprecated; use `newName` instead (since v0.7.0)",
       );
       return newName(...args);
   }
   ```

   `key` is an opaque dedup token — typically the deprecated symbol's
   name. Fires `console.warn` at most once per process per key.
   Silent under `NODE_ENV === "test"`.
3. Land the rename in the same commit as the deprecation; the
   `[Unreleased]` CHANGELOG entry goes under **Deprecated** with a
   one-liner pointing to the replacement.
4. Remove the symbol entirely in the next major version. The
   matching CHANGELOG entry goes under **Removed**.

### Releasing a new version

Tag-day checklist. Every step matters; CI gates most of it but the
sequencing is human.

1. **Drain `[Unreleased]`** — every commit since the last tag
   should have a corresponding CHANGELOG entry. Rename the section
   to `[X.Y.Z] — YYYY-MM-DD` (today's date) and create a fresh
   empty `[Unreleased]` above it.
2. **Bump the version** in `wrapper/package.json`. If the bump
   adds public API surface but no breaking changes, it's a SemVer
   minor (`0.6.0 → 0.7.0`). If it changes default behavior or
   removes any export, it's a major (`0.6.0 → 1.0.0` once we
   leave the 0.x line).
3. **Do not hand-edit `PACKAGE_VERSION`.** The `User-Agent` version comes
   from `wrapper/generated/version.ts`, which
   `scripts/generate-package-versions.mjs` derives from `package.json` and
   which every `type-check`/`build`/`test` script regenerates. Bumping
   `package.json` is the whole change.
4. **Run the full chain locally**:
   ```bash
   cd wrapper
   npm run prepublishOnly   # sync + type-check + clean + build + smoke
   npm test                 # 55 test files under tests/
   npm run test:types       # 4 type-assertion files under tests/types/
   npm run lint             # eslint clean
   npm run size             # bundle ceilings green (local; not a CI job)
   ```
5. **Open a `chore(release): vX.Y.Z` PR**. Title + body match the
   CHANGELOG entry. Wait for all CI checks to pass — Workspace CI (the
   `packages` matrix on Node 22.13 + 24, and the `contracts` job), CodeQL,
   and Docs.
6. **Merge** (squash). Pull `main`.
7. **Tag + push** the version. Tags are package-prefixed
   (`wrapper-v*` / `cli-v*` / `mcp-v*`); a bare `vX.Y.Z` tag is rejected by
   `make tag-hygiene` and triggers nothing:
   ```bash
   git tag -a wrapper-vX.Y.Z -m "wrapper-vX.Y.Z"
   git push origin wrapper-vX.Y.Z
   ```
   The `release.yml` workflow fires on the tag push and publishes
   to npm with provenance (OIDC), generates an SBOM (SPDX JSON),
   and attaches it to the GitHub release.
8. **Verify on npm**:
   ```bash
   npm view clockify-sdk-ts-115 version  # should be vX.Y.Z
   npm view clockify-sdk-ts-115 dist.signatures  # provenance present
   ```
9. TypeDoc deploys on pushes to `main` or a manual Docs workflow dispatch.
   Do not assume a `wrapper-v*`/`cli-v*`/`mcp-v*` release tag triggers
   `docs.yml`. Wait ~2 minutes after a docs deployment, then verify at the
   project's GitHub Pages URL.

### Debugging tips

- **Live test failures**: `tests/sandbox.test.ts` skips cleanly
  when `CLOCKIFY_API_KEY` / `CLOCKIFY_WORKSPACE_ID` are absent.
  When debugging a live failure, run only that file:
  `npx vitest run tests/sandbox.test.ts -t "<test name>"`. The
  test logs the workspace ID it's hitting; double-check it's a
  sandbox before re-running.
- **Correlating a failure with server logs**: every request
  carries an auto-generated `X-Request-Id`. Catch the error and
  extract it:
  ```ts
  catch (err) {
      console.error("request id:", getRequestIdFromError(err));
  }
  ```
  Forward that ID to Clockify support for fastest triage.
- **Reproducing a sync drift**: if a `wrapper/src/**` change broke
  something, the most reliable repro is to roll the GOCLMCP
  generator back to the prior commit, regen, and `npm run sync`
  to see the old shape side-by-side.
- **Bundle size regression**: `npm run size` shows the current
  size per entrypoint. If it failed, the offending file path is
  in the output — usually it's a stray heavy import in a
  hand-written module.
- **Tarball drift**: `npm pack --dry-run` shows what would ship.
  Diff against `.packsnapshot` (the CI gate) to see the delta.
  Intentional additions: regenerate the snapshot
  (`npm pack --dry-run --json | node -e ... > .packsnapshot`).

## Reporting bugs / requesting features

Use the issue templates at
`.github/ISSUE_TEMPLATE/`. Form-based — they prompt for the SDK
version, Node version, repro, etc., so we don't have to chase
those down in a follow-up.

For **security** issues, follow [SECURITY.md](./SECURITY.md) —
**not** a public issue.

## Code of Conduct

Be kind. Disagree with code, not people. Assume good faith.
Specific incidents → `petkovic.aleksandar037@gmail.com`.
