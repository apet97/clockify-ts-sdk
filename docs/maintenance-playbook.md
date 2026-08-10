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

## Operations ownership and cadence

Each operation has one accountable owner. The owner must review failures and keep
the stated receipt.

The internal `scheduled_governance` name is a tier label, not a cron schedule.

| Operation | Owner | Cadence or trigger |
|---|---|---|
| Sandbox key health | Maintainer with access to the sandbox and GitHub Actions secrets | GitHub runs it each Monday at 07:00 UTC. The maintainer also dispatches it after each key rotation. |
| CodeQL | Repository security maintainer | GitHub runs it on pull requests, pushes to `main`, and each Monday at 04:23 UTC. |
| Mutation | Code owner for the changed package | GitHub runs `target=all` each Monday at 05:00 UTC. The code owner also dispatches the affected target after each substantive wave. Never run Stryker locally. |
| `governance-audit` | Repository maintainer | Workspace CI runs it on pull requests, pushes to `main`, and manual dispatch. Run it manually before a governance handoff. It has no dedicated schedule. |
| Live-evidence campaign | Maintainer with sacrificial-workspace authority and a separate human approver | Run it once after a batch changes any campaign input. Do not split one campaign-input batch across campaigns. |
| `perfect-live` | Maintainer with sacrificial-workspace authority | Run it ad hoc when a change needs live proof or before a release or handoff that claims live readiness. |
| `NPM_TOKEN` rotation | Maintainer with npm publish and GitHub secret access | Rotate the automation token after each npm publication. Never put the token in a receipt. |
| Release tag push | Release maintainer with explicit approval | Follow the [release support policy](./release-support-policy.md). Push the SDK tag first. Wait for its registry and attestation proof before you push a CLI or MCP tag. Never publish from a laptop. |

## Sandbox key rotation

This procedure changes an external credential. A human who has access to the
Clockify sandbox and the repository secrets must do it.

1. Create or rotate a replacement key with the provider-supported Clockify account
   controls for the same sacrificial workspace. If create and revoke are separate
   actions, keep the exposed key only until the replacement is installed and proven.
2. Run `gh secret set CLOCKIFY_API_KEY` in the repository. Paste the new key only
   into the protected prompt.
3. Run `gh workflow run sandbox-key-health.yml`. Copy the exact run URL that the
   command returns. Set `RUN_ID` to the numeric final segment of that URL.
   Stop if the command does not return a run URL. Do not select the latest workflow run.
4. Run `gh run view RUN_ID --json event,headBranch,headSha,createdAt,url`. Confirm
   that the URL matches the returned URL, the event is `workflow_dispatch`, and
   `createdAt` is after the secret update.
5. Run `gh run watch RUN_ID --exit-status`.
6. Run `gh run view RUN_ID --log`. Require the exact live-probe marker
   `sandbox-key-health: OK status=200`. A green run that reports missing secrets is
   a clean skip, not key proof. The marker proves key authentication only. It does
   not prove workspace selection or old-key revocation.
7. If the exposed key is still active, revoke it now in Clockify.
8. Record the rotation and revocation dates and the proven run URL. Do not record
   either key. Do not close the rotation task if the marker is absent or the old
   key is still active.

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

## Live-evidence campaign approval and import

Use this procedure only after all campaign-input edits in the batch are stable. The
campaign and import scripts fail closed if an input, artifact, or approval changes.

1. Set `CLOCKIFY_API_KEY` and `CLOCKIFY_WORKSPACE_ID` for the sacrificial sandbox.
   Set `CLOCKIFY_LIVE_WORKSPACE_CONFIRM` to the same workspace ID. Never print
   these values.
2. Run `make live-evidence-campaign`. It writes the manifest and campaign-receipt
   candidates under `scripts/live/.manifest-work/` and prints both SHA-256 values.
3. Inspect the candidates, the cleanup result, and the printed hashes. Stop if the
   campaign did not finish or cleanup is not complete.
4. A human approver must update `docs/live-evidence-approval.json` with both exact
   hashes, the approver identity, and an `approvedAt` time after campaign completion.
5. Replace the two uppercase SHA-256 placeholders below with the values that the
   campaign printed. Then import the exact approved files:

   ```bash
   node scripts/import-live-evidence-manifest.mjs \
     --source scripts/live/.manifest-work/live-evidence-manifest.candidate.json \
     --sha256 MANIFEST_SHA256 \
     --campaign-receipt scripts/live/.manifest-work/live-evidence-campaign-receipt.candidate.json \
     --campaign-sha256 CAMPAIGN_RECEIPT_SHA256 \
     --approval docs/live-evidence-approval.json
   ```

6. Run `node scripts/record-live-evidence-currentness.mjs`.
7. Run `make live-evidence-currentness`. Keep the campaign, approval, import, and
   currentness outputs in the handoff receipt. Never include raw credentials or
   workspace data.

## Release rehearsal procedure

1. Confirm `docs/risk-register.md` has no unowned open release blocker.
2. Run package gates for SDK, CLI, and MCP when verification is allowed.
3. Run `make pack-smoke` to test tarballs in clean consumer projects.
4. Keep npm publication disabled by default; do not touch release workflow or
   auth without explicit maintainer approval.
5. Capture command receipts only from real command output.

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

Every receipt must state what actually happened. If a run stops because of
`ENOSPC`, another error, or an unfinished gate, record the partial completion and
the remaining work. For each proving gate, record the exact command, the
tested commit SHA, the exit status, and retained output or a workflow run URL. A later
zero exit after `make -k` is not proof that an earlier failed target passed.
