# Contract Inventory Policy

The hardening stack is intentionally broad: SDK, CLI, MCP, OpenAPI,
docs, release safety, live proof, performance, and agent handoff all
have separate contracts. The inventory keeps those contracts from
becoming a pile of disconnected files.

## Rules

1. Every durable contract needs an inventory entry.

   If a policy, contract JSON, checker script, or Make target is part of
   the enterprise proof surface, list it in `docs/contract-inventory.json`.

2. Every focused contract must be discoverable.

   Inventory entries must point to the Make target, checker script,
   policy docs, contract docs, quality-gate row, and enterprise-audit
   requirement where applicable. If a contract owns a no-network helper
   report, planner, doctor, or support bundle, list that helper script too.
   Every `docs/*-contract.json` and `docs/*-policy.md` file must appear in
   the inventory so broad proof surfaces cannot hide outside the map.

3. Perfect gates must include required contracts.

   A contract that guards product readiness must be wired into both
   `make perfect-fast` and `make perfect-full`, unless it is explicitly
   a live-only, generation-only, or final-proof target.

4. Inventory is not proof by itself.

   The inventory proves wiring. The target-specific contract and final
   proof gates still prove behavior.

5. Inventory reports must be shape-checked.

   `make contract-inventory` must build the no-network inventory report
   in memory and assert its safe report shape: no network, no commands,
   no environment values, explicit generated report/helper ownership, and
   complete toolbox helper ownership and command coverage. Extra or duplicate
   helper command mappings must stay visible and fail the inventory contract.

6. Inventory routing must stay unambiguous.

   Duplicate entry ids, targets, per-entry helper lists, policy docs,
   contract docs, audit ids, report-generator markers, or required report
   ids are contract failures. Structural inventory invariants also guard
   the inventory JSON shape itself: schema version, purpose, safe
   repo-relative paths, typed entry lists, and typed report-generator
   configuration. Shared checker scripts are allowed when a single checker
   intentionally owns more than one target.

## Required proof

- `make contract-inventory` checks this policy and the generated inventory
  report shape; the report script runs in-process without spawning commands.
- `node scripts/contract-inventory-report.mjs` prints a static operator
  report of contract entries, Make targets, checker ownership,
  generated report/helper ownership, perfect-gate coverage, and
  missing-file signals, including every no-network toolbox helper's
  inventory owner status and documented command status, plus any extra or
  duplicate helper command mappings. It also prints inventory invariant
  status, including Structural shape invariants and an Inventory shape status
  section, so duplicate inventory ids, targets, docs, helpers, audit entries,
  unsafe paths, typed-list failures, boolean field mistakes, minimum-count
  mistakes, invalid entry objects, and JSON-shape guards are visible without
  reading the checker source. Required doc
  coverage is printed too, including any `docs/*-contract.json` or
  `docs/*-policy.md` file not listed in the inventory. Docs-index coverage
  is printed as well, so missing `docs/README.md` links are visible before
  running broader docs drift checks. Quality-gate coverage is printed too,
  so missing `docs/quality-gates.md` `make <target>` rows are visible before
  the checker fails. Ordered proof-chain coverage is printed too, so the
  contracts that own final proof command ordering remain visible in the
  map-of-maps.
- `make docs-index-drift` checks that inventory docs are linked.
- `make enterprise-audit` checks that the inventory itself is part of
  the hardening evidence map.

The report generator is no-network and does not run Git, npm, Docker, Fern,
tests, builds, or Clockify API calls. It is a map for humans, not proof.
