# clockify-ts-sdk — TypeScript SDK for the Clockify API

Standalone repo (`apet97/clockify-ts-sdk`). Ships the npm package
**`clockify-sdk-ts`** from `wrapper/dist/`. Everything else is the
toolchain that produces it: a Fern workspace (`spec/fern/`), a
snapshot of the canonical Clockify OpenAPI (`spec/corrected/`),
an evidence ledger for spec-vs-live deltas
(`spec/evidence/discrepancies.md`), the raw generator output
(`output/ts-sdk/`), and the publishable wrapper (`wrapper/`).

The canonical OpenAPI is **not** in this repo. It lives in the
sister project `apet97/go-clockify` (cloned conventionally as
`../GOCLMCP/`), which produces it from a curated source bundle via
`make gen-openapi`. This repo snapshots that canonical and feeds
it to Fern, which doubles as a strict smoke test for the spec:
schema / enum / `oneOf` / pagination patterns must be coherent
enough for Fern to emit a clean SDK.

End-users of the npm package: see [`wrapper/README.md`](./wrapper/README.md).
This file is for contributors and agents working on the spec + SDK
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
└── wrapper/                                         ← npm-publishable layout (the only thing that ships)
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
on 31 tags**, with **6 quarantined phantom routes** (live-probed
404/405 — see PHANTOM_PATHS in the GOCLMCP generator). The wrapper
ships idiomatic method names on **27 of 31 modules / 169 ops
(91.4% of the live surface)** via
`x-fern-sdk-group-name` + `x-fern-sdk-method-name` stamps.

| Surface                                            | Result |
| -------------------------------------------------- | ------ |
| `fern check --warnings --from-openapi`             | All checks passed (2 unrelated example-pairing notes on `POST /workspaces/`) |
| `fern generate --group ts --local --force`         | 708 files synced into `wrapper/src/`; 31 resource modules; 184 SDK methods |
| `tsc -p tsconfig.json --noEmit` (wrapper)          | clean |
| `vitest run` (wrapper)                             | 126/126 unit + 7 live sandbox flows |
| `npm pack --dry-run` (wrapper, v0.5.0)             | 5724 entries in `.packsnapshot` |

The full release log is in [`wrapper/CHANGELOG.md`](./wrapper/CHANGELOG.md);
per-divergence evidence is in
[`spec/evidence/discrepancies.md`](./spec/evidence/discrepancies.md).

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
