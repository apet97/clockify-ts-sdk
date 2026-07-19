# Breaking Change Review Policy

Public breakage is sometimes necessary, especially before `1.0.0`, but it must
never be accidental. SDK exports, CLI commands, MCP tools, JSON envelopes,
OpenAPI method stamps, generated paths, package names, and proof gates all need
a review trail before a user-visible removal or rename lands.

## No silent removals

A change is breaking when it removes, renames, or changes the meaning of any of
these surfaces:

| Surface | Breaking examples | Required review evidence |
|---|---|---|
| SDK | Package name, root export, subpath export, auth option, error class, pagination helper, webhook helper, request hook, or resource method name changes. | `docs/sdk-public-api.json`, SDK README, wrapper changelog, migration note, and replacement-first plan. |
| CLI | Binary, command, argument, global flag, exit code, JSON field, config precedence, or write semantics change. | `docs/cli-contract.json`, CLI README, CLI changelog, migration note, alias or compatibility window. |
| MCP | Tool name, prompt/resource URI, output schema, envelope field, confirmation token flow, destructive hint, or recovery shape change. | `docs/mcp-contract.json`, MCP README, MCP changelog, migration note, replacement tool or compatibility window. |
| OpenAPI/generator | Operation ID, SDK method stamp, pagination stamp, Last-Page stamp, corrected snapshot, Fern pin, or generated output location changes. | GOCLMCP source/generator change, discrepancy evidence, generator comparison, operation coverage, and drift gates. |
| Package/install | Package name, binary name, `exports`, packed files, engine floor, dependency boundary, or publish posture change. | Package contract, runtime support, supply-chain policy, release readiness checklist, and pack smoke. |
| Version/package identity | Manifest version, changelog anchor, product-surface package/version metadata, or README install example changes. | Version policy, package contract, changelog drift, release readiness checklist, and pack smoke. |

## Replacement-first rule

Before removal:

1. Add the replacement surface first.
2. Keep old SDK paths with JSDoc `@deprecated` and `warnOnce()` where practical.
3. Add CLI aliases or explicit migration commands before command removal.
4. Add MCP replacement tools, resources, or prompts before removing old names.
5. Update receipt examples when output shape changes.
6. Add changelog entries and migration-guide notes in the same change.
7. Run the narrow contract gate first, then the package and final proof gates.

## Review record

A breaking-change review must answer these questions in the commit, PR, release
note, or handoff packet:

- What public surface changes?
- What replacement exists today?
- What old behavior remains temporarily supported?
- What exact docs/changelog/migration entries changed?
- What version-policy outcome applies to the changed package surface?
- What commands prove SDK, CLI, MCP, OpenAPI, package, and acceptance surfaces
  still line up?
- What residual risk remains for users or agents?

For the 1.0 SDK closure, the governed mappings are exact:

- `allowInsecureBaseUrl` → `allowNonClockifyHttpsHost`
- `findOrCreateClient` → `ensureClient`
- `ArchiveThenDeleteResource` → `ArchiveThenDeleteAdapter<TCurrent>`

The old names are removed rather than retained as aliases. The narrow gate runs
negative fixtures that fail if any removed symbol or replacement is omitted;
the SDK compiler fixtures fail if an old import or option resolves again.

## Forbidden shortcuts

- Do not remove a public path only because generated code changed shape.
- Do not hide a breaking change inside a docs-only or refactor commit.
- Do not rely on tests alone when migration docs, changelogs, or examples are stale.
- Do not use pre-`1.0.0` status as permission for silent breakage.
- Do not hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or `wrapper/src/**`
  to keep a breaking change quiet.
## Proof gates

Before claiming a breaking change is reviewed, run or cite:

- `make breaking-change-review`
- `make compatibility-contract`
- `make sdk-public-api`
- `make cli-contract`
- `make mcp-contract`
- `make operation-coverage`
- `make acceptance-scenarios`
- `make changelog-drift`
- `make version-policy`
- `make pack-smoke`
