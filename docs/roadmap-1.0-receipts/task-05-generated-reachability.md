# Task 5 Receipt — Generated Operation Reachability

Date: 2026-07-19

## Truth model

The canonical local codegen receipt at `output/ts-sdk/codegen-receipt.json`
contains 169 generated operations. `scripts/generate-operation-parity.mjs`
derives every SDK group, method, and `client.<group>.<method>` path from that
receipt instead of inferring generated reachability from OpenAPI stamps or
historical Fern metadata.

The governed split is exact:

- 169 generated SDK operations = 155 explicitly named + 14 operationId-derived.
- `docs/operation-dispositions.json` contains all 169 operations exactly once,
  with HTTP method/path, generated group/method/client path, reachability,
  naming class, and applicable existing evidence identifiers.
- `docs/sdk-operation-naming-classifications.json` governs the expected
  generated group/method for all 14 derived methods; it contains no evidence
  policy.
- `docs/operation-evidence-map.json` separately governs existing discrepancy
  anchors for any applicable explicit or derived operation. Operations without
  applicable evidence keep an empty list without a fabricated mapping.
- SDK generated reachability remains distinct from the 92 TS MCP exact matches,
  82 GOCLMCP exact matches, and 32 curated parity overrides.

## Governed operationId-derived inventory

| Operation ID | Generated client path |
|---|---|
| `uploadImage` | `client.files.uploadImage` |
| `getCurrentUser` | `client.users.getCurrentUser` |
| `addLimitedUsersWithInfo` | `client.workspaces.addLimitedUsersWithInfo` |
| `generateDetailedReportV1` | `client.expenseReport.generateDetailedReportV1` |
| `changeRecurringPeriod` | `client.scheduling.changeRecurringPeriod` |
| `changeTimeOffRequestStatus` | `client.timeOff.changeTimeOffRequestStatus` |
| `deleteMany` | `client.timeEntries.deleteMany` |
| `filterWorkspaceUsers` | `client.users.filterWorkspaceUsers` |
| `updateUserStatus` | `client.workspaces.updateUserStatus` |
| `updateUserCostRate` | `client.workspaces.updateUserCostRate` |
| `updateUserCustomFieldValue` | `client.users.updateUserCustomFieldValue` |
| `updateUserHourlyRate` | `client.workspaces.updateUserHourlyRate` |
| `findUserTeamManagers` | `client.users.findUserTeamManagers` |
| `getWebhookEventStatusesWithLatestLog` | `client.webhooks.getWebhookEventStatusesWithLatestLog` |

The complete 169-row inventory is the generated disposition artifact; this
receipt does not duplicate those rows as prose.

Operation-level evidence is intentionally independent of naming. In particular,
`scheduling.createRecurring.returns-array-and-publish-is-range-scoped` belongs
to explicit `createRecurringAssignment`, not derived `changeRecurringPeriod`;
explicit `updateInvoice` links both its replacement-semantics and corrected
request-schema discrepancy entries.

## Fail-closed proof

`scripts/generate-operation-parity.test.mjs` uses in-memory fixtures and proves
that the validator rejects:

- the stale 156 explicit / 13 derived expectation;
- a new or renamed derived operation without updated governance;
- an orphaned derived classification;
- duplicate or missing disposition rows;
- receipt/artifact count mismatch;
- an unsuccessful receipt, duplicate/missing receipt operations, or method/path
  drift;
- an explicit operation classified as derived or a derived operation
  classified as explicit; and
- embedded naming evidence, orphan/unknown/duplicate evidence mappings, or
  disposition/evidence mismatch; and
- any departure from all 169 operations appearing exactly once.

The regular `operation-parity` writer and `operation-parity-drift` checker use
only canonical repository paths. Ambient environment variables cannot redirect
them to fixtures.

## Closure proof

```text
node --test scripts/generate-operation-parity.test.mjs
make sdk-codegen sdk-codegen-drift sdk-codegen-test generator-comparison operation-parity operation-parity-drift
make operation-coverage openapi-lint
make risk-register contract-gates
npm run type-check -w clockify-sdk-ts-115
npm run build -w clockify-sdk-ts-115
npm run build:smoke -w clockify-sdk-ts-115
npm pack --dry-run -w clockify-sdk-ts-115
git diff --check
```

`make operation-coverage` owns these negative fixtures and depends on
`operation-parity-drift`, whose generated-input chain creates the ignored local
codegen receipt before either parity or coverage reads it.

No GOCLMCP source, corrected OpenAPI snapshot, generator source, generated or
synced tree was hand-edited. No live Clockify mutation, local Stryker/mutation
run, Task 6 work, tag, version change, publication, release, push, or main
integration was performed.
