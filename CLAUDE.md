# CLAUDE.md

Concise Claude Code guide for `apet97/clockify-ts-sdk`. The canonical
contract is [`AGENTS.md`](./AGENTS.md); read it before edits.

## Product Shape

This standalone repo ships three sibling packages:

| Folder | Package | Current surface |
|---|---|---|
| `wrapper/` | `clockify-sdk-ts-115` | v0.9.0 SDK; dual ESM/CJS; 38 public names; 14 subpaths |
| `cli/` | `@clockify115/cli` | v0.1.0 CLI; bins `clockify115` and `clk115`; 21 commands |
| `mcp/` | `@clockify115/mcp-server` | v0.3.0 stdio MCP; bin `clockify115-mcp`; 105 tools |

The `-115` / `115` suffix is intentional trademark distance. Default
stance: local/packable packages, not npm publication. Keep
`publishConfig` and `prepublishOnly` gates intact; do not publish or
change release auth unless explicitly asked.

The sister repo `../GOCLMCP/` owns the canonical Clockify OpenAPI
generator. Spec-shape changes start there, then flow into this repo's
`spec/corrected/clockify.corrected.openapi.yaml` snapshot. Do not edit
that snapshot by hand.

## First Reads

1. `AGENTS.md`
2. `README.md`
3. `wrapper/README.md`
4. `mcp/README.md`
5. `docs/product-north-star.md`
6. `spec/evidence/discrepancies.md`

## Verify Gates

```bash
cd wrapper
npm run type-check
npm test
npm run build
npm run build:smoke
npm pack --dry-run

cd ../cli
npm run type-check
npm test
npm run build
npm pack --dry-run

cd ../mcp
npm run type-check
npm test
npm run build
npm pack --dry-run
```

For live MCP sandbox cleanup proof, run from the repo root so the
shell env is inherited:

```bash
cd mcp && npm run verify:live-cleanup
```

Docs-only changes still need:

```bash
git diff --check
rg --pcre2 -n "clockify-sdk-ts(?!-115)|v0\\.2\\.0|89 tools|no workflow tools|TODO|TBD" \
  AGENTS.md CLAUDE.md README.md docs wrapper/README.md cli/README.md mcp/README.md mcp/CHANGELOG.md
```

## Current Gotchas

- `wrapper/src/**` and `output/ts-sdk/**` are generated. Do not edit.
- `mcp/src/tools/workflows.ts` is the workflow-first MCP surface.
- MCP receipts should include useful `ids`, `changed`, `warnings`,
  `next`, stable error codes, and recovery hints.
- Client/project archive cleanup uses different generated SDK shapes:
  clients update with nested `body`; projects update with top-level
  fields. See `spec/evidence/discrepancies.md`.
- `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` are live sandbox env
  values. Check presence, never print values.
- `wrapper/.packsnapshot` must be the sorted `npm pack --dry-run --json`
  file list. The exact CI diff command should pass before push.
- Release-please currently needs repository Actions permission to
  create PRs; do not solve that by changing release auth casually.

## Where To Change Things

| Goal | File |
|---|---|
| SDK wrapper helper/export | root files in `wrapper/`, never `wrapper/src/**` |
| CLI command | `cli/src/commands/*.ts`, wired in `cli/src/index.ts` |
| MCP domain tool | `mcp/src/tools/*.ts`, wired in `mcp/src/server.ts` |
| MCP workflow | `mcp/src/tools/workflows.ts` + `mcp/tests/workflows.test.ts` |
| Live cleanup proof | `mcp/scripts/assert-clean-prefixes.mjs` |
| Spec/live discrepancy | `spec/evidence/discrepancies.md` |
| Product direction | `docs/product-north-star.md` |

## Hard Stops

- No `npm publish`.
- No `git push --force`.
- No live tests against customer workspaces.
- No edits to `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`.
- No CI/CD, auth, or release-setting changes unless explicitly asked.
