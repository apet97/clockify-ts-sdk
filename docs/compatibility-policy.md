# Compatibility Policy

This repo has three public surfaces: the TypeScript SDK, the CLI, and
the MCP server. They can evolve quickly before `1.0.0`, but public
changes still need a receipt.

## Compatibility rules

| Surface | Stable contract | Breaking-change rule |
|---|---|---|
| SDK | Package root exports, documented subpaths, auth factory behavior, error classes, pagination helpers, webhook helpers, request hooks, and generated resource client naming. | Do not remove or rename a public export without a changelog entry, migration note, and major-version plan. Prefer adding a wrapper seam over exposing generated internals. |
| CLI | Binary names, command names, global flags, JSON envelope shape, and exit codes. | Do not change command names, exit-code meanings, or JSON field meanings without a migration note and changelog entry. Add aliases before removals. |
| MCP | Tool names, output envelope fields, output schemas, guide resources, prompts, and confirmation flow. | Do not remove tools or envelope fields without a migration note and changelog entry. Add replacement tools first and preserve recovery fields. |
| OpenAPI generation | GOCLMCP canonical source, corrected snapshot, Fern config, SDK method stamps, pagination stamps, and discrepancy ledger. | Do not hand-edit generated/snapshot surfaces. Change GOCLMCP sources or generator data first, then regenerate and run drift gates. |

## Deprecation pattern

Use this pattern when a public symbol or behavior needs to go away:

1. Add the replacement first.
2. Add a JSDoc `@deprecated` note for SDK symbols.
3. Call `warnOnce(key, message)` at runtime for SDK deprecations where practical.
4. Add changelog and migration-guide entries in the same change.
5. Keep the old path until the next major version.
6. Remove only after the final proof stack is green.

The SDK helper lives in `wrapper/deprecation.ts`; tests live in
`wrapper/tests/deprecation.test.ts`.

## Compatibility window

Keep deprecated public paths until the next major version unless explicit maintainer approval and migration receipt exist. Add the replacement first, then keep changelog and migration-guide notes current while the old path exists. The breaking-change review must state what remains temporarily supported and which final proof stack closes the removal.
## Required receipts

Before claiming compatibility-safe readiness, run or cite:

- `make sdk-public-api`
- `make cli-contract`
- `make mcp-contract`
- `make operation-parity-drift`
- `make changelog-drift`
- `make breaking-change-review`
- `make compatibility-contract`

For broad release claims, these are inputs to `make perfect-fast` and
`make perfect-full`, not replacements for those larger gates.
