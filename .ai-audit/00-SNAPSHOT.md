# 00 — SNAPSHOT

Evidence pack for the repository audit. This document records what was
inspected, when, and under what conditions.

## Repository state

- Repository: `apet97/clockify-ts-sdk` (remote `origin: https://github.com/apet97/clockify-ts-sdk.git`)
- Working directory: `/Users/15x/Downloads/WORKING/addons-me/clockify-ts-sdk`
- Branch: `main`
- HEAD commit: `49462f5` — `test(wrapper): kill the three mutants the 1.0.1 mutation run exposed`
- History sampled: `49462f5`, `ba25c5c`, `fa1673c` (release 1.0.1), `65cc83e`, `73fff64`
- Working tree at audit start: clean (`nothing to commit, working tree clean`)
- Working tree at audit end: only modification is the added `.gitignore` entry
  for `/.ai-audit/` (requested by the audit harness; not a product change)
- Git tags present locally: package-prefixed only (`wrapper-v*`, `cli-v*`,
  `mcp-v*`, e.g. `mcp-v0.8.0`, `mcp-v1.0.0`); no bare `v*.*.*` tags
- Version of `AGENTS.md` read: 50,611 bytes, last commit `Aug 6 03:20`
- Version of `CLAUDE.md` read: 13,441 bytes, last commit `Aug 6 03:20`

## Tool versions

- Node: `v26.0.0` (repo `engines` requires `>=22.13.0`)
- npm: `11.12.1`
- Vitest (root override): `4.1.10`
- TypeScript: workspace-resolved (per-package)
- Python: 3.x (used for JSON/YAML probes)
- Shell: bash (macOS)

## Audit execution

- Four parallel auditor subagents (full-access, disposable-workspace mode)
  inspected four slices; each wrote a raw report to `.ai-audit/raw/`:
  - `slice-a-wrapper.md` — SDK package (`wrapper/`)
  - `slice-b-mcp.md` — MCP server (`mcp/`)
  - `slice-c-cli-gates.md` — CLI (`cli/`), `scripts/`, `Makefile`, `.github/`
  - `slice-d-docs-spec.md` — `docs/`, `spec/`, root docs, release config
- The orchestrator re-verified the highest-impact claims directly:
  - `ensure.ts` single-flight keying (`wrapper/ensure.ts:48-69`) — W-01
  - source-lock vs shipped spec bytes (`docs/openapi-source-lock.json` vs
    `shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml`) — S-01
  - live-evidence manifest status counts (134/168) vs spec stamps (161/168) — S-02
  - `switchWork` envelope read (`mcp/src/tools/workflows/time-tracking.ts:168-170`) — M-01
  - `mutation-leaves.test.ts` 30-pin vs 35-leaf contract — C-1
  - `docs/cli-contract.json` `globalFlags` (7 of 9) — G-1
  - `.github/workflows/docs.yml` tag trigger `v*.*.*` — W-1
  - `docs.yml`/release-workflow tag shapes, `operation-parity.json` (168 rows,
    104 `tsMcp` non-null, 64 null with `overrideReason: null`)
  - type-safety greps (`as any` 1 (comment false-positive), `as unknown`
    wrapper 98 / cli 2 / mcp 16, `@ts-expect-error`/`@ts-ignore` 0 everywhere)
- `.ai-audit/04-CONTRACT-TRACEABILITY.csv` was generated mechanically from
  `spec/corrected/clockify.corrected.openapi.yaml` + `docs/operation-parity.json`
  by `.ai-audit/raw/gen-traceability.mjs` (one-off, not shipped).

## Commands executed (orchestrator)

```
git status; git log --oneline -5; git branch --show-current; git remote -v
node --version; npm --version
find . -maxdepth 2 -type d   (structure census)
wc -l over src trees; file counts
node -e ... (spec YAML probes: operation counts, x-* keys, group inventory)
node -e ... (operation-parity probes: tsMcp/overrideReason distributions)
python3 ... (JSON probes: cli-contract, cli-commands, live-evidence-manifest,
             openapi-source-lock, docs-counts-contract)
shasum -a 256 spec/corrected/clockify.corrected.openapi.yaml
shasum -a 256 ../GOCLMCP/docs/openapi/clockify-openapi.yaml
make help   (gate inventory; no target executed)
grep surveys (as any / as unknown / @ts-expect-error / eslint-disable)
```

Subagents additionally ran (all cheap): per-package `npm run type-check`
(passes for wrapper and mcp), single vitest files (`ensure.test.ts` 19/19),
`node scripts/plan.mjs contract-inventory`, Node URL-canonicalization probes,
one `tsx` repro of W-01 and one of M-01, and CLI binary invocations against
`cli/dist/index.js` (see C-2/C-3). One accidental read-only live GET occurred
(`entries list --limit 1abc` with shell creds present); no data was created
or modified. See `slice-c-cli-gates.md` C-2.

## Files inspected

Complete: all root docs (`README.md`, `AGENTS.md`, `CLAUDE.md`,
`CONTRIBUTING.md`, `SECURITY.md`, `NOTICE.md`), `Makefile` (all targets),
`package.json`, all 8 `.github/workflows/*.yml`, all 6 `docs/decisions/*.md`,
all 9 `docs/gotchas/*.md`, all 7 `docs/agent-tasks/*.md`,
`spec/evidence/discrepancies.md` (3,731 lines), the full corrected OpenAPI
(24,339 lines, probed mechanically), all 21 hand-written `wrapper/*.ts`
modules, all 4 `wrapper/internal/*.ts`, the generated core
(`wrapper/src/core/*`, `BaseClient.ts`, `Client.ts`), sampled generated
resources (all 30 client folders surveyed by grep), 56 wrapper test files
(inventoried; key ones read fully), all 35 `cli/src` files, all 40 `cli/tests`
files (inventoried), all 62 `mcp/src` files, all 78 `mcp/tests` files
(inventoried), 266 `scripts/` files (all gates referenced by the Makefile read
in full or by marker semantics), all 4 `.claude/skills/*/SKILL.md`,
`.release-please-manifest.json`, `release-please-config.json`,
`.gitignore`, `.editorconfig`, `docs/*.json` contract files (sampled),
per-package `package.json`, `tsconfig*.json`, `vitest.config.ts`,
`README.md`, `CHANGELOG.md`, `.packsnapshot`, `stryker.conf.json`.

## Files excluded from inspection

- `node_modules/**`, `**/dist/**` (build output; `cli/dist/index.js` was
  executed for exit-code probes but not read as source of truth)
- `**/coverage/**`, `**/reports/**` — stale local artifacts (gitignored);
  `wrapper/coverage/coverage-summary.json` and
  `wrapper/reports/mutation/mutation.json` exist on disk but were not
  interpreted as evidence
- `wrapper/docs/api/**` (TypeDoc) — gitignored, not present in the worktree
- `output/ts-sdk/**` — gitignored generated tree (present; used only via
  `docs/operation-parity.json` and `wrapper/src` which mirrors it)
- `../GOCLMCP/` — read only for: `docs/openapi/clockify-openapi.yaml` bytes,
  `scripts/gen-clockify-openapi` data tables (PHANTOM_PATHS, SDK_METHOD_NAMES)
  via slice D; no GOCLMCP source audit was performed
- `.git/**`, `.remember/**`, `.recon/**`, `.worktrees/**`, `.claude/worktrees`
- `spec/evidence/probes/*.{json,hdr}` — gitignored; not present
- `mcp/coverage`, `mcp/reports`, `mcp/*.mcpb`, `mcp/clockify115-mcp-*.spdx.json`
  — gitignored build artifacts

## Generated artifacts created by this audit

- `.ai-audit/raw/slice-a-wrapper.md`, `slice-b-mcp.md`, `slice-c-cli-gates.md`,
  `slice-d-docs-spec.md` — subagent raw reports
- `.ai-audit/raw/gen-traceability.mjs` — one-off CSV generator
- `.ai-audit/00-SNAPSHOT.md` … `16-HANDOFF.md`, `04-CONTRACT-TRACEABILITY.csv`
- `.gitignore` gained one entry: `/.ai-audit/`

## Coverage limitations

- No heavy gate was executed: `make perfect-fast`/`perfect-full`/`contract-gates`/
  `governance-audit`/`release-proof`, full test suites, builds, packs, Stryker,
  and live sandbox runs were intentionally NOT run (four parallel auditors +
  CPU-contention false-red risk). All execution-gated claims are marked
  "needs execution" in the ledger and queue.
- No network access was used (no live Clockify calls except the one accidental
  read-only GET; no `openapi-source-lock` fetch; no `mcpb` build).
- The live wire shape of several behaviors (webhook envelope vs flat payload,
  `page-size > 200` server behavior, webhook header names, expenses `date`
  format) is UNKNOWN and marked as such. See `14-DISAGREEMENTS-AND-UNKNOWN.md`.
- The 680 generated `wrapper/src` files were surveyed systematically (core
  read fully; resource clients sampled + grep-surveyed), not read line by line.
- `docs/**` grew to 242 files (126 md, 116 json) since the 198-entry count in
  earlier prose; every markdown file was read or sampled; JSON contracts were
  probed for the claims they underpin.
- Remote tags were not auditable offline (`git ls-remote --tags` not run);
  the `mcp-v1.0.1` tag question (unknown MCP-unknown-1) is unresolved.
