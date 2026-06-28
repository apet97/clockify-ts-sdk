---
name: clockify-sdk-navigate
description: Find which file to edit in the clockify-ts-sdk monorepo (SDK / CLI / MCP / spec) and avoid the generated-vs-hand-written traps and hard stops. Use when you know WHAT to change but not WHERE, or before editing anything generated.
---

# Navigating clockify-ts-sdk

Three packages as npm workspaces: `wrapper/` → `clockify-sdk-ts-115` (SDK),
`cli/` → `@apet97/clockify-cli-115`, `mcp/` → `@apet97/clockify-mcp-115`. The SDK is
generated locally from a corrected OpenAPI snapshot; the CLI/MCP wrap it.

## Where to change things

| Goal | File(s) |
|---|---|
| SDK wrapper helper / export | root files in `wrapper/` (e.g. `wrapper/resolve.ts`) — **never** `wrapper/src/**`; add a subpath in `wrapper/package.json` `exports` + re-export from `wrapper/index.ts` |
| Scoped `Workspace` method (`ensure*`, `iterProjects`…) | `wrapper/scoped-client.ts` (class methods, not root exports) |
| CLI command | `cli/src/commands/*.ts`, wired in `cli/src/index.ts` |
| CLI name→id resolution (`start`/`log`) | `cli/src/commands/resolve-refs.ts` |
| MCP domain tool | `mcp/src/tools/*.ts`, wired in `mcp/src/server.ts` (see the `clockify-sdk-add-mcp-tool` skill) |
| MCP workflow | `mcp/src/tools/workflows/index.ts` (+ siblings) + `mcp/tests/workflows.test.ts` |
| Spec/live-API discrepancy | `spec/evidence/discrepancies.md` |
| Product direction | `docs/product-north-star.md` |

Authoritative step-by-steps live in `docs/agent-tasks/` (`add-cli-command.md`,
`add-mcp-tool.md`, `fix-sdk-helper.md`, `update-public-export.md`,
`handle-live-api-discrepancy.md`, `handle-official-openapi-drift.md`).

## NEVER edit these (regenerated — your edits get wiped)

- `wrapper/src/**` — repopulated by `npm run sync` / `make sdk-codegen`.
- `output/ts-sdk/**` — wiped on every `make sdk-codegen` (gitignored).
- `spec/corrected/clockify.corrected.openapi.yaml` — a snapshot *generated upstream
  by the sister repo `../GOCLMCP/`*. Spec-shape changes start there, then flow in.
- Generated docs (`docs/product-surface.*`, `docs/operation-parity.*`,
  `docs/openapi-operations.*`, `cli`/`mcp` README tables, `.packsnapshot` files) —
  regenerate with the matching `make` target (`product-surface`, `operation-parity`,
  `readme-tables`, …), don't hand-edit.

Hand-maintained source-of-truth JSON you DO edit: `docs/mcp-tools.json`,
`docs/cli-commands.json`, `docs/sdk-public-api.json`, and the `docs/*-contract.json`
files. Transient tsserver "missing export" squiggles after a sync are not real —
rebuild the wrapper (`npm run build -w clockify-sdk-ts-115`) and trust a clean
`npm run type-check`.

## Hard stops (flag and stop — don't do these without explicit approval)

- No `npm publish` from a laptop — publication is CI tag-push only (see the
  `clockify-sdk-publish` skill).
- No `git push --force`; no live tests against customer workspaces.
- No edits to `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**`.
- No CI/CD, auth, or release-setting changes unless explicitly asked.

Full identity/boundary and the build chain are in `AGENTS.md` §1–§6; the quick table
is in `CLAUDE.md` → "Where To Change Things" and "Hard Stops".
