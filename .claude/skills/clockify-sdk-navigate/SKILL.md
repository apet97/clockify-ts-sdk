---
name: clockify-sdk-navigate
description: Find which file to edit in the clockify-ts-sdk monorepo (SDK / CLI / MCP / spec) and avoid the generated-vs-hand-written traps and hard stops. Use when you know WHAT to change but not WHERE, or before editing anything generated.
---

# Navigating clockify-ts-sdk

Three packages as npm workspaces: `wrapper/` → `clockify-sdk-ts-115` (SDK),
`cli/` → `@apet97/clockify-cli-115`, `mcp/` → `@apet97/clockify-mcp-115`. The SDK is
generated locally from a corrected OpenAPI snapshot; the CLI/MCP wrap it.

## Where to change things

The goal→file routing table lives in ONE place: `CLAUDE.md` → "Where To
Change Things". Read it there — this skill deliberately does not carry a
copy, because a second copy is a second thing to rot.

Two additions the table does not spell out:

- A new SDK subpath needs both a `wrapper/package.json` `exports` entry and a
  re-export from `wrapper/index.ts`.
- A new MCP tool has its own cascade — use the `clockify-sdk-add-mcp-tool`
  skill, not just the table row.

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
