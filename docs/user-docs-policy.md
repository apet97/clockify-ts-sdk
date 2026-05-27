# User Documentation Policy

The repo has three user-facing packages and one contributor-facing
generation pipeline. Users should not need to reverse-engineer package
manifests, generated output, or agent memory to get started safely.

## Documentation roles

| Document | Audience | Must answer |
|---|---|---|
| `README.md` | Contributors and agents | What this repo ships, where OpenAPI truth lives, and which one-command gates prove it. |
| `wrapper/README.md` | SDK users | How to install, authenticate, paginate, handle errors, inspect response metadata, and use webhooks. |
| `cli/README.md` | CLI users | How to configure auth/workspace, choose output mode, use commands, and interpret exit codes. |
| `mcp/README.md` | MCP users and agents | How to configure the server, prefer workflow tools, read result envelopes, and discover resources/prompts. |
| `docs/install-personas.md` | Operators | Which install path to use for SDK, CLI, and MCP personas. |
| `docs/migration-guide.md` | Migrating users and agents | Current package names, import paths, auth entrypoints, generated-surface boundaries, CLI behavior, and MCP behavior. |
| `docs/troubleshooting.md` | Users in failure mode | Stable error codes, recovery hints, and retryability from the shared registry. |

## Required style

- Keep examples runnable and copy-pasteable.
- Prefer exact package names over generic `clockify` wording.
- State mock/replay settings as test-only.
- Keep release/publish posture honest: packable by default, not
  public npm publication by default.
- Do not duplicate generated tables by hand; regenerate them.
- Keep readiness claims evidence-first: exact command, generated surface, receipt, or explicit residual risk.
- Avoid unsupported marketing claims; use `docs/docs-quality-policy.md` as the style contract.

## Contract-shape rule

User-docs contract shape is part of documentation readiness. The
checker must fail before scanning README, changelog, policy, cookbook,
or troubleshooting surfaces when the JSON contract has unsafe
repo-relative evidence paths, duplicate document ids, duplicate
document paths, malformed marker lists, or missing
Make/docs/inventory/audit wiring.

## Required receipts

Before claiming user-doc readiness, run or cite:

- `make user-docs`
- `make docs-quality`
- `make readme-tables-drift`
- `make troubleshooting-drift`
- `make docs-index-drift`
- `make version-policy`
- `make compatibility-contract`
