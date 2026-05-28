# clockify-ts-sdk — Clockify TypeScript SDK, CLI, and MCP

Standalone repo (`apet97/clockify-ts-sdk`). Ships the packable package
**`clockify-sdk-ts-115`** from `wrapper/dist/`, plus two sibling
packable packages on top of it: `@clockify115/cli` from `cli/dist/`
and `@clockify115/mcp-server` from `mcp/dist/`. Everything else is the
toolchain that produces and proves those packages: a Fern workspace
(`spec/fern/`), a snapshot of the canonical Clockify OpenAPI
(`spec/corrected/`), an evidence ledger for spec-vs-live deltas
(`spec/evidence/discrepancies.md`), the regenerable raw generator
output (`output/ts-sdk/`, gitignored), and docs that keep humans
and agents aligned.

The canonical OpenAPI is **not** in this repo. It lives in the
sister project `apet97/go-clockify` (cloned conventionally as
`../GOCLMCP/`), which produces it from a curated source bundle via
`make gen-openapi`. This repo snapshots that canonical and feeds
it to Fern, which doubles as a strict smoke test for the spec:
schema / enum / `oneOf` / pagination patterns must be coherent
enough for Fern to emit a clean SDK.

End-users of the SDK package: see [`wrapper/README.md`](./wrapper/README.md).
MCP users: see [`mcp/README.md`](./mcp/README.md). This file is for
contributors and agents working on the spec, SDK, CLI, and MCP
toolchain.

The default release path is local tarballs (`npm pack`) for sharing inside the project, not public npm publication. Publishing requires explicit maintainer approval.

## Getting started (fresh clone)

The three packages are wired as **npm workspaces** from a root
`package.json`, so a single `npm ci` at the root populates all of
them. `output/ts-sdk/` is gitignored, so SDK package gates need
Fern + Docker before they can run:

```bash
git clone https://github.com/apet97/clockify-ts-sdk.git
cd clockify-ts-sdk
npm ci                                                      # install all 3 workspaces

# SDK source comes from Fern → wrapper/src via sync. Docker required.
npm install -g fern-api@5.37.9
(cd spec/fern && fern generate --group ts --local --force)
(cd wrapper && npm run sync)

make perfect-fast                                           # 76 sub-gates, ~317 tests
```

If you only touch CLI or MCP code, you still need the wrapper built
once because cli + mcp resolve `clockify-sdk-ts-115` through the
workspace symlink. After the first `fern generate` + `npm run sync`
+ `npm run build -w clockify-sdk-ts-115`, subsequent
`cd cli && npm test` (or `cd mcp && npm test`) cycles are fast.

For agents and operators who can't run Docker but want to read or
plan: the validators that depend on `wrapper/src/**` skip with a
clear "run fern generate first" warning instead of failing, so
`make perfect-fast` still completes on non-SDK workflows. Use
`node scripts/plan.mjs <topic>` for no-network planning surfaces
(see [`docs/operator-toolbox.md`](./docs/operator-toolbox.md)).

## One-command gates

The repo now exposes root-level commands for non-coder operation and
future-agent handoff:

```bash
make help           # show the available gates
make perfect-fast   # local deterministic SDK/CLI/MCP package proof
make perfect-full   # GOCLMCP drift + Fern + packages + packed-consumer smoke
make perfect-live   # explicit sandbox/live cleanup proof
```

The gate map lives in [`docs/quality-gates.md`](./docs/quality-gates.md).
The shared SDK/CLI/MCP metadata surface lives in
[`docs/product-surface.json`](./docs/product-surface.json), with the
human-readable table in
[`docs/product-surface.md`](./docs/product-surface.md). Regenerate both
with:

```bash
make product-surface
```

The shared error/recovery registry lives in
[`docs/error-codes.json`](./docs/error-codes.json), with generated
human-readable docs in [`docs/error-codes.md`](./docs/error-codes.md):

```bash
make error-docs
```

The OpenAPI operation inventory is generated from the corrected
snapshot into [`docs/openapi-operations.json`](./docs/openapi-operations.json)
and [`docs/openapi-operations.md`](./docs/openapi-operations.md):

```bash
make openapi-operations
```

The best-effort operation/tool parity join across OpenAPI, SDK naming,
TS MCP, and GOCLMCP lives in
[`docs/operation-parity.json`](./docs/operation-parity.json) and
[`docs/operation-parity.md`](./docs/operation-parity.md):

```bash
make operation-parity
```

OpenAPI lint and generator-independence checks are local substitutes
for paid generator-platform guardrails:

```bash
make openapi-lint
make generator-independence
make generator-comparison
```

The CLI and MCP README tables are generated from
[`docs/cli-commands.json`](./docs/cli-commands.json) and
[`docs/mcp-tools.json`](./docs/mcp-tools.json):

```bash
make readme-tables
```

Operator-facing install, migration, dependency, and troubleshooting
docs live under [`docs/`](./docs/README.md). Troubleshooting is
generated from the shared error registry:

```bash
make troubleshooting
```

## Layout

```
clockify-ts-sdk/
├── spec/
│   ├── corrected/clockify.corrected.openapi.yaml   ← snapshot of GOCLMCP canonical
│   ├── official/clockify.official.openapi.yaml      ← copy of upstream source
│   ├── fern/{fern.config.json, generators.yml}     ← Fern workspace
│   └── evidence/
│       ├── discrepancies.md                         ← five-question ledger
│       ├── fern-issues/                             ← drafted upstream issues (internal evidence)
│       ├── fixtures/                                ← curated golden response shapes
│       └── probes/                                  ← raw live API captures (gitignored)
├── output/{ts-sdk,py-sdk,postman}/                  ← generator outputs, all gitignored; ts-sdk regenerable via Fern + Docker
├── wrapper/                                         ← packable SDK package layout
├── cli/                                             ← packable CLI package layout
├── mcp/                                             ← packable stdio MCP package layout
├── scripts/                                         ← root orchestration/check/generation helpers
├── Makefile                                         ← one-command local/full/live gates
└── docs/
    ├── axioms.md                                    ← SDK/CLI/MCP product rules
    ├── error-codes.{json,md}                        ← shared recovery vocabulary
    ├── openapi-operations.{json,md}                 ← generated operation inventory
    ├── operation-parity.{json,md}                   ← generated SDK/MCP parity join
    ├── operation-parity-overrides.json              ← curated non-mechanical parity joins
    ├── cli-commands.json + mcp-tools.json           ← generated README table inputs
    ├── install-personas.md                          ← SDK/CLI/MCP installation paths
    ├── migration-guide.md                           ← package/import/auth migration notes
    ├── dependency-policy.md                         ← tooling/runtime update rules
    ├── troubleshooting.md                           ← generated recovery guide
    ├── performance-budgets.json                     ← package/startup budget ceilings
    ├── product-north-star.md                        ← final-state quality bar
    ├── product-surface.{json,md}                    ← generated parity metadata
    ├── quality-gates.md                             ← exact commands and evidence map
    └── README.md                                    ← documentation index
```

Each entry in `spec/evidence/discrepancies.md` answers five
questions per divergence: official claim, actual behaviour, live
test that proves it, MCP tool that depends on it, open questions.

## Refreshing inputs

```bash
# Refresh the official spec
cp ../GOCLMCP/docs/openapi/sources/AIII/openapi.yaml \
   spec/official/clockify.official.openapi.yaml

# Regen + snapshot the canonical
(cd ../GOCLMCP && make gen-openapi)
cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml \
   spec/corrected/clockify.corrected.openapi.yaml
```

## Running Fern

Install the CLI once: `npm install -g fern-api` (pinned to `5.37.9`
via `spec/fern/fern.config.json`). `fern generate` runs each
generator in Docker — the daemon must be up.

```bash
cd spec/fern

# Validation. ALWAYS use --from-openapi: the legacy parser fires
# 8 no-conflicting-endpoint-paths warnings for literal-vs-{id}
# siblings (e.g. /expenses/categories vs /expenses/{expenseId})
# that are conformant per OpenAPI 3.0.3 §4.8.5.4. Full evidence:
# spec/evidence/discrepancies.md →
# fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings.
fern check --warnings --from-openapi

# Local generation. Output paths come from generators.yml.
fern generate --group ts --local       # TypeScript
fern generate --group py --local       # Python
fern generate --group postman --local  # Postman collection
```

To smoke-test the **official** spec instead, swap the active line
in `spec/fern/generators.yml` `api.specs[]` to point at
`../official/...`. The diagnostics delta is the rough size of what
the corrected spec has absorbed.

## Current state

The canonical spec exposes **185 live operations across 121 paths
on 31 tags**, with quarantined phantom routes tracked in the
GOCLMCP generator. The wrapper ships idiomatic method names on
**27 of 31 modules / 169 ops (91.4% of the live surface)** via
`x-fern-sdk-group-name` + `x-fern-sdk-method-name` stamps.

Package surfaces:

| Package | Current surface |
|---|---|
| `clockify-sdk-ts-115` | v0.9.0; 31 resource modules, 185 live operations, dual ESM/CJS, pagination helpers, webhook verification, typed errors, scoped clients, OTel hooks, health and rate-limit helpers |
| `@clockify115/cli` | v0.1.0; 28 commands across 16 groups, env/config based auth, JSON output for automation |
| `@clockify115/mcp-server` | v0.3.0; 105 stdio MCP tools: 17 workflow tools plus 88 domain tools, rich `changed`/`next` envelopes, stable recovery errors, dry-run confirmation tokens |

| Surface                                            | Result |
| -------------------------------------------------- | ------ |
| `fern check --warnings --from-openapi`             | All checks passed (2 unrelated example-pairing notes on `POST /workspaces/`) |
| `fern generate --group ts --local --force`         | 708 files synced into `wrapper/src/`; 31 resource modules; 184 SDK methods |
| `tsc -p tsconfig.json --noEmit` (wrapper)          | package gate; run from `wrapper/` before SDK changes |
| `vitest run` (wrapper)                             | unit coverage plus env-gated live sandbox flows |
| `npm pack --dry-run` (wrapper, v0.9.0)             | checked by package gates |
| `npm test` (mcp, v0.3.0 with live sandbox env)     | 42 tests, including 11 live sandbox flows |

The full release log is in [`wrapper/CHANGELOG.md`](./wrapper/CHANGELOG.md);
per-divergence evidence is in
[`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md).
The repo-level product target is in
[`docs/product-north-star.md`](./docs/product-north-star.md).

## Reviewing Fern output

When auditing what Fern emits from the corrected spec, score on:

- **Schemas** — orphan `additionalProperties: true` where the live
  shape is known.
- **Enums** — exhaustive; silent extras break consumers.
- **Request / response models** — stable names, no anonymous
  `Type_42` auto-names.
- **Pagination** — one pattern across endpoints, not a different
  one per op.
- **Reports** — historically the dirtiest area (minor-unit amounts,
  family-specific totals keys). Models here are the canary.

Ugly output from the **corrected** spec is a real bug to fix in
`../GOCLMCP/docs/openapi/sources/**` or in the generator. Ugly
output from the **official** spec only is a discrepancy already
absorbed; add it (or update it) in
`spec/evidence/discrepancies.md`.
