# Gate Tiers

This is the human map for the repo's validation web: which surface changes
touch which gates, and which overlapping gates are intentional defense in
depth. The executable source of truth remains
`docs/change-impact-contract.json`.

The structural MCP tool manifest (`docs/mcp-tool-manifest.json`) is generated
from a live `buildServer(ctx)` registration pass. Gates that need the MCP tool
set should read that manifest rather than infer tool names from TypeScript
registration syntax.

## Tier Definitions

| Tier | Meaning | Examples |
|---|---|---|
| T1 Package | Per-workspace type-check, test, build, and pack checks | `wrapper-gates`, `cli-gates`, `mcp-gates`, `pack-smoke` |
| T2 Structural Shape | Contract JSON shape, headline counts, or generated artifact freshness | `mcp-contract`, `docs-counts`, `conformance-drift`, `mcp-tool-manifest-drift` |
| T3 Generators And Drift | Regenerate derived docs/artifacts and fail when committed copies are stale | `operation-parity-drift`, `readme-tables-drift`, `docs-index-drift` |
| T4 Cross-Validator | Join multiple sources of truth and assert they agree | `mcp-write-safety`, `cli-write-safety`, `mutation-safety`, `naming-taxonomy` |
| T5 Aggregate | Meta-gates that fan out into many others | `perfect-fast`, `perfect-full`, `contract-inventory`, `enterprise-audit` |

## Surface Map

| If You Change | Scope | Gates To Expect |
|---|---|---|
| `mcp/src/tools/**`, `mcp/scripts/**`, or `docs/mcp-tool-manifest.json` | `mcp-surface` | `mcp-contract`, `mcp-write-safety`, `mcp-tool-manifest-drift`, `mcp-gates`, `readme-tables-drift`, `changelog-drift` |
| `cli/src/**` | CLI surface | `cli-contract`, `cli-write-safety`, `cli-gates`, `mutation-safety`, `changelog-drift` |
| `wrapper/*.ts` hand-written SDK seams | SDK runtime | `sdk-public-api`, `sdk-runtime-contract`, `wrapper-gates`, `breaking-change-review`, `changelog-drift` |
| OpenAPI, operation names, or MCP parity stamps | API parity | `operation-coverage`, `openapi-lint`, `operation-parity-drift`, `generator-comparison`, `naming-taxonomy` |
| `docs/**`, `README.md`, `AGENTS.md`, or `CLAUDE.md` | Docs and contracts | `docs-index-drift`, `docs-drift`, `contract-inventory`, `docs-counts`, `conformance-drift`, `enterprise-audit` |

## Redundancy Ledger

| Gate A | Gate B | Overlap | Verdict | Rationale |
|---|---|---|---|---|
| `mcp-contract` | `mcp-agent-ux` | MCP tool count from `docs/mcp-tools.json` | INTENTIONAL | They share a cheap count assertion but validate different contracts: structure/resources/prompts versus agent-facing UX. |
| `mcp-contract` / `mcp-agent-ux` | `mcp-tool-manifest-drift` | MCP tool count from docs versus live server introspection | INTENTIONAL | The manifest count comes from the running server; the docs count is curated. Keeping both catches either side drifting. |
| `mcp-write-safety` | `mcp-tool-manifest-drift` | MCP destructive tool set | KEEP-BOTH | The drift gate proves the manifest is fresh; write-safety consumes it and then checks per-tool source markers. |
| `operation-parity-drift` | `mcp-tool-manifest-drift` | MCP tool names | KEEP-BOTH | Parity joins tool names to OpenAPI and Go MCP data; the manifest gate only proves the names are current. |
| `cli-write-safety` | `mutation-safety` | Write-command safety posture | KEEP-BOTH | CLI write semantics and cross-surface mutation policy overlap but are not substitutes. |

No gate is collapsed here. A future maintainer can collapse overlapping count
assertions only after deciding which contract owns each assertion and moving
the unique checks without loss.
