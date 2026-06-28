---
name: clockify-sdk-verify
description: Prove a change green in the clockify-ts-sdk monorepo — pick the right verification gates, run perfect-fast safely (it's load-flaky), and know the blank-creds rule. Use before committing or claiming a change works in this repo.
---

# Verifying changes in clockify-ts-sdk

This repo is "doc-as-contract": dozens of `make` gates guard package shape, doc
truth, counts, and write-safety. Pick gates by change scope; finish with one solo
`make perfect-fast`.

## The one rule that bites everyone: blank the creds

```bash
CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast
```

With creds **set**, the live `sandbox.test.ts` suites run and **fail (401)** on an
expired/absent key — a false red. **Blanked**, they self-skip (`describe.skip`), so
the run is offline and deterministic. `perfect-fast` is only "deterministic" this way.

## Run perfect-fast SOLO

`perfect-fast` includes `performance-budgets`, which measures CLI/MCP **startup time**
(`cli-version` ≤600ms, `mcp-tools-list` ≤1200ms). Under CPU contention it flakes
6–10× over budget → false reds. Don't run other agents/heavy commands concurrently.
If it reds only on a startup-time budget, the heavy proofs already ran (it's the
**last** prereq) — re-validate solo with `make performance-budgets`.

## Fast inner loop = focused gates (skip the load-sensitive budgets)

```bash
# per package (workspace names: clockify-sdk-ts-115, @apet97/clockify-cli-115, @apet97/clockify-mcp-115)
npm run type-check -w <pkg> && npm run lint -w <pkg> && npm test -w <pkg> && npm run build -w <pkg>
```

Note: `perfect-fast` runs `lint` (incl. mcp eslint) which per-package `type-check`/`test`/`build`
do NOT — run `npm run lint -w <pkg>` before claiming green. A fresh clone needs
`npm ci` then `make sdk-codegen` (populates the gitignored `wrapper/src/**` + `output/ts-sdk/**`)
before SDK gates pass.

## Gate-by-scope cheat sheet

| You changed… | Run |
|---|---|
| docs/README prose only | `make docs-drift docs-quality docs-counts user-docs agent-handoff` |
| an MCP tool | `make mcp-contract mcp-agent-ux mcp-write-safety docs-counts` + `npm test -w @apet97/clockify-mcp-115` (see the `clockify-sdk-add-mcp-tool` skill) |
| a CLI command | `make cli-contract cli-write-safety readme-tables-drift changelog-drift` + cli tests |
| a hand-written SDK module | `make wrapper-gates` + the public-surface gates (`package-contract`, `sdk-public-api`) |
| package counts / version | `make version-policy docs-counts dependency-boundary changelog-drift` |
| any package version bump | run `npm install` so `package-lock.json` matches, or `make dependency-boundary` reds |

## Tiers (full proof)

| Gate | Proves |
|---|---|
| `make perfect-fast` | Deterministic local SDK/CLI/MCP package proof (no network) |
| `make perfect-full` | Adds GOCLMCP drift, codegen/build determinism, packed-consumer smoke, coverage, `mutation-ci` wiring |
| `make perfect-live` | Explicit sandbox cleanup proof (needs a sacrificial `CLOCKIFY_API_KEY`) |

Capture make's real exit code directly (`make perfect-fast; echo $?`) — a `&&` compound masks it.

When a gate reds, read its message: most check-scripts name the exact missing marker / count / file.
Full gate matrix is in `AGENTS.md` §4; per-package detail in `CLAUDE.md` → "Verify Gates".
