# Product North Star

This repo should become a polished Clockify developer platform in
TypeScript: generated where generation is valuable, hand-written where
ergonomics matter, and verified where Clockify's public documentation
is incomplete.

The comparison point is not "a generated SDK exists." The comparison
point is the kind of product users expect from a focused SDK vendor:
consistent APIs, current docs, trusted generation, reliable CI, clear
release gates, and examples that survive contact with a real account.

## What "Perfect" Means Here

- **One trusted API truth.** GOCLMCP owns canonical OpenAPI generation,
  live probes, discrepancy evidence, and drift gates. This repo consumes
  that truth; it does not hand-edit snapshots to make a local build pass.
- **Generated core, durable public layer.** Local generator output stays
  replaceable. Public convenience APIs live in small wrapper files with
  focused tests and stable exports.
- **One Clockify vocabulary.** SDK, CLI, MCP, docs, changelog, examples,
  and tests use the same names for resources, workflows, errors, and
  recovery actions.
- **Receipts over magic.** Mutations return useful IDs and changed sets.
  Recoverable failures return stable codes and next steps. Agent-facing
  workflows return `next` actions instead of making the caller guess.
- **Thin layers.** Every abstraction must earn its place by reducing
  repeated complexity, preserving generated-code replaceability, or
  making user workflows measurably easier.
- **Live evidence where it matters.** Type checks and unit tests are not
  enough for publish/readiness claims. Anything touching real Clockify
  semantics needs a sandbox probe or a deliberately documented reason it
  cannot be probed.
- **Docs as product.** README snippets, CLI examples, MCP examples, and
  generated resource docs must be runnable or explicitly marked as
  illustrative. No stale names, no catch-all lists, no generic SDK hype.
- **One-command proof.** A non-coder should be able to run root targets
  for fast local proof, full generation/package proof, and explicit
  sandbox/live proof without remembering package internals.

## Current Package Roles

| Package | Role | Product bar |
|---|---|---|
| `wrapper/` / `clockify-sdk-ts-115` | Core TypeScript SDK | Idiomatic imports, dual ESM/CJS, typed errors, pagination helpers, webhooks, observability hooks, and narrow public seams over generated output. |
| `cli/` / `@clockify115/cli` | Human and automation CLI | Predictable command groups, JSON output, config/env precedence, useful error messages, and parity with SDK/MCP concepts. |
| `mcp/` / `@clockify115/mcp-server` | Agent-facing Clockify workflows | Workflow-first tools, 127 advertised tools, rich result envelopes, recovery hints, dry-run confirmation tokens, and clean live sandbox cleanup. |
| `spec/` + `output/` | Reproducible generation inputs/outputs | Immutable snapshot discipline, no hand edits to generated surfaces, and explicit discrepancy evidence. |

## Final Architecture Shape

1. **GOCLMCP canonical layer**
   - Owns the curated source bundle, generator script, canonical
     OpenAPI, tool catalog, live probes, and discrepancy evidence.
   - Exposes contract surfaces this repo can compare against:
     `docs/openapi/clockify-openapi.yaml`, `docs/tool-catalog.json`,
     `docs/api-parity-matrix.md`, `docs/agent-cookbook.md`, and live
     test docs.

2. **Local generated core**
   - Generated from `spec/corrected/clockify.corrected.openapi.yaml`.
   - May be inspected and synced as reproducible output.
   - Must not be edited directly.

3. **Durable SDK wrapper**
   - Owns auth ergonomics, fetch composition, pagination, errors,
     rate-limit helpers, health checks, webhook helpers, scoped clients,
     deprecation rails, and examples.
   - Keeps files small. If a helper becomes a dumping ground, split by
     responsibility and test the split.

4. **CLI**
   - Uses the wrapper and keeps no hidden Clockify semantics of its own.
   - Output is stable enough for scripts. `--json` stays machine
     friendly.

5. **MCP**
   - Uses the wrapper and speaks in user workflows first, domain tools
     second.
   - Mirrors the Go MCP's durable contract where appropriate, while
     staying a pure Node package with TypeScript-native seams.

6. **Docs and release gates**
   - Root docs explain the repo.
   - Package docs explain user-facing usage.
- Agent docs explain how to change the repo safely.
- CI gates prove the package that changed, plus any upstream package
  it depends on.
- Root gates (`make perfect-fast`, `make perfect-full`,
  `make perfect-live`) connect the package-specific proof chain into
  one operator-facing surface.

## How Agents Should Code Here

1. Read `AGENTS.md`, then the package README you are touching, then the
   nearest tests.
2. Check `git status --short --branch` and preserve user-owned dirty
   changes.
3. If the change is spec-shaped, start in GOCLMCP. If it is public SDK
   ergonomics, start in `wrapper/`. If it is workflow/agent behavior,
   compare `mcp/` with GOCLMCP's `docs/tool-catalog.json` and
   `docs/agent-cookbook.md`.
4. Write or update a focused failing test before behavior changes.
5. Make the smallest durable implementation. Delete duplicated or
   ornamental code when a simpler local pattern exists.
6. Run the package gates for the touched area. Add live sandbox proof
   when behavior claims depend on Clockify runtime behavior.
7. Update docs and changelogs in the same change as user-visible
   behavior.
8. Finish with exact evidence: files changed, commands run, what passed,
   and what remains risky.

## What To Remove, Not Add

- Remove stale aliases, duplicate option spellings, and generated-output
  workaround code once a canonical layer can express the behavior.
- Remove docs that restate obvious file trees without telling the next
  worker what to do.
- Remove tests that pin incidental strings instead of durable wire
  contracts.
- Remove any abstraction that exists only so the repo looks more
  "platform-like"; this repo should be platform-grade by proof, not by
  ceremony.

## Vendor-Grade Inspiration, Interpreted Locally

- Speakeasy's public SDK-generation pitch emphasizes OpenAPI input,
  validation, customization via guardrails/hooks, CI-generated pull
  requests, publishing, retries, pagination, and documentation. The local
  equivalent is deterministic generation plus hand-written seams that are
  tested and documented.
- Stainless' edition/normalizer docs emphasize controlled breaking
  changes, diagnostics tied back to source input, simpler generated
  types, and shared references. The local equivalent is pinned generator
  versions, diff review, discrepancy evidence, and no silent snapshot
  surgery.
- Fern's TypeScript SDK docs center source inputs, validation,
  generation, and publishing flow. The local equivalent is the corrected
  OpenAPI snapshot, `make sdk-codegen`, `make sdk-codegen-drift`,
  `wrapper npm run sync`, and package-specific publish gates.

Do not cargo-cult any vendor. Use these as quality signals, then keep
the implementation repo-native.

## Done-State Checklist

- `AGENTS.md`, `CLAUDE.md`, root README, package READMEs, changelogs,
  and plan docs agree on package names, versions, counts, and workflow
  posture.
- Wrapper public exports are intentional and tested in ESM and CJS.
- CLI commands are discoverable, scriptable, and covered by config/env
  precedence tests.
- MCP `tools/list` metadata is agent-ready; workflow tools return
  structured receipts and recovery; destructive workflows have dry-run
  confirmation.
- Generated artifacts can be regenerated without losing hand-written
  behavior.
- Live tests either pass against the sandbox or skip loudly because env
  is absent.
- The repo can explain itself to a human, a Claude Code session, and a weaker follow-on agent without relying on memory from prior chats.
