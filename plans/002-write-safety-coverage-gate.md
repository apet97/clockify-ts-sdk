# Plan 002: Gate that every destructive MCP delete is guarded or explicitly exempt

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9839a72..HEAD -- scripts/check-mcp-write-safety.mjs docs/mcp-write-safety-contract.json`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-guard-destructive-mcp-deletes.md` (the gate will FAIL until every destructive delete is guarded; 001 makes that true)
- **Category**: security
- **Planned at**: commit `9839a72`, 2026-06-16

## Why this matters

The reason nine destructive deletes shipped unguarded (see Plan 001) is that
`check-mcp-write-safety.mjs` only verifies the tools *already listed* in
`confirmationGuardedDomainTools` carry the handshake — it never asserts that
*every* destructive delete is on that list. So a new `*_delete` tool can be added
with `destructiveHint: true` and no guard, and every gate stays green. This plan
adds the missing assertion: every discovered destructive delete/remove tool must
be either in `confirmationGuardedDomainTools` or in a new explicit
`confirmationExemptDestructiveTools` allowlist (with the maintainer's reason). It
turns "we remembered to guard these six" into "the build fails if any destructive
delete is unguarded".

## Current state

- `scripts/check-mcp-write-safety.mjs` already has a `discoverDestructiveTools()`
  helper (it finds every tool whose registration contains
  `destructiveHint: true`) and uses it to enforce a minimum count and per-tool
  semantics. Excerpt of the relevant tail (around lines 220–265):

  ```js
  for (const toolName of contract.confirmationGuardedDomainTools) {
      const text = findToolFile(toolName);
      const registration = registrationBlock(text, toolName);
      // ... asserts dry_run/confirm_token markers + requireConfirmation call ...
  }

  const destructiveTools = await discoverDestructiveTools();
  if (destructiveTools.length < contract.minimumDestructiveToolCount) { /* ... */ }

  for (const tool of destructiveTools) {
      if (contract.highRiskWorkflowTools.includes(tool.name)) continue;
      if (contract.idempotentWorkflowTools.includes(tool.name)) { /* ... */ continue; }
      // ... asserts delete/remove/archive semantics + receipt + id-scoped ...
  }
  ```

  `discoverDestructiveTools()` returns objects shaped `{ name, registration, body }`.
  `failures` is an array; the script exits non-zero if it's non-empty and prints
  each failure.

- `docs/mcp-write-safety-contract.json` — after Plan 001, `confirmationGuardedDomainTools`
  has 15 entries. The contract has no `confirmationExemptDestructiveTools` field yet.
- The workflow tools `clockify_demo_cleanup` (destructive but idempotent) is in
  `idempotentWorkflowTools`; high-risk workflow writes are in `highRiskWorkflowTools`.
  Those are destructive but are NOT domain *deletes* and must be excluded from the
  new check.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run the checker directly | `node scripts/check-mcp-write-safety.mjs` | `MCP write-safety contract passed (...)` |
| Gate | `make mcp-write-safety` | passes |
| Full proof | `make perfect-fast` | exit 0 |

## Scope

**In scope**:
- `scripts/check-mcp-write-safety.mjs` — add the coverage assertion.
- `docs/mcp-write-safety-contract.json` — add `confirmationExemptDestructiveTools: []` and document it in `purpose` or a sibling comment-style key.

**Out of scope**:
- The tool source files (Plan 001 handles guarding them).
- Any other checker or contract.
- `idempotentWorkflowTools` / `highRiskWorkflowTools` handling — leave the existing exclusions as-is.

## Git workflow

- Branch: `advisor/002-write-safety-coverage-gate`
- Commit message: `feat(mcp): gate that every destructive delete is guarded or explicitly exempt`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the exemption field to the contract

In `docs/mcp-write-safety-contract.json`, add a top-level array `"confirmationExemptDestructiveTools": []` (empty after Plan 001). Add a one-line note to the contract `purpose` (or a new `"confirmationExemptDestructiveToolsNote"` string) explaining: "destructive delete/remove tools intentionally NOT behind the dry_run→confirm guard; each entry needs a written reason in this note."

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('docs/mcp-write-safety-contract.json','utf8'))"` → no output (valid JSON).

### Step 2: Add the coverage assertion to the checker

In `scripts/check-mcp-write-safety.mjs`, after the existing `for (const tool of destructiveTools)` loop, add a new loop that enforces guard-coverage. Target shape:

```js
// Every destructive DELETE/REMOVE domain tool must be guarded (dry_run→confirm)
// or explicitly exempted, so a new unguarded delete cannot ship silently.
const guardedSet = new Set(contract.confirmationGuardedDomainTools);
const exemptSet = new Set(contract.confirmationExemptDestructiveTools ?? []);
const workflowSet = new Set([
    ...contract.highRiskWorkflowTools,
    ...contract.idempotentWorkflowTools,
]);
for (const tool of destructiveTools) {
    if (workflowSet.has(tool.name)) continue;            // workflow writes use maybeConfirm separately
    if (!/_(delete|remove)\b/.test(tool.name)) continue; // only delete/remove domain tools
    if (guardedSet.has(tool.name) || exemptSet.has(tool.name)) continue;
    failures.push(
        `destructive domain tool ${tool.name} is neither in confirmationGuardedDomainTools nor confirmationExemptDestructiveTools`,
    );
}
```

Place it before the final `if (failures.length) { ... process.exit(1) }` block. Match the file's existing style (it uses `failures.push(...)`, no `console.log` for failures).

**Verify**: `node scripts/check-mcp-write-safety.mjs` → `MCP write-safety contract passed (...)`. (This only passes if Plan 001 has guarded all nine; if it prints a tool name, that tool still needs guarding via Plan 001 — STOP and report.)

### Step 3: Full proof

**Verify**: `make mcp-write-safety` → passes; `make perfect-fast` → exit 0.

## Test plan

- The assertion is itself the test: temporarily remove one tool from
  `confirmationGuardedDomainTools` and confirm `node scripts/check-mcp-write-safety.mjs`
  now fails naming that tool, then restore it. (Do this as a manual check; do not
  commit the temporary removal.)
- Verification: with the contract restored, `make mcp-write-safety` passes.

## Done criteria

ALL must hold:
- [ ] `docs/mcp-write-safety-contract.json` has `confirmationExemptDestructiveTools: []` and remains valid JSON.
- [ ] `scripts/check-mcp-write-safety.mjs` contains the coverage loop and references `confirmationExemptDestructiveTools`.
- [ ] Manual check: removing a guarded tool from the contract makes the checker fail naming it (then restored).
- [ ] `make mcp-write-safety` passes; `make perfect-fast` exits 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The checker prints any unguarded destructive tool name in Step 2 — that means Plan 001 is incomplete; report which tool(s).
- `discoverDestructiveTools()` or `failures` no longer exist / changed shape (the checker was refactored since this plan) — re-read the file and report the new shape.
- The new loop would flag a tool that is genuinely meant to be unguarded — STOP and ask the maintainer whether to add it to `confirmationExemptDestructiveTools` with a reason (do not add exemptions unilaterally).

## Maintenance notes

- This gate is the regression net for Plan 001. From now on, any new `*_delete`/`*_remove` MCP tool must be added to `confirmationGuardedDomainTools` (and guarded per the `add-mcp-tool` agent-task packet) or explicitly exempted with a written reason.
- The `add-mcp-tool.md` agent-task packet under `docs/agent-tasks/` should be updated to mention this gate (optional follow-up, not required for this plan).
- Reviewer should confirm the regex `/_(delete|remove)\b/` matches the repo's destructive-tool naming and that workflow/idempotent exclusions are preserved.
