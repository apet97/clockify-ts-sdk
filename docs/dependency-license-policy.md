# Dependency License Transparency Policy

Runtime dependencies are part of the SDK product surface. Users and operators
should be able to see which packages ship with the SDK, CLI, and MCP tarballs,
why each dependency exists, and which license obligation it carries without
running a third-party SaaS scanner.

## Runtime dependency rule

| Package | Runtime dependency posture |
|---|---|
| `clockify-sdk-ts-115` | No runtime dependencies; wrapper ergonomics sit on generated code and platform APIs. |
| `@apet97/clockify-cli-115` | Only small terminal ergonomics dependencies: command parsing, table output, and color. |
| `@apet97/clockify-mcp-115` | Only MCP protocol support and schema validation. |

Any new runtime dependency must answer:

1. Why is this runtime code instead of dev tooling?
2. Which package pulls it in and which user feature needs it?
3. Is the license compatible with MIT redistribution?
4. Does it affect package size, startup time, or browser/server runtime support?
5. Which gates prove the dependency did not break install, pack, or smoke paths?
## Allowed runtime dependency ledger

| Dependency | Manifest range | Used by | License | Why it exists |
|---|---:|---|---|---|
| `cli-table3` | `^0.6.5` | `@apet97/clockify-cli-115` | MIT | Human-readable table output. |
| `commander` | `^12.1.0` | `@apet97/clockify-cli-115` | MIT | CLI command parsing and help. |
| `picocolors` | `^1.1.1` | `@apet97/clockify-cli-115` | ISC | Tiny optional terminal color output. |
| `@modelcontextprotocol/sdk` | `^1.29.0` | `@apet97/clockify-mcp-115` | MIT | MCP server protocol implementation. |
| `zod` | `^3.25.0` | `@apet97/clockify-mcp-115` | MIT | Runtime schemas for MCP input/output contracts. |

## Change rules

- Do not add runtime dependencies to the SDK wrapper without a decision record
  and package-size/startup evidence.
- Do not add HTTP clients, date libraries, AI SDKs, broad utility libraries, or
  framework dependencies to runtime code without a specific product reason.
- Update `docs/dependency-boundary.json`, this policy, and the dependency
  license contract in the same change as any runtime dependency change.
- Run package gates and `make pack-smoke` before trusting a changed dependency
  graph.
- Update the risk register if a dependency is accepted with a provisional,
  upstream-blocked, or license-review state.

## Proof gates

Before claiming dependency/license transparency readiness, run or cite:

- `make dependency-license`
- `make dependency-boundary`
- `make supply-chain`
- `make package-contract`
- `make performance-budgets`
- `make pack-smoke`
