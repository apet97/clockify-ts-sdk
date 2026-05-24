# clockify-ts-sdk — TypeScript SDK for the Clockify API

Standalone repo (`apet97/clockify-ts-sdk`). Ships the npm package
**`clockify-sdk-ts`** from `wrapper/dist/`. The rest of the tree
is the toolchain that produces the SDK: a Fern workspace
(`spec/fern/`), a snapshot of the canonical Clockify OpenAPI
(`spec/corrected/`), an evidence ledger for spec-vs-live
divergences (`spec/evidence/`), the raw generator output
(`output/ts-sdk/`), and the publishable wrapper layout
(`wrapper/`).

The canonical Clockify OpenAPI is **not** in this repo — it lives
in the sister GitHub project `apet97/go-clockify` (conventionally
cloned next to this repo as `../GOCLMCP/`), which produces it via
`make gen-openapi` from a curated source bundle. This repo
snapshots that canonical and feeds it to Fern, generating an
idiomatic TypeScript SDK plus a brutal smoke test for the spec
itself: if Fern emits a clean SDK, schemas / enums /
oneOf+discriminator splits / pagination patterns are coherent.

## Why Fern

Fern (https://buildwithfern.com) consumes OpenAPI and emits idiomatic
SDKs (TypeScript, Python, Java, etc.) plus a Postman collection.
Generator output is a brutal smoke test for an OpenAPI spec: if Fern
can produce a clean SDK from `spec/corrected/`, the schemas, enums,
oneOf/discriminator splits, pagination patterns, and report endpoints
are all coherent. If Fern's output is ugly, the spec still needs
work.

**Important:** Fern's preferences must not warp MCP tool design.
We run Fern to *audit the spec*, not to redesign the tools.

## Layout

```
clockify-ts-sdk/                           ← this repo
├── README.md                              ← you are here
├── java-sdk-reference/                    ← clone of clockify/addon-java-sdk
│                                            (official reference; do not edit)
├── spec/
│   ├── official/
│   │   └── clockify.official.openapi.yaml ← copy of upstream spec
│   │                                        (docs/openapi/sources/AIII/openapi.yaml)
│   ├── corrected/
│   │   └── clockify.corrected.openapi.yaml ← copy of the repo's
│   │                                        canonical generated spec
│   │                                        (docs/openapi/clockify-openapi.yaml)
│   ├── evidence/
│   │   ├── discrepancies.md               ← ledger of official-vs-live deltas
│   │   ├── fixtures/                      ← curated golden response shapes
│   │   └── probes/                        ← raw live API captures
│   └── fern/
│       ├── fern.config.json               ← Fern workspace config
│       └── generators.yml                 ← TS / Python / Postman generators
└── output/                                ← generated SDKs land here
    ├── ts-sdk/
    ├── py-sdk/
    └── postman/
```

The five spec questions, answered per discrepancy in
`spec/evidence/discrepancies.md`:

1. What does official documentation claim?
2. What does Clockify actually return?
3. Which live test proves it?
4. Which MCP tool depends on it?
5. Which uncertainty remains?

## Refreshing the inputs

```bash
# Refresh the official spec (upstream is curated under GOCLMCP/docs/openapi/sources)
cp ../GOCLMCP/docs/openapi/sources/AIII/openapi.yaml \
   spec/official/clockify.official.openapi.yaml

# Refresh the corrected spec (regen first if descriptors changed)
(cd ../GOCLMCP && make gen-openapi)
cp ../GOCLMCP/docs/openapi/clockify-openapi.yaml \
   spec/corrected/clockify.corrected.openapi.yaml

# Refresh the Java SDK reference clone
(cd java-sdk-reference && git pull --ff-only)
```

## Running Fern

The Fern CLI is not bundled with the repo. Install it once
per workstation:

```bash
npm install -g fern-api
fern --version
```

Then from this directory:

```bash
cd spec/fern

# Validate the corrected spec — catches schema / ref / enum errors
# before generation. This alone is a useful smoke test.
#
# Prefer the new --from-openapi parser: it parses the OpenAPI
# directly to Fern IR and skips the legacy IR's tag-grouped
# service representation. The legacy parser fires 8
# no-conflicting-endpoint-paths warnings against literal-vs-{id}
# siblings (expenses/categories vs expenses/{expenseId}, etc.)
# even though the spec is conformant per OpenAPI 3.0.3 §4.8.5.4
# (concrete > templated). The new parser does not run that rule
# and reports 0/0 against the corrected snapshot. Full evidence
# in spec/evidence/discrepancies.md →
# fern-check.no-conflicting-endpoint-paths.literal-vs-id-siblings.
fern check --warnings --from-openapi   # recommended
fern check --warnings                   # legacy parser (8 known warnings)

# Generate SDKs locally (no Fern login required for local output).
# Output paths come from generators.yml. Requires Docker daemon —
# Fern runs each generator in a container.
fern generate --group ts --local       # TypeScript Node SDK
fern generate --group py --local       # Python SDK
fern generate --group postman --local  # Postman collection
```

To smoke-test the **official** spec instead, edit
`spec/fern/generators.yml` and switch the active line in `api.specs[]`
to `- openapi: ../official/clockify.official.openapi.yaml`. Compare
the two runs' diagnostics — that delta is the rough size of the
spec corrections the MCP layer has absorbed so far.

## Current state (2026-05-24, session 2)

Tracked against GOCLMCP `main` `26bc586` (`feat(gen): collapse
SharedReport tag to plural Shared Reports`).

| Surface | Errors | Warnings | Outcome |
| --- | --- | --- | --- |
| `fern check --warnings --from-openapi` (corrected spec) | 0 | 0 (modulo 2 unrelated example-pairing notes on `POST /workspaces/`) | green |
| `fern generate ts --local --force` | 0 | — | 723 files synced into `wrapper/src/`; 32 resource modules across 193 operations |
| `tsc -p tsconfig.json --noEmit` (wrapper) | 0 | — | green |
| `vitest run` (wrapper) | — | — | 13/13 (8 pagination unit + 5 live sandbox) |
| `npm pack --dry-run` (wrapper) | — | — | 2899 files, 331.8 kB packaged as `clockify-sdk-ts@0.1.0` |

The wrapper ships as the npm package `clockify-sdk-ts` from the
`wrapper/dist/` build output. See `wrapper/README.md` for the npm
surface and `wrapper/CHANGELOG.md` for release-cut notes; the
generator chain that produces the canonical spec lives in
`apet97/go-clockify` (`GOCLMCP/`).

### Resolved during the publish-readiness pass

Full evidence in `spec/evidence/discrepancies.md`. Quick summary:

1. **`TimeOffRequest.status` schema collision** — named schema wins;
   inline `createdBy / createdAt` block replaced with `$ref`.
2. **3 route conflicts** (literal-vs-{id} siblings) — disambiguated
   via 24-hex-ObjectID `pattern` constraints on `expenseId` /
   `invoiceId` / `assignmentId`. Fern's legacy parser still warns;
   use `--from-openapi` for the new parser (0 warnings).
3. **TS SDK resource duplication** — 6 singular tags collapsed into
   5 plural canonicals via `TAG_RENAMES` in the generator
   (`Project→Projects`, `User→Users`, `Webhook→Webhooks`,
   `Approval→Approvals`, `Balance→Balances`, `Client→Clients`,
   `Policy→Policies`, `Tag→Tags`, `SharedReport→Shared Reports`).
4. **Bare-array pagination** — Fern's offset mode rejects
   Clockify's bare-array responses; the wrapper ships a hand-written
   `paginate<T>` helper (`clockify-sdk-ts/pagination` subpath
   export) as the supported workaround.
5. **`addonToken` typed as required** — Fern's OR-security inference
   bug means callers pass
   `addonToken: (() => undefined) as unknown as () => string`
   in `BaseClientOptions`; documented in `wrapper/README.md`.
6. **18 list endpoints stamped with `page` + `page-size`** — adds
   pagination params on every operation the live API supports them
   on; 3 deferred endpoints re-probed and confirmed NOT paginated
   (or not-live).
7. **Policy `sort-order` tightened to enum** — `ASCENDING` /
   `DESCENDING` exposed as a typed const in the TS SDK.

## What to look at after a run

When reviewing Fern output, score the spec on:

- **Schemas:** are there orphan `additionalProperties: true` blobs
  where the live response has a known shape?
- **Enums:** every string enum should be exhaustive; Fern will
  generate a union type and silent extras break consumers.
- **Request / response models:** stable names, no anonymous inline
  schemas getting `Type_42` style auto-names.
- **Pagination:** does Fern pick a single pagination pattern, or
  does it emit a different one per endpoint? Mixed patterns mean
  the spec is lying about uniformity.
- **Reports:** the report endpoints are where the spec historically
  hides the most rot (minor-unit amounts, family-specific totals
  keys). Fern's models for these are the canary.

Anything ugly that the **corrected** spec produces is a real spec
bug to fix in `docs/openapi/clockify-openapi.yaml` (and its
generator, if applicable). Anything ugly that only the **official**
spec produces is a discrepancy already absorbed by the MCP — add
it (or update it) in `spec/evidence/discrepancies.md`.
