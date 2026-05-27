# Dependency License Transparency Policy

Runtime dependencies are part of the SDK product surface. Users and operators
should be able to see which packages ship with the SDK, CLI, and MCP tarballs,
why each dependency exists, and which license obligation it carries without
running a third-party SaaS scanner.

## Runtime dependency rule

| Package | Runtime dependency posture |
|---|---|
| `clockify-sdk-ts-115` | No runtime dependencies; wrapper ergonomics sit on generated code and platform APIs. |
| `@clockify115/cli` | Only small terminal ergonomics dependencies: command parsing, table output, and color. |
| `@clockify115/mcp-server` | Only MCP protocol support and schema validation. |

Any new runtime dependency must answer:

1. Why is this runtime code instead of dev tooling?
2. Which package pulls it in and which user feature needs it?
3. Is the license compatible with MIT redistribution?
4. Does it affect package size, startup time, or browser/server runtime support?
5. Which gates prove the dependency did not break install, pack, or smoke paths?

## Contract-shape rule

Dependency-license contract shape is part of license readiness.
`make dependency-license` must fail before trusting manifest or policy evidence
when `docs/dependency-license-contract.json` has an invalid schema version,
missing purpose, missing explicit invariants, unsafe manifest/evidence paths,
untyped policy markers, untyped package or runtime dependency ledger entries,
malformed license allow/deny lists, or malformed Make/docs/audit wiring.

## Allowed runtime dependency ledger

| Dependency | Manifest range | Used by | License | Why it exists |
|---|---:|---|---|---|
| `cli-table3` | `^0.6.5` | `@clockify115/cli` | MIT | Human-readable table output. |
| `commander` | `^12.1.0` | `@clockify115/cli` | MIT | CLI command parsing and help. |
| `picocolors` | `^1.1.1` | `@clockify115/cli` | ISC | Tiny optional terminal color output. |
| `@modelcontextprotocol/sdk` | `^1.29.0` | `@clockify115/mcp-server` | MIT | MCP server protocol implementation. |
| `zod` | `^3.25.0` | `@clockify115/mcp-server` | MIT | Runtime schemas for MCP input/output contracts. |

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
