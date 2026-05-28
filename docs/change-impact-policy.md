# Change Impact Policy

Every meaningful change should make the right proof targets obvious
before a human or agent starts editing. This policy maps common change
scopes to the gates, docs, changelogs, and receipts that must move with
that scope.

## Rules

1. Start from the changed surface, not from a favorite command.

   OpenAPI, SDK runtime, CLI, MCP, docs, operator helper tooling,
   release/CI, performance, and final proof changes each have different
   proof requirements.

2. User-visible changes need documentation and changelog coverage.

   SDK exports, CLI commands, MCP tools, error semantics, workflows,
   install behavior, and package surfaces must update the relevant docs
   and package changelog.

3. Generated and snapshot surfaces remain upstream-first.

   If a change touches OpenAPI shape, generator behavior, or generated
   output, use the GOCLMCP/Fern chain instead of patching snapshots by
   hand.

4. Proof can be deferred only when the final receipt says so.

   Live proof and performance calibration may be intentionally deferred
   only through the final proof receipt and risk register, not by
   deleting gates.

5. Change-scope routing must stay unambiguous.

   Duplicate scope ids, path probes, required targets, required docs, or changed-path entries are contract failures. If two scopes need the same path, keep the duplicate intentional by using a broader pattern instead of copy-pasting identical rows.

## Required proof

- `make change-impact` checks this matrix and shape-checks the generated
  default plan.
- `node scripts/plan.mjs change-impact --scope <id>` prints the exact
  proof plan for one change scope without running commands.
- `node scripts/plan.mjs change-impact --path <changed-path>` maps a path
  to matching change scopes for quick triage.
- Operator helper changes route through both `make operator-toolbox` and
  `make contract-inventory` so no-network helper ownership and documented
  command coverage stay aligned. The contract also probes representative
  toolbox and inventory-helper paths so path-based triage cannot silently stop matching the operator-toolbox scope. It also probes every changed path
  in that scope and pins required operator-toolbox gates/docs so the scope
  cannot keep its name while losing its proof obligations.
- First-run support workflow changes route through diagnostics, quickstart,
  support-bundle, workflow-cookbook, acceptance-scenario, product-surface,
  user-docs, docs-index, contract-inventory, and enterprise-audit checks so
  local no-network handoff cannot drift away from the public workflow map.
- `make contract-inventory` checks that this contract is wired into the
  hardening stack.
- Target-specific gates still prove the actual change.

Change-impact contract shape is part of routing correctness. The checker validates schema version, purpose, safe repo-relative file paths for real docs/scripts, typed generated-plan metadata, typed path-probe expectations, typed scope requirement expectations, and scope entries before trusting the matrix. Path-pattern fields such as `../GOCLMCP/**` remain routing patterns, not files to read.

The plan generator is no-network and static. It does not run Git, npm, Docker,
Fern, tests, builds, or Clockify API calls, and it is not proof by itself.
