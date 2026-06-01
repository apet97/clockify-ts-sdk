# Maintenance Playbook

This playbook keeps the SDK, CLI, MCP, OpenAPI snapshot, and generated TypeScript
core maintainable without depending on a paid hosted SDK generator. It is the
operator path for routine upkeep, dependency updates, generator bumps, Clockify
API drift, release rehearsals, and rollback.

## Maintenance cadence

| Cadence | Owner action | Proof gate |
|---|---|---|
| Every local change | Run the smallest change-scope gates from `docs/change-impact-policy.md`. | `make change-impact` plus the listed target set. |
| Weekly when active | Refresh product-surface, README tables, troubleshooting, operation parity, and risk register decisions if code moved. | `make perfect-fast` when verification is allowed. |
| Monthly | Review dependency pins, Node runtime floor, local SDK generator wiring, GOCLMCP drift, mock/replay coverage, risk register, and performance-budget calibration. | `make dependency-boundary`, `make generator-config`, `make risk-register`. |
| Before release or handoff | Run packed-consumer proof, release readiness, command receipts, and the enterprise audit. | `make perfect-full`, `make pack-smoke`, `make release-readiness`. |
## No-network maintenance planner

Use `node scripts/plan.mjs maintenance --cadence all` when an operator needs a
concrete upkeep path before running proof gates. It prints safe-start helpers,
required targets, docs to inspect, receipts to leave, and stop conditions for:

- weekly upkeep,
- monthly hygiene,
- dependency updates,
- local SDK and OpenAPI generator bumps,
- Clockify API drift response,
- release or final-readiness rehearsal,
- rollback and recovery.

The planner is intentionally preflight-only. `make maintenance-playbook`
shape-checks the generated all-cadences plan for no-network, no-command, and
no-env posture plus required cadence IDs, safe-start helpers, proof targets,
docs, receipts, and stop conditions. It does not run Git, npm, Docker, Fern,
tests, builds, or Clockify API calls. Use `--format json` when another tool
needs to consume the same plan.

## Dependency update procedure

1. Identify the package surface: SDK wrapper, CLI, MCP, root scripts, local generator,
   GOCLMCP, or documentation-only.
2. Read `docs/dependency-policy.md`, `docs/runtime-support.json`, and
   `docs/dependency-boundary.json` before changing versions.
3. Keep runtime dependencies small. Prefer dev tooling over runtime expansion.
4. Update lockfiles only for the package being changed.
5. Update changelogs when package behavior, installs, commands, exports, or
   runtime requirements change.
6. Use the change-impact contract to choose proof gates. Do not widen to live
   proof unless live Clockify behavior changed and sandbox credentials are known.

## Local SDK and OpenAPI generator bump procedure

The local TypeScript SDK generator and the GOCLMCP OpenAPI generator are
release-critical pins. A bump is not a routine dependency update.

1. Record the reason for the bump in a decision record or risk-register note.
2. Run the GOCLMCP canonical chain first: `make gen-openapi`, all four drift
   gates, and `go test ./internal/tools/...` from `../GOCLMCP` when allowed.
3. Copy only the regenerated OpenAPI snapshot from GOCLMCP; never hand-edit
   `spec/corrected/clockify.corrected.openapi.yaml`.
4. Run `make sdk-codegen` and `make sdk-codegen-drift`; never patch
   `output/ts-sdk/**` or `wrapper/src/**` directly.
5. Compare generated method stamps, operation parity, SDK public API, wrapper
   runtime seams, CLI/MCP contracts, and packed-consumer proof.
6. Close or update related risk-register entries only after receipt-backed proof.

## Clockify API drift response

When Clockify behavior differs from the current snapshot, do not patch generated
TypeScript or local docs first.

1. Capture raw evidence only under ignored `spec/evidence/probes/` paths.
2. Promote a sanitized finding into `spec/evidence/discrepancies.md` using the
   existing evidence format.
3. Fix canonical sources or generator data in GOCLMCP when the drift is real.
4. Regenerate the OpenAPI snapshot, operation inventory, operation parity, CLI/MCP
   README tables, and package docs that describe the behavior.
5. Keep unsupported behavior honest in SDK, CLI, MCP, receipts, and docs instead
   of hiding it behind magical fallback code.

## Release rehearsal procedure

1. Confirm `docs/risk-register.md` has no unowned open release blocker.
2. Run package gates for SDK, CLI, and MCP when verification is allowed.
3. Run `make pack-smoke` to test tarballs in clean consumer projects.
4. Keep npm publication disabled by default; do not touch release workflow or
   auth without explicit maintainer approval.
5. Capture command receipts only from real command output.
6. Remove `docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md` only after
   proof evidence is captured, receipts are complete, and permanent docs
   contain the surviving context; then run `make perfect-full`.

## Readiness context maintenance rule

For release rehearsal, rollback, handoff, or final-readiness maintenance, create
or refresh the support bundle:

```bash
node scripts/plan.mjs workflow --workflow first-run-support
node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json
```

Inspect the workflow plan and support bundle `readinessContext` before changing
risk status, claiming readiness, or handing work to another maintainer. Preserve
`safeCommandHints`, `finalBlockingSignalIds`, `blockingSignalIds`,
`riskRoutingSummary`, and `orderedProofChainCoverage` in the support packet or
final receipt when those values explain why the repo is blocked or safe to
continue.

## Rollback procedure

If an update breaks the SDK, CLI, MCP, generation chain, or package smoke:

1. Stop widening the change and identify the failed surface.
2. Preserve raw command output in command receipts or a support bundle if it
   is part of a release/handoff attempt.
3. Revert only the change you made; never reset unrelated user work.
4. Restore the previous documented pin, contract value, generated metadata, or
   package manifest field.
5. Re-run the narrow target that failed before claiming the rollback is safe.

## Required maintenance receipts

Maintenance changes should leave one of these receipts:

- Changelog entry for package-visible behavior.
- Risk-register entry for an accepted, open, provisional, or upstream-blocked
  state.
- Decision record for source-of-truth, generator, publish, live-proof, or final
  proof strategy.
- Final proof receipt for release/handoff readiness.
- Support bundle for user-reported failures.
