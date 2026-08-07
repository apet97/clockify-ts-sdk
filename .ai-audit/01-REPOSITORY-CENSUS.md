# 01 — REPOSITORY CENSUS

Observed facts first; inferred responsibilities are labeled `(inferred)`.

## Root

| Item | Observed content | Notes |
|---|---|---|
| `package.json` | npm workspaces root; private; `workspaces: [wrapper, cli, mcp]`; engines `node >=22.13.0`; devDeps: stryker, vitest 4.1.10 (override), esbuild, markdown-it, qs (override), tsx, yaml, github-slugger; scripts: type-check/build/test across the 3 workspaces + `test:codegen` | |
| `package-lock.json` | single lockfile; all three packages at 1.0.1 | |
| `Makefile` | ~100 targets (see `10-TEST-AND-GATE-MATRIX.md`); the gate authority is `scripts/verify.mjs` + `scripts/lib/verify-plan.mjs` | `(inferred)` Makefile help is the operator surface |
| `AGENTS.md` / `CLAUDE.md` | 50.6 KB / 13.4 KB contributor contracts; both claim to bind humans and agents | Evidence of intent, not truth (per audit rules) |
| `README.md` | workspace overview; status table; build chain | |
| `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE.md` | process/security/trademark docs | |
| `.gitignore` | macOS, probes, node_modules/coverage, `/output/ts-sdk/`, `/docs/api/`, `.claude/*` except skills, `.recon/`, `.env*`, `*.mcpb`, `/wrapper/generated/`, `/cli/src/generated/`, `/mcp/src/generated/`, `/scripts/live/.manifest-work/`, `/.ai-audit/` (added by this audit) | |
| `.release-please-manifest.json`, `release-please-config.json` | retained but retired (release-please handoff, 2026-07-27); `make version-consistency` reconciles | |
| `.editorconfig` | 4-space, utf-8 | |
| `.github/` | 8 workflows (ci, release, ci-cli-release, ci-mcp-release, docs, mutation, codeql, sandbox-key-health) + dependabot.yml | See `08-CLI-AUDIT.md` W-1..W-4 |
| `.claude/skills/` | 4 repo-local skills (add-mcp-tool, navigate, publish, verify) | |
| `.recon/`, `.remember/`, `.worktrees/`, `.ai-audit/` | local agent scratch / audit pack; gitignored | |

## `spec/` — OpenAPI evidence (observed)

- `spec/corrected/clockify.corrected.openapi.yaml` — 24,339 lines; 168 ops
  (no duplicate operationIds); 113 paths; 405 component schemas; 31 tags;
  methods: 49 GET / 52 POST / 29 PUT / 23 DELETE / 15 PATCH; 11 per-op
  `servers` overrides (10 reports + 1 auditlog); `x-clockify-live-status`:
  161 live-success / 6 probe-documented / 1 documented; `x-fern-sdk-group-name`
  + `x-fern-sdk-method-name` on 149 ops / 27 groups; 21 ops stamped
  `page`+`page-size`; 18 ops stamped `x-clockify-last-page-header`.
  Extension keys present: `x-clockify-{empty-body-is-valid, evidence, host,
  last-page-header, live-status, mcp-tools, notes, raw-unit-notes, risk,
  security-aliases, source-files}`, `x-fern-sdk-{group-name,method-name}`,
  `x-inferred-method-path`, `x-openai-isConsequential`.
  `x-clockify-mcp-tools` is present on all 168 ops but ALWAYS an empty array
  (finding S-09, evidence-pack addition).
- `spec/official/` — official snapshot (27,545 lines), used by drift gates.
- `spec/evidence/discrepancies.md` — 3,731-line ledger; 79 `### \`slug\``
  anchors. `spec/evidence/generator-comparison.md` (marked HISTORICAL),
  `fixtures/`, `probes/README.md` (probes gitignored), `live-evidence-manifest.json`
  (168 rows: 134 live-success / 19 probe-documented / 15 documented;
  attests canonicalCommit `1dc0392…`), `live-evidence-approval.json`,
  `live-evidence-currentness.json`, `live-evidence-campaign-receipt.json`.
- `spec/fern/` — historical Fern config (retained for evidence; not active).

## `wrapper/` — package `clockify-sdk-ts-115` v1.0.1 (observed)

- `src/` — 680 generated TS files (gitignored; repopulated by `npm run sync`
  from `output/ts-sdk/`). Structure: `core/` (request.ts, fetcher/, headers,
  url/, logging/, json, base64, file/, form-data-utils/, runtime/, auth/),
  `errors/`, `api/errors/`, `api/resources/<30 groups>/client/{Client.ts,
  requests/*.ts}`, `api/types/*.ts`, `Client.ts` (30 resource getters + fetch
  passthrough), `BaseClient.ts`, `environments.ts`.
- Hand-written root modules (21): `index.ts`, `create-client.ts`,
  `composed-fetch.ts`, `iter.ts`, `pagination.ts`, `paginated-list.ts`,
  `with-response.ts`, `webhooks.ts`, `webhook-url.ts`, `webhook-events.ts`,
  `errors.ts`, `error-codes.ts`, `deprecation.ts`, `health.ts`,
  `diagnostics.ts`, `rate-limit.ts`, `request-options.ts`,
  `operation-receipt.ts`, `money.ts`, `invoice-body.ts`, `dates.ts`,
  `resolve.ts`, `ensure.ts`, `reports.ts`, `bulk.ts`, `compose.ts`,
  `expense-list.ts`, `otel-hooks.ts`, `scoped-client.ts`, `requests.ts`,
  `generated/version.ts` (31 files incl. generated).
- `internal/` (4): `routing.ts`, `subdomain-label.ts`,
  `authenticated-boundary-fetch.ts`, `host-env.ts`.
- `scripts/` (4): `sync-sdk.mjs`, `verify-dual-build.sh`, `finalize-cjs.sh`,
  `gen-resource-docs.ts`.
- `tests/` — 56 runnable test files + 4 `.test-d.ts` type tests +
  `live-sandbox-support.ts`; ~15,900 lines. `sandbox.test.ts` is env-gated
  live (7 flows).
- `docs/resources/*.md` — auto-generated per-resource docs (30 resources).
- `examples/` — runnable starters incl. `sdk-helper-cookbook.ts`.
- `stryker.conf.json` — mutation scope: 10 hand-written modules governed.
- Package surface: 93 root symbols; 27 named subpaths + root; dual ESM/CJS;
  `files: [dist, README.md, LICENSE]`; `.packsnapshot` pins tarball contents.
- `coverage/`, `reports/mutation/` — gitignored stale local artifacts.

## `cli/` — package `@apet97/clockify-cli-115` v1.0.1 (observed)

- `src/` — 35 files: `index.ts` (22 top-level groups, 9 global flags),
  `client.ts`, `config.ts`, `output.ts`, `error-codes.ts`, `receipt.ts`,
  `duration.ts`, `completions.ts`, `generated/version.ts`, and 25 files under
  `commands/` (api, approvals, auditlog, balanceAssignment, clients, doctor,
  entries, expenses, helpers, invoices, leaf-command, log, projects, reports,
  resolve-refs, scheduling, sharedReports, start, status, stop, tags, tasks,
  timeoff, types, users, webhooks).
- Surface: 66 documented commands (64 terminal leaves + help + version);
  leaf risk: 29 read / 25 write / 10 destructive (per
  `docs/cli-write-safety-contract.json`).
- `tests/` — 40 files; `sandbox.test.ts` env-gated live (12 flows);
  `mutation-leaves.test.ts` (30-case pin — see C-1).
- `examples/` — 6 shell scripts (incl. broken `daily-timesheet.sh`, see C-4).
- Bins: `clockify115`, `clk115`. Config: `clockifyrc.json` / `.clockifyrc.json`,
  `CLOCKIFY_HOME`, env `CLOCKIFY_API_KEY` etc.

## `mcp/` — package `@apet97/clockify-mcp-115` v1.0.1 (observed)

- `src/` — 62 files: `server.ts`, `client.ts`, `result.ts`, `tool-risk.ts`
  (162-entry risk registry), `arg-shapes.ts`, `scope-filter.ts`,
  `error-codes.ts`, `diagnose.ts`, `output-schema.ts`, `prompts.ts`,
  `resources.ts`, `request-cancellation.ts`, `generated/version.ts`,
  `orchestration/{confirmation,webhook-url}.ts`, `agent-docs/{catalog,search}.ts`,
  `tools/**` (21 domain groups + workflows/).
- Surface: 162 tools = 22 workflow + 140 domain; risk classes:
  read 64, routine_write 26, business_write 41, external_side_effect 5,
  privileged 5, destructive 21; 72 guarded (dry_run/confirm_token), 90 open.
- `tests/` — 78 files incl. `sandbox.test.ts` (env-gated live, 12 flows),
  `tool-manifest.test.ts`, `confirm-guard-matrix.test.ts` (33 guarded tools),
  `webhooks-ssrf.test.ts`.
- `manifest.json` (mcpb one-click bundle config), `scripts/` (generate-tool-manifest,
  introspect-harness, assert-clean-prefixes, build-mcpb), `examples/`,
  `media/`, `POSITIONING.md`.
- Bin: `clockify115-mcp`. Exports: root, `./server`, `./client`.

## `scripts/` — 266 files (observed)

- `sdk-codegen/` — the repo-owned TypeScript generator:
  `generate-sdk-from-openapi.mjs`, `model.mjs`, `emitter.mjs`,
  `safe-output.test.mjs`, `test-generate-sdk-from-openapi.mjs`, fixtures.
- `live/` — `orchestrator.mjs`, `cleanup.mjs` (17 entity types, prefix-scoped),
  `run-live-proof.mjs`, `generate-live-evidence-manifest.mjs`, lock files.
- ~90 gate checkers (`check-*.mjs`) — two families: (a) real proof
  (cli-write-safety, ci-contract, release-dispatch-guard, performance-budgets,
  mutation-score, version-consistency, tag-hygiene, sandbox-key-health,
  docs-counts, openapi-lint, …); (b) marker-only contract gates (G-3).
- `plan.mjs` + per-topic `*-plan.mjs`/`*-report.mjs` (acceptance, change-impact,
  contract-inventory, examples, maintenance, onboarding, performance-calibration,
  release-decision, risk-status, workflow) — library-style, no new standalone CLIs.
- `verify.mjs` + `lib/verify-plan.mjs` — fast/full/live/release command plans
  with a tracked-file mutation guard.
- `mock-clockify-server.mjs`, `update-readme-tables.mjs`,
  `generate-package-versions.mjs`, `import-live-evidence-manifest.mjs`,
  `registry-smoke.mjs`, `release-state.mjs`, `release-attestation.mjs`,
  `build-mcpb.mjs`, `repo-doctor.mjs`, `secret-hygiene.mjs`, …

## `docs/` — 242 files (observed; 126 md, 116 json)

- Contracts consumed by gates: `cli-contract.json`, `cli-commands.json` (66),
  `cli-write-safety-contract.json` (35 mutating leaves),
  `mcp-tool-manifest.json`, `mcp-tools.json` (162),
  `operation-parity.json` (168; 104 tsMcp), `sdk-public-api.json` (93/28),
  `service-routing-matrix.json`, `docs-counts-contract.json`,
  `env-contract.json`, `config-precedence-contract.json`, `ci-contract.json`,
  `examples-contract.json`, `aggregate-gates-contract.json`,
  `live-safety-contract.json`, `mutation-safety-contract.json`,
  `error-codes.json`, `product-surface.json`, `openapi-operations.json`,
  `openapi-source-lock.json`, `live-evidence-{manifest,currentness,approval}.json`,
  `operation-evidence-anchor-inventory.json` (78 anchors),
  `operation-evidence-semantic-contract.json`, `operation-evidence-map.json`,
  `operation-dispositions.json`, `sdk-operation-naming-classifications.json`.
- Guidance: `product-north-star.md`, `roadmap-1.0.md`, `release-decision.md`,
  `migration-guide.md`, `quality-gates.md`, `spec-confidence.md`,
  `spec-diff-official.md`, `live-evidence-index.md`, `openapi-operations.md`,
  `operation-parity.md`, `error-codes.md`, `mcp-backlog.md`, `axioms.md`,
  `conformance.md`, `risk-register.md`, `gate-tiers.md`,
  `unique-claim-inventory-policy.md`, `one-point-zero-surface-inventory.md`,
  `troubleshooting.md`, `workflow-cookbook.md`, `acceptance-scenarios.md`,
  `examples-matrix.md`, `security-threat-model.md`, `supply-chain.md`,
  `dependency-boundary.md`, `observability.md`, `diagnostics.md`,
  `support-bundle.md`, `issue-intake.md`, `ci-policy.md`,
  `mutation-safety-policy.md`, `live-safety-contract.md`, `test-matrix.md`,
  `maintenance-playbook.md`, `contract-inventory.md`, `decision-records.md`,
  `data-handling.md`, `version-policy.md`, `contributing-matrix.md` …
- `docs/decisions/` (6 ADRs), `docs/gotchas/` (9), `docs/agent-tasks/` (7),
  `docs/roadmap-1.0-receipts/` (27 receipts).
- `docs/api/` — gitignored TypeDoc output (not present).

## `output/ts-sdk/` — gitignored generated tree

Regenerated by `make sdk-codegen`; `wrapper/src` mirrors it via `npm run sync`.
Present on disk; used as evidence only through `docs/operation-parity.json`
and the synced `wrapper/src`.

## Build artifacts (observed, gitignored)

`node_modules/` (root + 3 workspaces), `wrapper/dist/`, `cli/dist/`,
`mcp/dist/`, `wrapper/coverage/`, `cli/coverage/`, `mcp/coverage/`,
`mcp/reports/`, `wrapper/reports/`, `*.mcpb`, `wrapper/generated/`,
`cli/src/generated/`, `mcp/src/generated/` (version constants, regenerated on
every npm script).

## Dependency footprint (observed)

Runtime deps: wrapper = 0 (generated code is self-contained; Node builtins
only); cli = commander, picocolors, and SDK peer; mcp = @modelcontextprotocol/
sdk, zod, and SDK peer. Root devDeps carry the tooling. `overrides` pin vitest
and qs (the latter for `typed-rest-client@2.3.1`).
