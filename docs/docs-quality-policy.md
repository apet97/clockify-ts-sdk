# Documentation Quality Policy

Documentation is part of the product. A generated SDK, CLI, and MCP server can
look impressive while still being unsafe to use if the docs overclaim, hide
proof requirements, use stale package names, or bury live-risk boundaries. This
policy keeps docs concise, evidence-first, and useful for non-coder operators.

## Evidence-first claims

Every readiness claim must point to a gate, generated truth surface, receipt, or
explicit residual risk. Prefer this shape:

- Claim: what is true now.
- Evidence: command, contract file, generated surface, or receipt path.
- Boundary: mock-only, live sandbox required, readiness pending, or publish
  not approved.

Do not claim broad readiness from a narrow check. For example, `npm test` is not
release readiness; it is one input to package proof.

`node scripts/plan.mjs workflow --workflow first-run-support` is a no-network
operator support map, not proof. Documentation may cite it to orient a
non-coder user, but readiness claims still need the relevant gate, receipt, or
residual-risk note. If the page mentions first-run support, preserve
`safeCommandHints` as safe command suggestions only.

## Generated claim backing

User-facing workflow claims must be backed by generated truth surfaces. When a
README, cookbook, onboarding note, or release checklist says a workflow exists
on SDK, CLI, TypeScript MCP, or GOCLMCP, the claim must agree with
`docs/product-surface.json`.

Each workflow in that surface must carry `surfaceAvailability`, `proofMode`,
`recovery`, and `intentionalGaps`. Empty SDK, CLI, TypeScript MCP, or GOCLMCP
arrays are allowed only when `intentionalGaps` explains the missing surface.

## Style rules

- Use exact package names: `clockify-sdk-ts-115`, `@apet97/clockify-cli-115`, and
  `@apet97/clockify-mcp-115`.
- Keep changelog package/import examples on the same exact package names as
  the READMEs; changelogs are user-facing migration documents, not historical
  excuses for stale copy-paste commands.
- Use exact commands and file paths instead of vague instructions.
- Keep copy-paste snippets safe: placeholder secrets only, public package
  imports only, and mock/live boundaries stated.
- Keep first-run support wording precise: `safeCommandHints` are a command map,
  not validation output.
- Keep generated tables generated. Do not hand-edit CLI or MCP command tables.
- Keep counts tied to generated surfaces such as `docs/product-surface.json`,
  `docs/openapi-operations.json`, `docs/operation-parity.json`,
  `docs/cli-commands.json`, and `docs/mcp-tools.json`.
- State publish posture honestly: packable/local by default, not public npm
  publication by default.

## Unsupported claim blacklist

Avoid unsupported marketing phrases unless the same paragraph gives exact proof
and scope. Do not use phrases like `world-class`, `battle-tested`,
`production-ready`, `best-in-class`, `just works`, or `zero-config` in product
or operator docs. They sound confident while hiding evidence.

## Non-coder readability

Operator docs should answer what to run, what it proves, what it does not prove,
and what risk remains. If a page requires source-code knowledge to use safely,
add a checklist, table, or exact command before calling it complete.
## Required proof

Before claiming documentation quality readiness, run or cite:

- `make docs-quality`
- `make user-docs`
- `make docs-index-drift`
- `make docs-drift`
- `make readme-tables-drift`
- `make troubleshooting-drift`
- `make release-readiness` when making final readiness claims
