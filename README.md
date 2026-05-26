# clockify-ts-sdk — Clockify TypeScript SDK, CLI, and MCP

Standalone repo (`apet97/clockify-ts-sdk`). Ships the packable package
**`clockify-sdk-ts-115`** from `wrapper/dist/`, plus two sibling
packable packages on top of it: `@clockify115/cli` from `cli/dist/`
and `@clockify115/mcp-server` from `mcp/dist/`. Everything else is the
toolchain that produces and proves those packages: a Fern workspace
(`spec/fern/`), a snapshot of the canonical Clockify OpenAPI
(`spec/corrected/`), an evidence ledger for spec-vs-live deltas
(`spec/evidence/discrepancies.md`), the raw generator output
(`output/ts-sdk/`), and docs that keep humans and agents aligned.

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
├── output/{ts-sdk,py-sdk,postman}/                  ← generator outputs (gitignored except ts-sdk)
├── wrapper/                                         ← packable SDK package layout
├── cli/                                             ← packable CLI package layout
├── mcp/                                             ← packable stdio MCP package layout
└── docs/
    └── product-north-star.md                        ← final-state quality bar
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
| `@clockify115/cli` | v0.1.0; 21 commands across 15 groups, env/config based auth, JSON output for automation |
| `@clockify115/mcp-server` | v0.3.0; 105 stdio MCP tools: 16 workflow tools plus 89 domain tools, rich `changed`/`next` envelopes, stable recovery errors, dry-run confirmation tokens |

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
