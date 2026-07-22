# Task 24 — time-off balance adjustment

## Scope and head

Task 24 started from
`7c6cd78a51a724f3a473f1d56b9d0a2a49ca9793`. The receipt-bearing
implementation commit is `SELF`: this file is committed atomically with the
tool, tests, generated surfaces, and lifecycle projections.

The shipped surface is one business-write MCP domain tool,
`clockify_time_off_balances_update`. It does not add delta arithmetic, a CLI
mirror, custom HTTP, generated/OpenAPI edits, rollback automation, or a live
workspace mutation.

## Generated request and replacement contract

- Operation: `updateBalance`
- SDK call: `client.balances.update(request)`
- HTTP operation: `PATCH /workspaces/{workspaceId}/time-off/balance/policy/{policyId}`
- Request: `ClockifyApi.UpdateBalancesRequest`
- Exact flattened request:
  `{ workspaceId: string; policyId: string; note: string; userIds: string[]; value: number }`
- Response: `void` / HTTP 204

The production request is constructed directly with `satisfies`; no request
cast, `body` envelope, custom transport, `delta`, or `amount` field exists. The
generated `value` is exposed only as the new replacement balance in the
selected policy's configured unit. The tool does not guess or convert that unit.

## Resolution, confirmation, and response safety

Preview resolves the policy name or ID first. It then resolves every user ID,
exact name, exact case-insensitive email, or `me` through the workspace-user
list with `verifyIds:true`; a supplied 24-hex ID is therefore verified instead
of trusted. Ambiguous and unknown users return a grounded `userIds`
clarification without a token or PATCH. An unknown policy preserves the shared
resolver error behavior.

The `business_write` guard stores the exact resolved preview. Confirmation
executes that stored `ClockifyApi.UpdateBalancesRequest` without a second policy
or user lookup. Deterministic tests prove bare and combined-control rejection;
policy, user-list, value, and note tamper rejection; workspace binding; expiry;
one-use replay; and exactly one PATCH on valid confirmation. Simulated 402,
403, and 404 responses produce stable non-retry recovery with no automatic
retry.

Because the endpoint returns no balance rows, execution reports only
`{ updated:true, policyId, userIds, value }`, affected-user metadata, and a
populated `time_off_balance_adjustment` update receipt. It omits the audit note
and offers `clockify_time_off_balances_list` as the explicit read-back action;
it does not pretend that each resulting user balance was independently verified.

## TDD and deterministic proof

The initial tracer test failed because the tool was not registered. The minimal
risk registration and tool implementation made it green; focused contract cases
then pinned request shape, coercion, resolution, confirmation security,
redaction, recovery, and `tools/list` metadata.

```text
npm test -w @apet97/clockify-mcp-115 -- tests/time-off-balances-update.test.ts tests/time-off-resolve.test.ts tests/time-off-policies.test.ts tests/server.test.ts tests/tool-risk.test.ts tests/tool-manifest.test.ts tests/confirmation-store.test.ts
exit 0: 7 files; 106 tests passed.

npm run lint -w @apet97/clockify-mcp-115
npm run type-check -w @apet97/clockify-mcp-115
exit 0 for both commands.

make mcp-tool-manifest operation-parity product-surface readme-tables
exit 0: manifest, parity, product surface, and README tables regenerated.

make mcp-tool-manifest-drift operation-parity-drift mcp-contract mcp-agent-ux mcp-write-safety consumer-cast-budget docs-counts readme-tables-drift product-surface-drift
exit 0: 143-tool contracts; 143/58/18 write-safety summary; CLI 0/MCP 0 request casts and 0/0 exceptions; docs counts 143 = 22 + 121.

CLOCKIFY_API_KEY='' CLOCKIFY_WORKSPACE_ID='' CLOCKIFY_LIVE_CONFIRM='' CLOCKIFY_LIVE_PREFIX='' npm test -w @apet97/clockify-mcp-115
exit 0: 66 files passed, 1 live file skipped; 756 tests passed, 12 live tests skipped. The intentional missing-annotation negative fixture printed its expected synthetic 144-tool failure diagnostics inside the passing test.

npm run build -w @apet97/clockify-mcp-115
exit 0

npm pack --dry-run -w @apet97/clockify-mcp-115
exit 0: apet97-clockify-mcp-115-0.6.2.tgz; 109 files; 112.8 kB packed, 584.2 kB unpacked.
```

## Surface receipt

- Tools: 143 total = 22 workflow/orientation + 121 domain.
- Risk distribution: read 59, routine write 26, business write 31, external
  side effect 5, privileged 4, destructive 18.
- Guarded tools: 58.
- Time-off domain group: 13 tools.
- Operation parity: generated `updateBalance` maps to
  `clockify_time_off_balances_update` under the established time-off balance group.
- Remaining lifecycle blocker: two independent approvals (0/2 recorded).

## Live-proof disposition

No live balance adjustment ran. A real adjustment changes leave entitlement,
and no explicit sacrificial-sandbox authorization or restore plan was in scope.
The sole full MCP run used explicitly blank credentials and live-confirm
variables. No local mutation/Stryker command, push, tag, publish, release, or
CI/security setting change occurred.

## Independent approval closeout

Two independent reviewers returned **APPROVE** for specification compliance
and code quality over the frozen range
`7c6cd78a51a724f3a473f1d56b9d0a2a49ca9793..444b0d2d9b31553833cc52bc513d945016627604`.
Task 24 is complete at `2/2` approvals with no remaining findings. This
closeout commit is evidence-only and is not part of the substantive reviewed
implementation range. Task 25 may start; Task 1 and the roadmap remain open.
