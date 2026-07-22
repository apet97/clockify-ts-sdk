# Agent Handoff Policy

This repo is maintained by humans and agents. A follow-on agent should
be able to recover the repo boundary, generated-path rules, proof
commands, and temporary goal context without reading chat history.

## Required guidance surfaces

| Surface | Role |
|---|---|
| `AGENTS.md` | Canonical contributor and agent contract. It owns repo boundaries, first reads, build chain, critical conventions, and hard stops. |
| `CLAUDE.md` | Concise Claude Code companion. It must point back to `AGENTS.md`, not replace it. |

## Handoff rules

- Keep `AGENTS.md` canonical. If another guide disagrees, fix the
  other guide or explicitly explain why.
- Keep package names, versions, counts, generated-path boundaries, and
  root gates aligned across `AGENTS.md`, `CLAUDE.md`, README files,
  and generated metadata.
- Never rely on chat memory for open work. Add temporary context for
  active long-running goals; keep it through evidence capture and remove it
  only after command receipts are complete and immediately before final acceptance.
- When a follow-on agent inherits setup, auth, runtime, or support-handoff
  uncertainty, start with
  `node scripts/plan.mjs workflow --workflow first-run-support` and preserve
  `safeCommandHints` before asking for logs, retrying live calls, mutating
  Clockify data, or changing release posture.
- Do not hand-edit `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**`.
- Future agents should prefer `make perfect-fast`, `make perfect-full`, and `make perfect-live` over memorized package internals.

## Current proof posture

- Keep local proof laptop-safe. Prefer focused package/doc gates or
  `CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' make perfect-fast`
  for deterministic local proof.
- Treat the manual GitHub Actions **Mutation** workflow as the routine
  mutation-score proof. Use `target=all` for release/readiness proof;
  use `target=wrapper`, `target=mcp`, or `target=cli` only for focused changes.
- `make mutation-ci` verifies the workflow wiring and belongs in
  `perfect-full`; local `make mutation` is opt-in maintainer proof,
  not a default handoff requirement.
- After a direct `main` push, watch the new GitHub Actions runs and fix
  clean-checkout-only drift before declaring the branch green.

## Required receipts

Before claiming agent-handoff readiness, run or cite:

- `make agent-handoff`
- `node scripts/plan.mjs workflow --workflow first-run-support`
- `make docs-index-drift`
- `make user-docs`
- `make enterprise-audit`
- `make perfect-full` after removing temporary context and completing the receipts
