# SDK CLI MCP Axioms

These are the rules for making this repo feel like a serious SDK product without buying a generator platform.

## Axioms

1. One truth source beats three clever layers.

   The canonical API truth starts in GOCLMCP, flows into the local OpenAPI snapshot, then into generated code. Do not repair generated output by hand.

2. Generated code is a dependency, not the product.

   Users should touch the durable SDK wrapper, CLI commands, and MCP tools. Local generated output can be replaced if the public seams stay stable.

3. Every public surface needs a receipt.

   SDK helpers need typed examples and tests. CLI commands need stable JSON and exit codes. MCP tools need structured content, stable error codes, and recovery hints.

4. Parity must be visible.

   If a workflow exists in MCP, the related SDK and CLI path should be obvious. If the Go MCP covers more, the gap must be named, not hidden.

5. Docs are generated until proven impossible.

   Tables of commands, tools, exports, packages, versions, and gates should come from metadata or a checker. Manual prose is for judgment, not inventories.

6. Tarballs are the real artifact.

   Source-tree tests are not enough. A fresh consumer project must install the packed SDK, CLI, and MCP tarballs and prove imports and bins work.

7. Mock first, live second.

   Deterministic mock/replay tests should cover local behavior. Live sandbox tests prove Clockify semantics only when a mock cannot prove the claim.

8. Writes must be boringly safe.

   Risky CLI and MCP writes need dry-run, confirmation, stable cleanup, or a documented reason why the operation is already safe.

9. Errors are product design.

   Human-readable messages can change. Stable error codes, recovery hints, request IDs, and retry guidance are the contract.

10. Perfect means reproducible by a tired non-coder.

    The repo is not perfect until `make help` explains what to run, `make perfect-fast` proves local safety, `make perfect-full` proves generation and package readiness, and `make perfect-live` is explicitly sandbox-gated.
    First-run confusion starts with `node scripts/plan.mjs workflow --workflow first-run-support` and `safeCommandHints`; that workflow is a map, not proof.

## Consequences

- Add metadata before adding prose.
- Add gates before adding promises.
- Prefer small wrapper seams over broad frameworks.
- Prefer deleting drift-prone lists over maintaining them manually.
- Never make a release/readiness claim without a command that proves it.
