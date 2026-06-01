# Operator Onboarding

Use this when you are maintaining or evaluating the repo rather than developing
a single feature. The goal is to get from a fresh checkout to the right proof
path without guessing which package, gate, or safety boundary applies.

## First five minutes

1. Read `AGENTS.md` for the repo contract and generated-path rules.
2. Read `docs/quality-gates.md` for the command map.
3. Read `docs/install-personas.md` to choose SDK, CLI, or MCP usage.
4. Read `docs/developer-environment-policy.md` before installing packages.
5. Read `docs/live-tests.md` before any command that can touch Clockify state.
6. When final readiness, support, or release handoff is involved, generate a
   support bundle and inspect its `readinessContext` before escalating.
7. When setup, auth, runtime, or support handoff is the problem, start with
   `node scripts/plan.mjs workflow --workflow first-run-support` so the path
   stays no-network and preserves `safeCommandHints`.

## Choose the path

| Goal | Start here | Proof path |
|---|---|---|
| Use the SDK from code | `wrapper/README.md` and the SDK user path in `docs/install-personas.md` | `make package-contract`, `make sdk-public-api`, then package gates when validation is allowed. |
| Use terminal commands | `cli/README.md` and the CLI user path in `docs/install-personas.md` | `make cli-contract`, `make cli-write-safety`, then CLI package gates when validation is allowed. |
| Use agent workflows | `mcp/README.md` and the MCP user path in `docs/install-personas.md` | `make mcp-contract`, `make mcp-write-safety`, then MCP package gates when validation is allowed. |
| Diagnose first-run setup or support handoff | `docs/quickstart-receipt.md`, `docs/workflow-cookbook.md`, and `node scripts/plan.mjs workflow --workflow first-run-support` | `make quickstart-receipt`, `make diagnostics`, `make support-bundle`, `make workflow-cookbook`, and `make acceptance-scenarios` when validation is allowed. |
| Test without credentials | `make mock-clockify` plus `CLOCKIFY_BASE_URL` or SDK `environment` override | `make mock-contract` and acceptance scenarios. |
| Prove broad readiness | `docs/release-readiness-checklist.md` | `make enterprise-audit`, `make perfect-fast`, `make perfect-full`, performance receipts, completed live sandbox proof, command receipts, enterprise audit. |

Broad readiness receipts must paste command evidence with `Exit status: 0` and `Result: passed` in every final success section. A prose success summary is not enough for `make release-readiness`.

## Readiness context

`node scripts/create-support-bundle.mjs --output /tmp/clockify-support-bundle.json`
creates a no-network `readinessContext` summary for handoff and support. For
full readiness work, inspect these fields before claiming progress or asking a
weaker agent to continue:

- `finalBlockingSignalIds` from the enterprise goal status report.
- `blockingSignalIds` from the release-readiness report.
- `riskRoutingSummary` from the risk-status report.
- `orderedProofChainCoverage` from the contract-inventory report.

If those fields are missing, treat the support packet as incomplete. Do not
replace them with a prose summary; the point is to preserve machine-readable
blockers and proof-order ownership.
## Generate a local plan

For a goal-specific path, run:

```bash
node scripts/plan.mjs onboarding --goal sdk
node scripts/plan.mjs onboarding --goal cli
node scripts/plan.mjs onboarding --goal mcp
node scripts/plan.mjs onboarding --goal mock
node scripts/plan.mjs onboarding --goal live
node scripts/plan.mjs onboarding --goal full
node scripts/plan.mjs onboarding --goal support
```

Use `--format json` when another tool needs to capture the plan. The generator
is no-network and static, and `make operator-onboarding` shape-checks the
generated all-goals plan for no-network, no-command, no-env, no-secret, and
no-workspace-ID posture. It does not run Git, npm, Docker, Fern, tests, builds,
or Clockify API calls. Treat it as a map, not proof.

## Safe bootstrap sequence

The repo uses npm workspaces from the root `package.json`. Install once from
the root, generate the SDK once, then run the package gates that match your
work.

```bash
npm ci
make sdk-codegen
npm run build -w clockify-sdk-ts-115
npm run build -w @clockify115/cli
npm run build -w @clockify115/mcp-server
```

Only regenerate the canonical OpenAPI snapshot when the GOCLMCP sibling repo
exists at `../GOCLMCP` or an explicitly documented equivalent path.

## Mock versus live

Use mock/replay first when you only need deterministic local behavior:

```bash
make mock-clockify
```

Use live proof only with a sacrificial Clockify sandbox. Never use a customer
workspace for proof, demos, or cleanup experiments. If live credentials are not
available, record a concrete deferral in the final proof receipt instead of
quietly treating mock proof as live proof.

## Stop conditions

Stop and escalate instead of continuing when:

- A change wants to edit `spec/corrected/**`, `output/ts-sdk/**`, or
  `wrapper/src/**` by hand.
- A command would publish to npm, change CI/CD release behavior, alter auth or
  provenance, or use a customer workspace.
- A public SDK export, CLI command, MCP tool, package name, or output envelope is
  being removed or renamed without the breaking-change review path.
- A support report needs real secrets, raw customer payloads, browser cookies,
  invoice lines, expense receipts, or webhook shared secrets.

## Readiness boundaries

- Environment readiness means the local tools and package installs are usable.
- Package readiness means SDK, CLI, and MCP package gates and pack smoke are
  green.
- Product readiness means final proof has real receipts, calibrated performance
  budgets, completed live sandbox proof, no blocking residual risks, temporary
  context removal, and final audit success.

Do not collapse these levels. A green local build is not a release claim.
